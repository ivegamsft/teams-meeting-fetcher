jest.mock('../../../src/config/dynamodb', () => ({
  dynamoDb: { send: jest.fn() },
}));

jest.mock('../../../src/config', () => ({
  config: {
    aws: {
      dynamodb: { subscriptionsTable: 'test-subscriptions-table' },
    },
  },
}));

import { subscriptionStore } from '../../../src/services/subscriptionStore';
import { dynamoDb } from '../../../src/config/dynamodb';
import { Subscription } from '../../../src/models';

const mockSend = dynamoDb.send as jest.Mock;

const mockSubscription: Subscription = {
  id: 'sub-1',
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

describe('subscriptionStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('put', () => {
    test('saves subscription to DynamoDB', async () => {
      mockSend.mockResolvedValue({});

      await subscriptionStore.put(mockSubscription);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.Item).toEqual(mockSubscription);
      expect(call.input.TableName).toBe('test-subscriptions-table');
    });
  });

  describe('get', () => {
    test('returns subscription when found', async () => {
      mockSend.mockResolvedValue({ Item: mockSubscription });

      const result = await subscriptionStore.get('sub-1');
      expect(result).toEqual(mockSubscription);
    });

    test('returns null when not found', async () => {
      mockSend.mockResolvedValue({});

      const result = await subscriptionStore.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listAll', () => {
    test('returns all subscriptions', async () => {
      mockSend.mockResolvedValue({ Items: [mockSubscription] });

      const result = await subscriptionStore.listAll();
      expect(result).toEqual([mockSubscription]);
    });

    test('returns empty array when no items', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await subscriptionStore.listAll();
      expect(result).toEqual([]);
    });
  });

  describe('listByStatus', () => {
    test('filters by status', async () => {
      mockSend.mockResolvedValue({ Items: [mockSubscription] });

      const result = await subscriptionStore.listByStatus('active');
      expect(result).toEqual([mockSubscription]);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.FilterExpression).toContain('#status = :status');
      expect(call.input.ExpressionAttributeValues[':status']).toBe('active');
    });
  });

  describe('listExpiringSoon', () => {
    test('filters by expiry cutoff', async () => {
      mockSend.mockResolvedValue({ Items: [mockSubscription] });

      const result = await subscriptionStore.listExpiringSoon(24);
      expect(result).toEqual([mockSubscription]);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.FilterExpression).toContain('expirationDateTime < :cutoff');
    });

    test('uses default 48 hours', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      await subscriptionStore.listExpiringSoon();
      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeValues[':cutoff']).toBeDefined();
    });
  });

  describe('updateStatus', () => {
    test('updates status without error message', async () => {
      mockSend.mockResolvedValue({});

      await subscriptionStore.updateStatus('sub-1', 'expired');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.Key).toEqual({ id: 'sub-1' });
      expect(call.input.ExpressionAttributeValues[':status']).toBe('expired');
      expect(call.input.UpdateExpression).not.toContain('errorMessage');
    });

    test('updates status with error message', async () => {
      mockSend.mockResolvedValue({});

      await subscriptionStore.updateStatus('sub-1', 'error', 'Something failed');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeValues[':err']).toBe('Something failed');
      expect(call.input.UpdateExpression).toContain('errorMessage');
    });
  });

  describe('updateExpiry', () => {
    test('updates expiration date', async () => {
      mockSend.mockResolvedValue({});

      await subscriptionStore.updateExpiry('sub-1', '2025-09-01T00:00:00Z');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeValues[':exp']).toBe('2025-09-01T00:00:00Z');
    });
  });

  describe('updateLastNotification', () => {
    test('sets lastNotificationAt timestamp', async () => {
      mockSend.mockResolvedValue({});

      await subscriptionStore.updateLastNotification('sub-1');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.UpdateExpression).toContain('lastNotificationAt');
    });
  });

  describe('delete', () => {
    test('deletes subscription by id', async () => {
      mockSend.mockResolvedValue({});

      await subscriptionStore.delete('sub-1');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.Key).toEqual({ id: 'sub-1' });
    });
  });
});
