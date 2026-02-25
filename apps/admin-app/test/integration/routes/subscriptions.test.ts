import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key-12345';
process.env.WEBHOOK_AUTH_SECRET = 'test-webhook-secret';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.GRAPH_TENANT_ID = 'test-tenant-id';
process.env.GRAPH_CLIENT_ID = 'test-client-id';
process.env.GRAPH_CLIENT_SECRET = 'test-client-secret';
process.env.ENTRA_GROUP_ID = 'test-group-id';
process.env.ENTRA_TENANT_ID = '';
process.env.ENTRA_CLIENT_ID = '';
process.env.ENTRA_CLIENT_SECRET = '';

jest.mock('passport-azure-ad', () => ({
  OIDCStrategy: jest.fn().mockImplementation(() => ({ name: 'azuread-openidconnect' })),
}));

const mockDynamoSend = jest.fn();
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: (...args: any[]) => mockDynamoSend(...args) }) },
  PutCommand: jest.fn().mockImplementation((params: any) => ({ _type: 'Put', ...params })),
  GetCommand: jest.fn().mockImplementation((params: any) => ({ _type: 'Get', ...params })),
  UpdateCommand: jest.fn().mockImplementation((params: any) => ({ _type: 'Update', ...params })),
  DeleteCommand: jest.fn().mockImplementation((params: any) => ({ _type: 'Delete', ...params })),
  ScanCommand: jest.fn().mockImplementation((params: any) => ({ _type: 'Scan', ...params })),
  QueryCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

const mockGraphApi = jest.fn();
jest.mock('../../../src/config/graph', () => ({
  getGraphClient: jest.fn().mockReturnValue({
    api: () => ({
      post: mockGraphApi,
      patch: mockGraphApi,
      delete: mockGraphApi,
      get: mockGraphApi,
    }),
  }),
  getGraphToken: jest.fn().mockResolvedValue('mock-token'),
}));

import app from '../../../src/app';
import {
  createMockSubscription,
  TEST_API_KEY,
} from '../../helpers/testSetup';

describe('Subscription Routes - /api/subscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/subscriptions', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).get('/api/subscriptions');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('returns list of subscriptions', async () => {
      const mockSubs = [createMockSubscription(), createMockSubscription({ id: 'sub-002' })];
      mockDynamoSend.mockResolvedValueOnce({ Items: mockSubs });

      const response = await request(app)
        .get('/api/subscriptions')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('subscriptions');
      expect(response.body).toHaveProperty('totalCount', 2);
      expect(response.body.subscriptions).toHaveLength(2);
    });

    test('returns empty list when no subscriptions', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Items: [] });

      const response = await request(app)
        .get('/api/subscriptions')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.subscriptions).toHaveLength(0);
      expect(response.body.totalCount).toBe(0);
    });

    test('returns 500 on service error', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      const response = await request(app)
        .get('/api/subscriptions')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/subscriptions', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).post('/api/subscriptions');
      expect(response.status).toBe(401);
    });

    test('creates a subscription', async () => {
      const graphResponse = {
        id: 'graph-sub-001',
        expirationDateTime: '2025-02-01T00:00:00Z',
      };
      mockGraphApi.mockResolvedValueOnce(graphResponse);
      mockDynamoSend.mockResolvedValueOnce({}); // put

      const response = await request(app)
        .post('/api/subscriptions')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          userId: 'user-001',
          userEmail: 'user@example.com',
          userDisplayName: 'Test User',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 'graph-sub-001');
      expect(response.body).toHaveProperty('userId', 'user-001');
      expect(response.body).toHaveProperty('status', 'active');
    });

    test('returns 400 with missing required fields', async () => {
      const response = await request(app)
        .post('/api/subscriptions')
        .set('X-API-Key', TEST_API_KEY)
        .send({ userId: 'user-001' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('returns 500 when Graph API fails', async () => {
      mockGraphApi.mockRejectedValueOnce(new Error('Graph API error'));

      const response = await request(app)
        .post('/api/subscriptions')
        .set('X-API-Key', TEST_API_KEY)
        .send({
          userId: 'user-001',
          userEmail: 'user@example.com',
          userDisplayName: 'Test User',
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PATCH /api/subscriptions/:id/renew', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).patch('/api/subscriptions/sub-001/renew');
      expect(response.status).toBe(401);
    });

    test('renews a subscription', async () => {
      const renewedSub = createMockSubscription({
        expirationDateTime: '2025-03-01T00:00:00Z',
      });
      mockGraphApi.mockResolvedValueOnce({ expirationDateTime: '2025-03-01T00:00:00Z' });
      mockDynamoSend
        .mockResolvedValueOnce({}) // updateExpiry
        .mockResolvedValueOnce({ Item: renewedSub }); // get after renewal

      const response = await request(app)
        .patch('/api/subscriptions/sub-001/renew')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 'sub-001');
    });

    test('returns 500 when renewal fails', async () => {
      mockGraphApi.mockRejectedValueOnce(new Error('Renewal failed'));

      const response = await request(app)
        .patch('/api/subscriptions/sub-001/renew')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/subscriptions/:id', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).delete('/api/subscriptions/sub-001');
      expect(response.status).toBe(401);
    });

    test('deletes a subscription', async () => {
      mockGraphApi.mockResolvedValueOnce(undefined); // graph delete
      mockDynamoSend.mockResolvedValueOnce({}); // dynamo delete

      const response = await request(app)
        .delete('/api/subscriptions/sub-001')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Subscription deleted');
    });

    test('returns 500 on delete error', async () => {
      mockGraphApi.mockRejectedValueOnce(new Error('Delete failed'));

      const response = await request(app)
        .delete('/api/subscriptions/sub-001')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/subscriptions/sync-group', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).post('/api/subscriptions/sync-group');
      expect(response.status).toBe(401);
    });

    test('syncs group members', async () => {
      // Mock Graph API for getting group members
      mockGraphApi.mockResolvedValueOnce({ value: [] });
      // Mock listAll for existing subscriptions
      mockDynamoSend.mockResolvedValueOnce({ Items: [] });

      const response = await request(app)
        .post('/api/subscriptions/sync-group')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('added');
      expect(response.body).toHaveProperty('removed');
    });

    test('returns 500 on sync error', async () => {
      mockGraphApi.mockRejectedValueOnce(new Error('Sync failed'));

      const response = await request(app)
        .post('/api/subscriptions/sync-group')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
