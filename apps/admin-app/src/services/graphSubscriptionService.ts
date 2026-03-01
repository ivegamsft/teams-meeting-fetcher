import { v4 as uuidv4 } from 'uuid';
import { getGraphClient } from '../config/graph';
import { config } from '../config';
import { Subscription, SubscriptionType, CreateSubscriptionRequest } from '../models';
import { subscriptionStore } from './subscriptionStore';
import { configStore } from './configStore';

function getEventHubNotificationUrl(): string {
  const ns = config.eventhub.namespace.includes('.servicebus.windows.net')
    ? config.eventhub.namespace
    : `${config.eventhub.namespace}.servicebus.windows.net`;
  return `EventHub:https://${ns}/eventhubname/${config.eventhub.name}?tenantId=${config.eventhub.tenantDomain}`;
}

const TENANT_WIDE_RESOURCES: Record<string, { resource: string; changeType: string }> = {
  callRecords: { resource: '/communications/callRecords', changeType: 'created' },
  transcripts: { resource: 'communications/onlineMeetings/getAllTranscripts', changeType: 'created' },
  recordings: { resource: 'communications/onlineMeetings/getAllRecordings', changeType: 'created' },
};

// Max expiration in minutes by subscription type
const MAX_EXPIRATION_MINUTES: Record<SubscriptionType, number> = {
  calendar: 10070,
  callRecords: 4230,
  transcripts: 4230,
  recordings: 4230,
};

export const graphSubscriptionService = {
  async createSubscription(request: CreateSubscriptionRequest): Promise<Subscription> {
    const client = getGraphClient();
    const clientState = uuidv4();

    const resource = request.resource || `/users/${request.userId}/events`;
    const changeType = request.changeType || 'created,updated,deleted';
    const subscriptionType: SubscriptionType = request.subscriptionType || 'calendar';

    const maxMinutes = MAX_EXPIRATION_MINUTES[subscriptionType];
    const expirationDate = new Date();
    expirationDate.setTime(expirationDate.getTime() + maxMinutes * 60 * 1000);

    const notificationUrl = getEventHubNotificationUrl();

    const graphSubscription = await client.api('/subscriptions').post({
      changeType,
      notificationUrl,
      resource,
      expirationDateTime: expirationDate.toISOString(),
      clientState,
    });

    const now = new Date().toISOString();
    const renewalReminder = new Date(expirationDate);
    renewalReminder.setDate(renewalReminder.getDate() - 1);

    const subscription: Subscription = {
      subscription_id: graphSubscription.id,
      subscriptionType,
      userId: request.userId,
      userEmail: request.userEmail,
      userDisplayName: request.userDisplayName,
      resource,
      changeType,
      notificationUrl,
      clientState,
      expirationDateTime: graphSubscription.expirationDateTime,
      renewalReminderAt: renewalReminder.toISOString(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await subscriptionStore.put(subscription);
    return subscription;
  },

  async createTenantSubscription(type: SubscriptionType): Promise<Subscription> {
    const resourceConfig = TENANT_WIDE_RESOURCES[type];
    if (!resourceConfig) {
      throw new Error(`Unsupported tenant-wide subscription type: ${type}`);
    }

    return this.createSubscription({
      userId: 'tenant',
      userEmail: '',
      userDisplayName: 'Tenant-wide',
      resource: resourceConfig.resource,
      changeType: resourceConfig.changeType,
      subscriptionType: type,
    });
  },

  async renewSubscription(id: string): Promise<Subscription> {
    const client = getGraphClient();

    // Look up subscription to determine type-specific max expiration
    const existing = await subscriptionStore.get(id);
    const subscriptionType: SubscriptionType = existing?.subscriptionType || 'calendar';
    const maxMinutes = MAX_EXPIRATION_MINUTES[subscriptionType];

    const expirationDate = new Date();
    expirationDate.setTime(expirationDate.getTime() + maxMinutes * 60 * 1000);

    const updated = await client.api(`/subscriptions/${id}`).patch({
      expirationDateTime: expirationDate.toISOString(),
    });

    await subscriptionStore.updateExpiry(id, updated.expirationDateTime);

    const subscription = await subscriptionStore.get(id);
    if (!subscription) throw new Error(`Subscription ${id} not found after renewal`);
    return subscription;
  },

  async deleteSubscription(id: string): Promise<void> {
    const client = getGraphClient();

    try {
      await client.api(`/subscriptions/${id}`).delete();
    } catch (err: any) {
      if (err.statusCode !== 404) throw err;
    }

    await subscriptionStore.delete(id);
  },

  async listSubscriptions(): Promise<Subscription[]> {
    return subscriptionStore.listAll();
  },

  async getSubscription(id: string): Promise<Subscription | null> {
    return subscriptionStore.get(id);
  },

  async syncGroupMembers(): Promise<{ added: Subscription[]; removed: string[] }> {
    const client = getGraphClient();
    const monitoredGroups = await configStore.getMonitoredGroups();

    if (monitoredGroups.length === 0) {
      throw new Error('No monitored groups configured. Add groups in Settings first.');
    }

    // Collect all members across monitored groups
    const allMembers = new Map<string, any>();
    for (const group of monitoredGroups) {
      try {
        const membersResponse = await client.api(`/groups/${group.groupId}/members`).get();
        for (const member of (membersResponse.value || [])) {
          if (!allMembers.has(member.id)) {
            allMembers.set(member.id, member);
          }
        }
      } catch (err: any) {
        console.error(`Failed to fetch members for group ${group.displayName}:`, err.message);
      }
    }

    const existingSubscriptions = await subscriptionStore.listAll();
    const existingUserIds = new Set(existingSubscriptions.map((s: Subscription) => s.userId));

    const added: Subscription[] = [];
    for (const [memberId, member] of allMembers) {
      if (!existingUserIds.has(memberId)) {
        try {
          const sub = await this.createSubscription({
            userId: member.id,
            userEmail: member.mail || member.userPrincipalName,
            userDisplayName: member.displayName,
          });
          added.push(sub);
        } catch (err: any) {
          console.error(`Failed to subscribe ${member.displayName}:`, err.message);
        }
      }
    }

    // Remove subscriptions for users no longer in any monitored group
    // Skip tenant-wide subscriptions (userId === 'tenant')
    const removed: string[] = [];
    for (const sub of existingSubscriptions) {
      if (sub.userId === 'tenant') continue;
      if (!allMembers.has(sub.userId)) {
        try {
          await this.deleteSubscription(sub.subscription_id);
          removed.push(sub.userId);
        } catch (err: any) {
          console.error(`Failed to remove subscription for ${sub.userEmail}:`, err.message);
        }
      }
    }

    return { added, removed };
  },
};
