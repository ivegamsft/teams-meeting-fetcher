jest.mock('../../../src/config/graph', () => ({
  getGraphClient: jest.fn(),
}));

jest.mock('../../../src/config', () => ({
  config: {
    graph: { tenantId: 'test-tenant', entraGroupId: 'test-group' },
    webhook: { notificationUrl: 'https://webhook.test', clientState: 'test-state' },
    aws: {
      dynamodb: { subscriptionsTable: 'test-subs' },
    },
  },
}));

jest.mock('../../../src/config/dynamodb', () => ({
  dynamoDb: { send: jest.fn() },
}));

jest.mock('../../../src/services/subscriptionStore', () => ({
  subscriptionStore: {
    put: jest.fn(),
    get: jest.fn(),
    listAll: jest.fn(),
    delete: jest.fn(),
    updateExpiry: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { graphSubscriptionService } from '../../../src/services/graphSubscriptionService';
import { subscriptionStore } from '../../../src/services/subscriptionStore';
import { getGraphClient } from '../../../src/config/graph';
import { Subscription } from '../../../src/models';

const mockGetGraphClient = getGraphClient as jest.Mock;

const mockSubscription: Subscription = {
  id: 'graph-sub-1',
  userId: 'user-1',
  userEmail: 'user@test.com',
  userDisplayName: 'Test User',
  resource: '/users/user-1/events',
  changeType: 'created,updated,deleted',
  notificationUrl: 'https://webhook.test',
  clientState: 'test-state',
  expirationDateTime: '2025-08-01T00:00:00Z',
  renewalReminderAt: '2025-07-31T00:00:00Z',
  status: 'active',
  createdAt: '2025-07-01T00:00:00Z',
  updatedAt: '2025-07-01T00:00:00Z',
};

describe('graphSubscriptionService', () => {
  let mockApi: jest.Mock;
  let mockPost: jest.Mock;
  let mockPatch: jest.Mock;
  let mockDelete: jest.Mock;
  let mockGet: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPost = jest.fn();
    mockPatch = jest.fn();
    mockDelete = jest.fn();
    mockGet = jest.fn();
    mockApi = jest.fn(() => ({
      post: mockPost,
      patch: mockPatch,
      delete: mockDelete,
      get: mockGet,
    }));
    mockGetGraphClient.mockReturnValue({ api: mockApi });
  });

  describe('createSubscription', () => {
    test('creates subscription via Graph API and stores', async () => {
      mockPost.mockResolvedValue({
        id: 'graph-sub-new',
        expirationDateTime: '2025-08-01T00:00:00Z',
      });
      (subscriptionStore.put as jest.Mock).mockResolvedValue(undefined);

      const result = await graphSubscriptionService.createSubscription({
        userId: 'user-1',
        userEmail: 'user@test.com',
        userDisplayName: 'Test User',
      });

      expect(mockApi).toHaveBeenCalledWith('/subscriptions');
      expect(mockPost).toHaveBeenCalled();
      const postBody = mockPost.mock.calls[0][0];
      expect(postBody.notificationUrl).toBe('https://webhook.test');
      expect(postBody.changeType).toBe('created,updated,deleted');

      expect(subscriptionStore.put).toHaveBeenCalled();
      expect(result.id).toBe('graph-sub-new');
      expect(result.status).toBe('active');
    });

    test('uses custom resource and changeType', async () => {
      mockPost.mockResolvedValue({
        id: 'graph-sub-custom',
        expirationDateTime: '2025-08-01T00:00:00Z',
      });
      (subscriptionStore.put as jest.Mock).mockResolvedValue(undefined);

      await graphSubscriptionService.createSubscription({
        userId: 'user-1',
        userEmail: 'user@test.com',
        userDisplayName: 'Test User',
        resource: '/users/user-1/calendar',
        changeType: 'created',
      });

      const postBody = mockPost.mock.calls[0][0];
      expect(postBody.resource).toBe('/users/user-1/calendar');
      expect(postBody.changeType).toBe('created');
    });

    test('propagates Graph API errors', async () => {
      mockPost.mockRejectedValue(new Error('Forbidden'));

      await expect(
        graphSubscriptionService.createSubscription({
          userId: 'user-1',
          userEmail: 'user@test.com',
          userDisplayName: 'Test User',
        })
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('renewSubscription', () => {
    test('renews subscription via Graph API', async () => {
      mockPatch.mockResolvedValue({
        expirationDateTime: '2025-09-01T00:00:00Z',
      });
      (subscriptionStore.updateExpiry as jest.Mock).mockResolvedValue(undefined);
      (subscriptionStore.get as jest.Mock).mockResolvedValue(mockSubscription);

      const result = await graphSubscriptionService.renewSubscription('graph-sub-1');

      expect(mockApi).toHaveBeenCalledWith('/subscriptions/graph-sub-1');
      expect(mockPatch).toHaveBeenCalled();
      expect(subscriptionStore.updateExpiry).toHaveBeenCalled();
      expect(result).toEqual(mockSubscription);
    });

    test('throws when subscription not found after renewal', async () => {
      mockPatch.mockResolvedValue({
        expirationDateTime: '2025-09-01T00:00:00Z',
      });
      (subscriptionStore.updateExpiry as jest.Mock).mockResolvedValue(undefined);
      (subscriptionStore.get as jest.Mock).mockResolvedValue(null);

      await expect(
        graphSubscriptionService.renewSubscription('nonexistent')
      ).rejects.toThrow('not found after renewal');
    });
  });

  describe('deleteSubscription', () => {
    test('deletes from Graph API and store', async () => {
      mockDelete.mockResolvedValue(undefined);
      (subscriptionStore.delete as jest.Mock).mockResolvedValue(undefined);

      await graphSubscriptionService.deleteSubscription('graph-sub-1');

      expect(mockApi).toHaveBeenCalledWith('/subscriptions/graph-sub-1');
      expect(mockDelete).toHaveBeenCalled();
      expect(subscriptionStore.delete).toHaveBeenCalledWith('graph-sub-1');
    });

    test('ignores 404 from Graph API', async () => {
      mockDelete.mockRejectedValue({ statusCode: 404, message: 'Not found' });
      (subscriptionStore.delete as jest.Mock).mockResolvedValue(undefined);

      await graphSubscriptionService.deleteSubscription('graph-sub-1');

      expect(subscriptionStore.delete).toHaveBeenCalledWith('graph-sub-1');
    });

    test('throws non-404 Graph API errors', async () => {
      mockDelete.mockRejectedValue({ statusCode: 500, message: 'Internal error' });

      await expect(
        graphSubscriptionService.deleteSubscription('graph-sub-1')
      ).rejects.toEqual({ statusCode: 500, message: 'Internal error' });
    });
  });

  describe('listSubscriptions', () => {
    test('returns all subscriptions from store', async () => {
      (subscriptionStore.listAll as jest.Mock).mockResolvedValue([mockSubscription]);

      const result = await graphSubscriptionService.listSubscriptions();
      expect(result).toEqual([mockSubscription]);
    });
  });

  describe('getSubscription', () => {
    test('returns subscription by id', async () => {
      (subscriptionStore.get as jest.Mock).mockResolvedValue(mockSubscription);

      const result = await graphSubscriptionService.getSubscription('graph-sub-1');
      expect(result).toEqual(mockSubscription);
    });

    test('returns null when not found', async () => {
      (subscriptionStore.get as jest.Mock).mockResolvedValue(null);

      const result = await graphSubscriptionService.getSubscription('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('subscribeToGroupMembers', () => {
    test('creates subscriptions for new members', async () => {
      mockGet.mockResolvedValue({
        value: [
          { id: 'member-1', mail: 'm1@test.com', displayName: 'Member 1' },
          { id: 'member-2', mail: 'm2@test.com', displayName: 'Member 2' },
        ],
      });
      (subscriptionStore.listAll as jest.Mock).mockResolvedValue([]);
      mockPost.mockResolvedValue({
        id: 'new-sub',
        expirationDateTime: '2025-08-01T00:00:00Z',
      });
      (subscriptionStore.put as jest.Mock).mockResolvedValue(undefined);

      const result = await graphSubscriptionService.subscribeToGroupMembers();
      expect(result.length).toBe(2);
    });

    test('skips existing subscriptions', async () => {
      mockGet.mockResolvedValue({
        value: [{ id: 'member-1', mail: 'm1@test.com', displayName: 'Member 1' }],
      });
      (subscriptionStore.listAll as jest.Mock).mockResolvedValue([
        { ...mockSubscription, userId: 'member-1' },
      ]);

      const result = await graphSubscriptionService.subscribeToGroupMembers();
      expect(result.length).toBe(0);
    });

    test('throws when no group ID configured', async () => {
      const configMod = require('../../../src/config');
      const origGroupId = configMod.config.graph.entraGroupId;
      configMod.config.graph.entraGroupId = '';

      await expect(
        graphSubscriptionService.subscribeToGroupMembers()
      ).rejects.toThrow('ENTRA_GROUP_ID is not configured');

      configMod.config.graph.entraGroupId = origGroupId;
    });

    test('continues on individual subscription failure', async () => {
      mockGet.mockResolvedValue({
        value: [
          { id: 'member-1', mail: 'm1@test.com', displayName: 'Member 1' },
          { id: 'member-2', mail: 'm2@test.com', displayName: 'Member 2' },
        ],
      });
      (subscriptionStore.listAll as jest.Mock).mockResolvedValue([]);

      let callCount = 0;
      mockPost.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('Failed for member 1');
        return { id: 'new-sub', expirationDateTime: '2025-08-01T00:00:00Z' };
      });
      (subscriptionStore.put as jest.Mock).mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await graphSubscriptionService.subscribeToGroupMembers();
      expect(result.length).toBe(1);
      consoleSpy.mockRestore();
    });
  });

  describe('syncGroupMembers', () => {
    test('adds new members and removes departed', async () => {
      mockGet.mockResolvedValue({
        value: [
          { id: 'member-new', mail: 'new@test.com', displayName: 'New Member' },
        ],
      });
      (subscriptionStore.listAll as jest.Mock).mockResolvedValue([
        { ...mockSubscription, userId: 'member-departed', id: 'sub-departed' },
      ]);
      mockPost.mockResolvedValue({
        id: 'sub-new',
        expirationDateTime: '2025-08-01T00:00:00Z',
      });
      mockDelete.mockResolvedValue(undefined);
      (subscriptionStore.put as jest.Mock).mockResolvedValue(undefined);
      (subscriptionStore.delete as jest.Mock).mockResolvedValue(undefined);

      const result = await graphSubscriptionService.syncGroupMembers();

      expect(result.added.length).toBe(1);
      expect(result.removed).toContain('member-departed');
    });

    test('throws when no group ID configured', async () => {
      const configMod = require('../../../src/config');
      const origGroupId = configMod.config.graph.entraGroupId;
      configMod.config.graph.entraGroupId = '';

      await expect(
        graphSubscriptionService.syncGroupMembers()
      ).rejects.toThrow('ENTRA_GROUP_ID is not configured');

      configMod.config.graph.entraGroupId = origGroupId;
    });

    test('handles errors during sync gracefully', async () => {
      mockGet.mockResolvedValue({
        value: [{ id: 'member-1', mail: 'm1@test.com', displayName: 'M1' }],
      });
      (subscriptionStore.listAll as jest.Mock).mockResolvedValue([
        { ...mockSubscription, userId: 'old-member', id: 'sub-old' },
      ]);
      mockPost.mockRejectedValue(new Error('Create failed'));
      mockDelete.mockRejectedValue(new Error('Delete failed'));
      (subscriptionStore.delete as jest.Mock).mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await graphSubscriptionService.syncGroupMembers();

      expect(result.added.length).toBe(0);
      expect(result.removed.length).toBe(0);
      consoleSpy.mockRestore();
    });
  });
});
