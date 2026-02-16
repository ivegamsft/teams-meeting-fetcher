/**
 * Unified subscription management for Microsoft Graph API subscriptions.
 * Handles both user-specific and tenant-wide subscriptions with a consistent interface.
 */
'use strict';

const graph = require('./graph-client');

/**
 * Subscription types supported by the manager
 */
const SubscriptionType = {
  USER: 'user',
  TENANT: 'tenant',
};

/**
 * Resource templates for different subscription types
 */
const ResourceTemplates = {
  // User-specific transcript subscription
  USER_TRANSCRIPTS: (userId) =>
    `users/${userId}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='${userId}')`,
  
  // Tenant-wide transcript subscription (all meetings)
  TENANT_TRANSCRIPTS: 'communications/onlineMeetings/getAllTranscripts',
  
  // Tenant-wide meeting started subscription
  TENANT_MEETINGS: 'communications/onlineMeetings',
  
  // User calendar events
  USER_CALENDAR: (userId) => `users/${userId}/events`,
  
  // Group calendar events
  GROUP_CALENDAR: (groupId) => `groups/${groupId}/events`,
};

/**
 * Default subscription expiration times (in minutes)
 */
const DefaultExpiration = {
  TRANSCRIPTS: 4230, // ~3 days (Graph limit for transcript subscriptions)
  MEETINGS: 4230, // ~3 days
  CALENDAR: 4230, // ~3 days
};

/**
 * Subscription Manager Class
 * Provides a unified interface for managing Graph API subscriptions
 */
class SubscriptionManager {
  /**
   * Create a new SubscriptionManager
   * @param {Object} options - Configuration options
   * @param {string} options.notificationUrl - Webhook endpoint for notifications
   * @param {string} options.lifecycleUrl - Webhook endpoint for lifecycle events
   * @param {string} options.clientState - Secret for validating notifications
   * @param {Function} options.saveSession - Function to save subscription state to storage
   * @param {Function} options.getSession - Function to retrieve subscription state from storage
   * @param {Function} options.logger - Optional logger function
   */
  constructor(options) {
    this.notificationUrl = options.notificationUrl;
    this.lifecycleUrl = options.lifecycleUrl;
    this.clientState = options.clientState;
    this.saveSession = options.saveSession;
    this.getSession = options.getSession;
    this.log = options.logger || console.log;
  }

  /**
   * Create a subscription configuration object
   * @param {string} type - Subscription type (USER or TENANT)
   * @param {string} resource - Graph resource to subscribe to
   * @param {string} changeType - Change types to monitor (e.g., 'created')
   * @param {number} expirationMinutes - Subscription lifetime in minutes
   * @param {Object} metadata - Additional metadata to store with the subscription
   * @returns {Object} Subscription configuration
   */
  createSubscriptionConfig(type, resource, changeType, expirationMinutes, metadata = {}) {
    return {
      type,
      resource,
      changeType,
      expirationMinutes,
      notificationUrl: this.notificationUrl,
      lifecycleUrl: this.lifecycleUrl,
      clientState: this.clientState,
      metadata,
    };
  }

  /**
   * Create a new subscription in Microsoft Graph
   * @param {Object} config - Subscription configuration
   * @returns {Promise<Object>} Created subscription with id and expiration
   */
  async createSubscription(config) {
    this.log('INFO', 'Creating subscription', {
      type: config.type,
      resource: config.resource,
      changeType: config.changeType,
    });

    try {
      const result = await graph.createGraphSubscription(
        config.notificationUrl,
        config.resource,
        config.changeType,
        config.expirationMinutes,
        config.clientState,
        config.lifecycleUrl
      );

      const subscriptionData = {
        subscription_id: result.id,
        type: config.type,
        resource: config.resource,
        changeType: config.changeType,
        expiration: result.expirationDateTime,
        client_state: config.clientState,
        notification_url: config.notificationUrl,
        lifecycle_url: config.lifecycleUrl,
        status: 'active',
        created_at: new Date().toISOString(),
        ...config.metadata,
      };

      this.log('INFO', 'Subscription created', {
        subscriptionId: result.id,
        type: config.type,
        expiresAt: result.expirationDateTime,
      });

      return subscriptionData;
    } catch (err) {
      this.log('ERROR', 'Failed to create subscription', {
        type: config.type,
        resource: config.resource,
        error: err.message,
        statusCode: err.statusCode,
      });
      throw err;
    }
  }

  /**
   * Renew an existing subscription
   * @param {string} subscriptionId - ID of the subscription to renew
   * @param {number} expirationMinutes - New lifetime in minutes
   * @returns {Promise<Object>} Renewed subscription data
   */
  async renewSubscription(subscriptionId, expirationMinutes) {
    this.log('INFO', 'Renewing subscription', {
      subscriptionId,
      expirationMinutes,
    });

    try {
      const result = await graph.renewGraphSubscription(subscriptionId, expirationMinutes);

      this.log('INFO', 'Subscription renewed', {
        subscriptionId,
        newExpiration: result.expirationDateTime,
      });

      return {
        subscription_id: subscriptionId,
        expiration: result.expirationDateTime,
        status: 'active',
        renewed_at: new Date().toISOString(),
      };
    } catch (err) {
      this.log('ERROR', 'Failed to renew subscription', {
        subscriptionId,
        error: err.message,
        statusCode: err.statusCode,
      });
      throw err;
    }
  }

  /**
   * Delete a subscription
   * @param {string} subscriptionId - ID of the subscription to delete
   * @returns {Promise<void>}
   */
  async deleteSubscription(subscriptionId) {
    this.log('INFO', 'Deleting subscription', { subscriptionId });

    try {
      await graph.deleteGraphSubscription(subscriptionId);

      this.log('INFO', 'Subscription deleted', { subscriptionId });
    } catch (err) {
      this.log('ERROR', 'Failed to delete subscription', {
        subscriptionId,
        error: err.message,
        statusCode: err.statusCode,
      });
      throw err;
    }
  }

  /**
   * Manage a subscription (create if missing, renew if expiring)
   * @param {string} storageKey - Key for storing subscription state
   * @param {Object} config - Subscription configuration
   * @param {number} renewThresholdMinutes - Renew if expiring within this many minutes (default: 60)
   * @returns {Promise<Object>} Current subscription data
   */
  async manageSubscription(storageKey, config, renewThresholdMinutes = 60) {
    try {
      const cached = await this.getSession(storageKey);

      if (cached && cached.subscription_id && cached.status === 'active') {
        // Check if still valid (renew if expires within threshold)
        const expiresAt = new Date(cached.expiration).getTime();
        const thresholdTime = Date.now() + renewThresholdMinutes * 60 * 1000;

        if (expiresAt > thresholdTime) {
          this.log('INFO', 'Subscription valid', {
            subscriptionId: cached.subscription_id,
            type: cached.type,
            expiresIn: Math.round((expiresAt - Date.now()) / 60000) + ' min',
          });
          return cached;
        }

        // Try to renew
        this.log('INFO', 'Subscription expiring soon, renewing', {
          subscriptionId: cached.subscription_id,
          type: cached.type,
        });

        try {
          const renewedData = await this.renewSubscription(
            cached.subscription_id,
            config.expirationMinutes
          );

          const updatedData = {
            ...cached,
            ...renewedData,
          };

          await this.saveSession({
            meeting_id: storageKey,
            ...updatedData,
          });

          return updatedData;
        } catch (renewErr) {
          this.log('WARN', 'Renewal failed, will recreate', {
            subscriptionId: cached.subscription_id,
            error: renewErr.message,
          });
        }
      }

      // Create new subscription
      this.log('INFO', 'Creating new subscription', {
        type: config.type,
        resource: config.resource,
      });

      const subscriptionData = await this.createSubscription(config);

      await this.saveSession({
        meeting_id: storageKey,
        ...subscriptionData,
      });

      return subscriptionData;
    } catch (err) {
      this.log('ERROR', 'Subscription management failed', {
        storageKey,
        type: config.type,
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Create a tenant-wide transcript subscription
   * @param {string} storageKey - Key for storing subscription state
   * @returns {Promise<Object>} Subscription data
   */
  async manageTenantTranscriptSubscription(storageKey = 'subscription:tenant-transcripts') {
    const config = this.createSubscriptionConfig(
      SubscriptionType.TENANT,
      ResourceTemplates.TENANT_TRANSCRIPTS,
      'created',
      DefaultExpiration.TRANSCRIPTS,
      { scope: 'tenant-wide', resource_type: 'transcripts' }
    );

    return this.manageSubscription(storageKey, config);
  }

  /**
   * Create a user-specific transcript subscription
   * @param {string} userId - User ID to subscribe to
   * @param {string} storageKey - Key for storing subscription state
   * @returns {Promise<Object>} Subscription data
   */
  async manageUserTranscriptSubscription(userId, storageKey = `subscription:user-transcripts:${userId}`) {
    const config = this.createSubscriptionConfig(
      SubscriptionType.USER,
      ResourceTemplates.USER_TRANSCRIPTS(userId),
      'created',
      DefaultExpiration.TRANSCRIPTS,
      { scope: 'user-specific', resource_type: 'transcripts', user_id: userId }
    );

    return this.manageSubscription(storageKey, config);
  }

  /**
   * Create a tenant-wide meeting started subscription
   * @param {string} storageKey - Key for storing subscription state
   * @returns {Promise<Object>} Subscription data
   */
  async manageTenantMeetingSubscription(storageKey = 'subscription:tenant-meetings') {
    const config = this.createSubscriptionConfig(
      SubscriptionType.TENANT,
      ResourceTemplates.TENANT_MEETINGS,
      'created',
      DefaultExpiration.MEETINGS,
      { scope: 'tenant-wide', resource_type: 'meetings' }
    );

    return this.manageSubscription(storageKey, config);
  }

  /**
   * Create a user calendar subscription
   * @param {string} userId - User ID or email
   * @param {string} storageKey - Key for storing subscription state
   * @returns {Promise<Object>} Subscription data
   */
  async manageUserCalendarSubscription(userId, storageKey = `subscription:user-calendar:${userId}`) {
    const config = this.createSubscriptionConfig(
      SubscriptionType.USER,
      ResourceTemplates.USER_CALENDAR(userId),
      'created,updated,deleted',
      DefaultExpiration.CALENDAR,
      { scope: 'user-specific', resource_type: 'calendar', user_id: userId }
    );

    return this.manageSubscription(storageKey, config);
  }

  /**
   * Create a group calendar subscription
   * @param {string} groupId - Group ID
   * @param {string} storageKey - Key for storing subscription state
   * @returns {Promise<Object>} Subscription data
   */
  async manageGroupCalendarSubscription(groupId, storageKey = `subscription:group-calendar:${groupId}`) {
    const config = this.createSubscriptionConfig(
      SubscriptionType.TENANT,
      ResourceTemplates.GROUP_CALENDAR(groupId),
      'created,updated,deleted',
      DefaultExpiration.CALENDAR,
      { scope: 'group', resource_type: 'calendar', group_id: groupId }
    );

    return this.manageSubscription(storageKey, config);
  }

  /**
   * List all active subscriptions from storage
   * @param {string} prefix - Optional prefix to filter subscriptions (e.g., 'subscription:')
   * @returns {Promise<Array>} Array of subscription objects
   */
  async listSubscriptions(prefix = 'subscription:') {
    // This is a placeholder - actual implementation depends on storage backend
    // For DynamoDB with scan capability, this would query all items with the prefix
    this.log('INFO', 'Listing subscriptions', { prefix });
    
    // Note: Implementation would need to be adapted based on the storage backend
    // For now, return empty array - this should be implemented by the caller
    // based on their storage strategy
    return [];
  }

  /**
   * Get subscription details from storage
   * @param {string} storageKey - Storage key for the subscription
   * @returns {Promise<Object|null>} Subscription data or null if not found
   */
  async getSubscriptionDetails(storageKey) {
    try {
      const data = await this.getSession(storageKey);
      if (data && data.subscription_id) {
        return data;
      }
      return null;
    } catch (err) {
      this.log('ERROR', 'Failed to get subscription details', {
        storageKey,
        error: err.message,
      });
      return null;
    }
  }
}

module.exports = {
  SubscriptionManager,
  SubscriptionType,
  ResourceTemplates,
  DefaultExpiration,
};
