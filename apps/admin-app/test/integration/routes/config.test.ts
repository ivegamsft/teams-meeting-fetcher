import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key-12345';
process.env.WEBHOOK_AUTH_SECRET = 'test-webhook-secret';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.GRAPH_TENANT_ID = 'test-tenant-id';
process.env.GRAPH_CLIENT_ID = 'test-client-id';
process.env.GRAPH_CLIENT_SECRET = 'test-client-secret';
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
  DeleteCommand: jest.fn(),
  ScanCommand: jest.fn(),
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

const mockGetGraphToken = jest.fn();
jest.mock('../.././../src/config/graph', () => ({
  getGraphClient: jest.fn(),
  getGraphToken: (...args: any[]) => mockGetGraphToken(...args),
}));

import app from '../../../src/app';
import {
  createMockAppConfig,
  TEST_API_KEY,
} from '../../helpers/testSetup';

describe('Config Routes - /api/config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/config', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).get('/api/config');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('returns config with valid API key', async () => {
      const mockConfig = createMockAppConfig();
      mockDynamoSend.mockResolvedValueOnce({ Item: mockConfig });

      const response = await request(app)
        .get('/api/config')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tenantId');
      expect(response.body).toHaveProperty('entraGroupId');
    });

    test('creates default config when none exists', async () => {
      // First get returns null, put succeeds, second get returns config
      mockDynamoSend
        .mockResolvedValueOnce({ Item: undefined })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ Item: createMockAppConfig() });

      const response = await request(app)
        .get('/api/config')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
    });

    test('returns 500 on database error', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('DynamoDB error'));

      const response = await request(app)
        .get('/api/config')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/config', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).put('/api/config');
      expect(response.status).toBe(401);
    });

    test('updates entraGroupId', async () => {
      const updatedConfig = createMockAppConfig({ entraGroupId: 'new-group-id' });
      mockDynamoSend
        .mockResolvedValueOnce({}) // updateEntraGroupId
        .mockResolvedValueOnce({ Item: updatedConfig }); // get after update

      const response = await request(app)
        .put('/api/config')
        .set('X-API-Key', TEST_API_KEY)
        .send({ entraGroupId: 'new-group-id' });

      expect(response.status).toBe(200);
      expect(response.body.entraGroupId).toBe('new-group-id');
    });

    test('returns 500 on update error', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('Update failed'));

      const response = await request(app)
        .put('/api/config')
        .set('X-API-Key', TEST_API_KEY)
        .send({ entraGroupId: 'new-group' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/config/health', () => {
    test('is accessible without API key (dashboardAuth skips /health path)', async () => {
      mockGetGraphToken.mockResolvedValueOnce('mock-token');
      mockDynamoSend.mockResolvedValueOnce({ Item: createMockAppConfig() });

      const response = await request(app).get('/api/config/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
    });

    test('returns health status when services connected', async () => {
      mockGetGraphToken.mockResolvedValueOnce('mock-token');
      mockDynamoSend.mockResolvedValueOnce({ Item: createMockAppConfig() });

      const response = await request(app)
        .get('/api/config/health')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('graphApi');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('returns degraded when graph API fails', async () => {
      mockGetGraphToken.mockRejectedValueOnce(new Error('Token error'));
      mockDynamoSend.mockResolvedValueOnce({ Item: createMockAppConfig() });

      const response = await request(app)
        .get('/api/config/health')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.graphApi).toBe('disconnected');
      expect(response.body.status).toBe('degraded');
    });

    test('returns degraded when database fails', async () => {
      mockGetGraphToken.mockResolvedValueOnce('mock-token');
      mockDynamoSend.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .get('/api/config/health')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.database).toBe('disconnected');
      expect(response.body.status).toBe('degraded');
    });
  });
});
