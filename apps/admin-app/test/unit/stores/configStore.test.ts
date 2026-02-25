jest.mock('../../../src/config/dynamodb', () => ({
  dynamoDb: { send: jest.fn() },
}));

jest.mock('../../../src/config', () => ({
  config: {
    aws: {
      dynamodb: { configTable: 'test-config-table' },
    },
    graph: { tenantId: 'test-tenant', entraGroupId: 'test-group' },
    webhook: { notificationUrl: 'https://test.webhook.url' },
  },
}));

import { configStore } from '../../../src/services/configStore';
import { dynamoDb } from '../../../src/config/dynamodb';

const mockSend = dynamoDb.send as jest.Mock;

describe('configStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    test('returns config when found', async () => {
      const mockConfig = {
        id: 'primary',
        tenantId: 'test-tenant',
        monitoredMeetingsCount: 5,
      };
      mockSend.mockResolvedValue({ Item: mockConfig });

      const result = await configStore.get();
      expect(result).toEqual(mockConfig);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('returns null when not found', async () => {
      mockSend.mockResolvedValue({});

      const result = await configStore.get();
      expect(result).toBeNull();
    });
  });

  describe('put', () => {
    test('saves config with defaults', async () => {
      mockSend.mockResolvedValue({});

      await configStore.put({ tenantId: 'my-tenant' });
      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.Item.id).toBe('primary');
      expect(call.input.Item.monitoredMeetingsCount).toBe(0);
      expect(call.input.Item.tenantId).toBe('my-tenant');
    });

    test('merges provided fields over defaults', async () => {
      mockSend.mockResolvedValue({});

      await configStore.put({ monitoredMeetingsCount: 10 });
      const call = mockSend.mock.calls[0][0];
      expect(call.input.Item.monitoredMeetingsCount).toBe(10);
    });
  });

  describe('updateEntraGroupId', () => {
    test('sends update command with group id', async () => {
      mockSend.mockResolvedValue({});

      await configStore.updateEntraGroupId('new-group-id');
      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.Key).toEqual({ id: 'primary' });
      expect(call.input.ExpressionAttributeValues[':gid']).toBe('new-group-id');
    });
  });

  describe('incrementCounter', () => {
    test('increments monitoredMeetingsCount', async () => {
      mockSend.mockResolvedValue({});

      await configStore.incrementCounter('monitoredMeetingsCount', 1);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.UpdateExpression).toContain('monitoredMeetingsCount');
      expect(call.input.ExpressionAttributeValues[':delta']).toBe(1);
    });

    test('decrements counter with negative delta', async () => {
      mockSend.mockResolvedValue({});

      await configStore.incrementCounter('transcriptionsPending', -1);
      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeValues[':delta']).toBe(-1);
    });
  });

  describe('updateLastWebhook', () => {
    test('sets lastWebhookReceived timestamp', async () => {
      mockSend.mockResolvedValue({});

      await configStore.updateLastWebhook();
      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.UpdateExpression).toContain('lastWebhookReceived');
    });
  });
});
