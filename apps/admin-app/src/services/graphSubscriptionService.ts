import { v4 as uuidv4 } from 'uuid';
import { getGraphClient } from '../config/graph';
import { config } from '../config';
import { Subscription, CreateSubscriptionRequest } from '../models';
import { subscriptionStore } from './subscriptionStore';

export const graphSubscriptionService = {
  async createSubscription(request: CreateSubscriptionRequest): Promise<Subscription> {
    const client = getGraphClient();
    const clientState = config.webhook.clientState || uuidv4();

    const resource = request.resource || `/users/${request.userId}/events`;
    const changeType = request.changeType || 'created,updated,deleted';

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 28);

    const graphSubscription = await client.api('/subscriptions').post({
      changeType,
      notificationUrl: config.webhook.notificationUrl,
      resource,
      expirationDateTime: expirationDate.toISOString(),
      clientState,
    });

    const now = new Date().toISOString();
    const renewalReminder = new Date(expirationDate);
    renewalReminder.setDate(renewalReminder.getDate() - 1);

    const subscription: Subscription = {
      subscription_id: graphSubscription.id,
      userId: request.userId,
      userEmail: request.userEmail,
      userDisplayName: request.userDisplayName,
      resource,
      changeType,
      notificationUrl: config.webhook.notificationUrl,
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

  async renewSubscription(id: string): Promise<Subscription> {
    const client = getGraphClient();
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 28);

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

  async subscribeToGroupMembers(): Promise<Subscription[]> {
    const client = getGraphClient();
    const groupId = config.graph.entraGroupId;

    if (!groupId) throw new Error('ENTRA_GROUP_ID is not configured');

    const membersResponse = await client.api(`/groups/${groupId}/members`).get();
    const members = membersResponse.value || [];
    const existingSubscriptions = await subscriptionStore.listAll();
    const existingUserIds = new Set(existingSubscriptions.map((s: Subscription) => s.userId));

    const newSubscriptions: Subscription[] = [];

    for (const member of members) {
      if (existingUserIds.has(member.id)) continue;

      try {
        const sub = await this.createSubscription({
          userId: member.id,
          userEmail: member.mail || member.userPrincipalName,
          userDisplayName: member.displayName,
        });
        newSubscriptions.push(sub);
      } catch (err: any) {
        console.error(`Failed to create subscription for ${member.displayName}:`, err.message);
      }
    }

    return newSubscriptions;
  },

  async syncGroupMembers(): Promise<{ added: Subscription[]; removed: string[] }> {
    const client = getGraphClient();
    const groupId = config.graph.entraGroupId;

    if (!groupId) throw new Error('ENTRA_GROUP_ID is not configured');

    const membersResponse = await client.api(`/groups/${groupId}/members`).get();
    const members = membersResponse.value || [];
    const memberIds = new Set(members.map((m: any) => m.id));

    const existingSubscriptions = await subscriptionStore.listAll();
    const existingUserIds = new Set(existingSubscriptions.map((s: Subscription) => s.userId));

    const added: Subscription[] = [];
    for (const member of members) {
      if (!existingUserIds.has(member.id)) {
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

    const removed: string[] = [];
    for (const sub of existingSubscriptions) {
      if (!memberIds.has(sub.userId)) {
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
