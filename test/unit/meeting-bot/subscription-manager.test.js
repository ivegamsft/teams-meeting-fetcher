/**
 * subscription-manager.test.js – Unit tests for Subscription Manager
 *
 * Validates:
 *   • Subscription creation for both user and tenant scopes
 *   • Subscription renewal logic
 *   • Subscription deletion
 *   • Storage integration
 *   • Error handling
 */
'use strict';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockCreateGraphSubscription = jest.fn();
const mockRenewGraphSubscription = jest.fn();
const mockDeleteGraphSubscription = jest.fn();

jest.mock('../../../lambda/meeting-bot/graph-client', () => ({
  createGraphSubscription: mockCreateGraphSubscription,
  renewGraphSubscription: mockRenewGraphSubscription,
  deleteGraphSubscription: mockDeleteGraphSubscription,
}));

const {
  SubscriptionManager,
  SubscriptionType,
  ResourceTemplates,
  DefaultExpiration,
} = require('../../../lambda/meeting-bot/subscription-manager');

// ─── Test Setup ──────────────────────────────────────────────────────────────

describe('SubscriptionManager', () => {
  let manager;
  let mockSaveSession;
  let mockGetSession;
  let mockLogger;
  const mockNotificationUrl = 'https://example.com/notifications';
  const mockLifecycleUrl = 'https://example.com/lifecycle';
  const mockClientState = 'test-client-state-123';

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSaveSession = jest.fn().mockResolvedValue(undefined);
    mockGetSession = jest.fn().mockResolvedValue(null);
    mockLogger = jest.fn();

    manager = new SubscriptionManager({
      notificationUrl: mockNotificationUrl,
      lifecycleUrl: mockLifecycleUrl,
      clientState: mockClientState,
      saveSession: mockSaveSession,
      getSession: mockGetSession,
      logger: mockLogger,
    });
  });

  describe('createSubscription', () => {
    it('should create a tenant-wide transcript subscription', async () => {
      const mockSubscriptionId = 'sub-123';
      const mockExpiration = '2026-02-20T00:00:00Z';
      
      mockCreateGraphSubscription.mockResolvedValue({
        id: mockSubscriptionId,
        expirationDateTime: mockExpiration,
      });

      const config = manager.createSubscriptionConfig(
        SubscriptionType.TENANT,
        ResourceTemplates.TENANT_TRANSCRIPTS,
        'created',
        DefaultExpiration.TRANSCRIPTS,
        { scope: 'tenant-wide' }
      );

      const result = await manager.createSubscription(config);

      expect(mockCreateGraphSubscription).toHaveBeenCalledWith(
        mockNotificationUrl,
        ResourceTemplates.TENANT_TRANSCRIPTS,
        'created',
        DefaultExpiration.TRANSCRIPTS,
        mockClientState,
        mockLifecycleUrl
      );

      expect(result).toMatchObject({
        subscription_id: mockSubscriptionId,
        type: SubscriptionType.TENANT,
        resource: ResourceTemplates.TENANT_TRANSCRIPTS,
        changeType: 'created',
        expiration: mockExpiration,
        status: 'active',
        scope: 'tenant-wide',
      });

      expect(mockLogger).toHaveBeenCalledWith('INFO', 'Creating subscription', expect.any(Object));
      expect(mockLogger).toHaveBeenCalledWith('INFO', 'Subscription created', expect.any(Object));
    });

    it('should create a user-specific transcript subscription', async () => {
      const mockUserId = 'user-456';
      const mockSubscriptionId = 'sub-456';
      const mockExpiration = '2026-02-20T00:00:00Z';
      
      mockCreateGraphSubscription.mockResolvedValue({
        id: mockSubscriptionId,
        expirationDateTime: mockExpiration,
      });

      const config = manager.createSubscriptionConfig(
        SubscriptionType.USER,
        ResourceTemplates.USER_TRANSCRIPTS(mockUserId),
        'created',
        DefaultExpiration.TRANSCRIPTS,
        { scope: 'user-specific', user_id: mockUserId }
      );

      const result = await manager.createSubscription(config);

      expect(mockCreateGraphSubscription).toHaveBeenCalledWith(
        mockNotificationUrl,
        ResourceTemplates.USER_TRANSCRIPTS(mockUserId),
        'created',
        DefaultExpiration.TRANSCRIPTS,
        mockClientState,
        mockLifecycleUrl
      );

      expect(result).toMatchObject({
        subscription_id: mockSubscriptionId,
        type: SubscriptionType.USER,
        resource: ResourceTemplates.USER_TRANSCRIPTS(mockUserId),
        status: 'active',
        scope: 'user-specific',
        user_id: mockUserId,
      });
    });

    it('should handle subscription creation errors', async () => {
      const mockError = new Error('Graph API error');
      mockError.statusCode = 403;
      mockCreateGraphSubscription.mockRejectedValue(mockError);

      const config = manager.createSubscriptionConfig(
        SubscriptionType.TENANT,
        ResourceTemplates.TENANT_TRANSCRIPTS,
        'created',
        DefaultExpiration.TRANSCRIPTS
      );

      await expect(manager.createSubscription(config)).rejects.toThrow('Graph API error');
      
      expect(mockLogger).toHaveBeenCalledWith('ERROR', 'Failed to create subscription', 
        expect.objectContaining({
          error: 'Graph API error',
          statusCode: 403,
        })
      );
    });
  });

  describe('renewSubscription', () => {
    it('should renew an existing subscription', async () => {
      const mockSubscriptionId = 'sub-123';
      const mockExpiration = '2026-02-23T00:00:00Z';
      
      mockRenewGraphSubscription.mockResolvedValue({
        expirationDateTime: mockExpiration,
      });

      const result = await manager.renewSubscription(mockSubscriptionId, 4230);

      expect(mockRenewGraphSubscription).toHaveBeenCalledWith(mockSubscriptionId, 4230);

      expect(result).toMatchObject({
        subscription_id: mockSubscriptionId,
        expiration: mockExpiration,
        status: 'active',
      });

      expect(mockLogger).toHaveBeenCalledWith('INFO', 'Renewing subscription', 
        expect.objectContaining({ subscriptionId: mockSubscriptionId })
      );
      expect(mockLogger).toHaveBeenCalledWith('INFO', 'Subscription renewed', 
        expect.objectContaining({ subscriptionId: mockSubscriptionId })
      );
    });

    it('should handle renewal errors', async () => {
      const mockError = new Error('Subscription not found');
      mockError.statusCode = 404;
      mockRenewGraphSubscription.mockRejectedValue(mockError);

      await expect(manager.renewSubscription('sub-invalid', 4230)).rejects.toThrow('Subscription not found');
      
      expect(mockLogger).toHaveBeenCalledWith('ERROR', 'Failed to renew subscription', 
        expect.objectContaining({
          error: 'Subscription not found',
          statusCode: 404,
        })
      );
    });
  });

  describe('deleteSubscription', () => {
    it('should delete a subscription', async () => {
      const mockSubscriptionId = 'sub-123';
      mockDeleteGraphSubscription.mockResolvedValue(undefined);

      await manager.deleteSubscription(mockSubscriptionId);

      expect(mockDeleteGraphSubscription).toHaveBeenCalledWith(mockSubscriptionId);
      expect(mockLogger).toHaveBeenCalledWith('INFO', 'Deleting subscription', 
        expect.objectContaining({ subscriptionId: mockSubscriptionId })
      );
      expect(mockLogger).toHaveBeenCalledWith('INFO', 'Subscription deleted', 
        expect.objectContaining({ subscriptionId: mockSubscriptionId })
      );
    });

    it('should handle deletion errors', async () => {
      const mockError = new Error('Permission denied');
      mockError.statusCode = 403;
      mockDeleteGraphSubscription.mockRejectedValue(mockError);

      await expect(manager.deleteSubscription('sub-123')).rejects.toThrow('Permission denied');
      
      expect(mockLogger).toHaveBeenCalledWith('ERROR', 'Failed to delete subscription', 
        expect.objectContaining({
          error: 'Permission denied',
          statusCode: 403,
        })
      );
    });
  });

  describe('manageSubscription', () => {
    const storageKey = 'subscription:test';
    const mockConfig = {
      type: SubscriptionType.TENANT,
      resource: ResourceTemplates.TENANT_TRANSCRIPTS,
      changeType: 'created',
      expirationMinutes: 4230,
      notificationUrl: mockNotificationUrl,
      lifecycleUrl: mockLifecycleUrl,
      clientState: mockClientState,
      metadata: { scope: 'tenant-wide' },
    };

    it('should return valid subscription if not expiring', async () => {
      const futureExpiration = new Date(Date.now() + 120 * 60 * 1000).toISOString(); // 2 hours
      const cachedSubscription = {
        subscription_id: 'sub-123',
        type: SubscriptionType.TENANT,
        expiration: futureExpiration,
        status: 'active',
      };

      mockGetSession.mockResolvedValue(cachedSubscription);

      const result = await manager.manageSubscription(storageKey, mockConfig);

      expect(result).toEqual(cachedSubscription);
      expect(mockCreateGraphSubscription).not.toHaveBeenCalled();
      expect(mockRenewGraphSubscription).not.toHaveBeenCalled();
      expect(mockLogger).toHaveBeenCalledWith('INFO', 'Subscription valid', expect.any(Object));
    });

    it('should renew subscription if expiring soon', async () => {
      const soonExpiration = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
      const newExpiration = new Date(Date.now() + 4230 * 60 * 1000).toISOString();
      
      const cachedSubscription = {
        subscription_id: 'sub-123',
        type: SubscriptionType.TENANT,
        expiration: soonExpiration,
        status: 'active',
        resource: ResourceTemplates.TENANT_TRANSCRIPTS,
      };

      mockGetSession.mockResolvedValue(cachedSubscription);
      mockRenewGraphSubscription.mockResolvedValue({
        expirationDateTime: newExpiration,
      });

      const result = await manager.manageSubscription(storageKey, mockConfig);

      expect(mockRenewGraphSubscription).toHaveBeenCalledWith('sub-123', 4230);
      expect(mockSaveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          meeting_id: storageKey,
          subscription_id: 'sub-123',
          expiration: newExpiration,
          status: 'active',
        })
      );
      expect(result.expiration).toBe(newExpiration);
    });

    it('should create new subscription if renewal fails', async () => {
      const soonExpiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const newExpiration = new Date(Date.now() + 4230 * 60 * 1000).toISOString();
      
      const cachedSubscription = {
        subscription_id: 'sub-old',
        type: SubscriptionType.TENANT,
        expiration: soonExpiration,
        status: 'active',
      };

      mockGetSession.mockResolvedValue(cachedSubscription);
      mockRenewGraphSubscription.mockRejectedValue(new Error('Subscription expired'));
      mockCreateGraphSubscription.mockResolvedValue({
        id: 'sub-new',
        expirationDateTime: newExpiration,
      });

      const result = await manager.manageSubscription(storageKey, mockConfig);

      expect(mockRenewGraphSubscription).toHaveBeenCalled();
      expect(mockCreateGraphSubscription).toHaveBeenCalled();
      expect(result.subscription_id).toBe('sub-new');
      expect(mockLogger).toHaveBeenCalledWith('WARN', 'Renewal failed, will recreate', expect.any(Object));
    });

    it('should create new subscription if none exists', async () => {
      const newExpiration = new Date(Date.now() + 4230 * 60 * 1000).toISOString();
      
      mockGetSession.mockResolvedValue(null);
      mockCreateGraphSubscription.mockResolvedValue({
        id: 'sub-new',
        expirationDateTime: newExpiration,
      });

      const result = await manager.manageSubscription(storageKey, mockConfig);

      expect(mockCreateGraphSubscription).toHaveBeenCalled();
      expect(mockSaveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          meeting_id: storageKey,
          subscription_id: 'sub-new',
          status: 'active',
        })
      );
      expect(result.subscription_id).toBe('sub-new');
    });
  });

  describe('helper methods', () => {
    it('should manage tenant transcript subscription', async () => {
      const mockExpiration = '2026-02-23T00:00:00Z';
      mockGetSession.mockResolvedValue(null);
      mockCreateGraphSubscription.mockResolvedValue({
        id: 'sub-tenant',
        expirationDateTime: mockExpiration,
      });

      const result = await manager.manageTenantTranscriptSubscription();

      expect(mockCreateGraphSubscription).toHaveBeenCalledWith(
        mockNotificationUrl,
        ResourceTemplates.TENANT_TRANSCRIPTS,
        'created',
        DefaultExpiration.TRANSCRIPTS,
        mockClientState,
        mockLifecycleUrl
      );
      expect(result.type).toBe(SubscriptionType.TENANT);
      expect(result.resource).toBe(ResourceTemplates.TENANT_TRANSCRIPTS);
    });

    it('should manage user transcript subscription', async () => {
      const userId = 'user-123';
      const mockExpiration = '2026-02-23T00:00:00Z';
      mockGetSession.mockResolvedValue(null);
      mockCreateGraphSubscription.mockResolvedValue({
        id: 'sub-user',
        expirationDateTime: mockExpiration,
      });

      const result = await manager.manageUserTranscriptSubscription(userId);

      expect(mockCreateGraphSubscription).toHaveBeenCalledWith(
        mockNotificationUrl,
        ResourceTemplates.USER_TRANSCRIPTS(userId),
        'created',
        DefaultExpiration.TRANSCRIPTS,
        mockClientState,
        mockLifecycleUrl
      );
      expect(result.type).toBe(SubscriptionType.USER);
      expect(result.user_id).toBe(userId);
    });

    it('should manage user calendar subscription', async () => {
      const userId = 'user-456';
      const mockExpiration = '2026-02-23T00:00:00Z';
      mockGetSession.mockResolvedValue(null);
      mockCreateGraphSubscription.mockResolvedValue({
        id: 'sub-calendar',
        expirationDateTime: mockExpiration,
      });

      const result = await manager.manageUserCalendarSubscription(userId);

      expect(mockCreateGraphSubscription).toHaveBeenCalledWith(
        mockNotificationUrl,
        ResourceTemplates.USER_CALENDAR(userId),
        'created,updated,deleted',
        DefaultExpiration.CALENDAR,
        mockClientState,
        mockLifecycleUrl
      );
      expect(result.type).toBe(SubscriptionType.USER);
      expect(result.resource_type).toBe('calendar');
    });

    it('should manage group calendar subscription', async () => {
      const groupId = 'group-789';
      const mockExpiration = '2026-02-23T00:00:00Z';
      mockGetSession.mockResolvedValue(null);
      mockCreateGraphSubscription.mockResolvedValue({
        id: 'sub-group',
        expirationDateTime: mockExpiration,
      });

      const result = await manager.manageGroupCalendarSubscription(groupId);

      expect(mockCreateGraphSubscription).toHaveBeenCalledWith(
        mockNotificationUrl,
        ResourceTemplates.GROUP_CALENDAR(groupId),
        'created,updated,deleted',
        DefaultExpiration.CALENDAR,
        mockClientState,
        mockLifecycleUrl
      );
      expect(result.type).toBe(SubscriptionType.TENANT);
      expect(result.group_id).toBe(groupId);
    });
  });

  describe('getSubscriptionDetails', () => {
    it('should return subscription details from storage', async () => {
      const storageKey = 'subscription:test';
      const mockSubscription = {
        subscription_id: 'sub-123',
        type: SubscriptionType.TENANT,
        status: 'active',
      };

      mockGetSession.mockResolvedValue(mockSubscription);

      const result = await manager.getSubscriptionDetails(storageKey);

      expect(result).toEqual(mockSubscription);
      expect(mockGetSession).toHaveBeenCalledWith(storageKey);
    });

    it('should return null if subscription not found', async () => {
      mockGetSession.mockResolvedValue(null);

      const result = await manager.getSubscriptionDetails('non-existent');

      expect(result).toBeNull();
    });

    it('should return null if subscription has no ID', async () => {
      mockGetSession.mockResolvedValue({ status: 'active' });

      const result = await manager.getSubscriptionDetails('invalid');

      expect(result).toBeNull();
    });
  });
});
