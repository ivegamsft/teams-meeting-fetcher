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

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: jest.fn() }) },
  PutCommand: jest.fn(),
  GetCommand: jest.fn(),
  UpdateCommand: jest.fn(),
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

jest.mock('../../../src/config/graph', () => ({
  getGraphClient: jest.fn(),
  getGraphToken: jest.fn().mockResolvedValue('mock-token'),
}));

import app from '../../../src/app';

describe('Auth Routes - /auth', () => {
  describe('GET /auth/status', () => {
    test('returns unauthenticated when not logged in', async () => {
      const response = await request(app).get('/auth/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('authenticated', false);
    });
  });

  describe('GET /auth/login', () => {
    test('returns 503 when Entra ID not configured', async () => {
      const response = await request(app).get('/auth/login');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/not configured/i);
    });
  });

  describe('GET /auth/logout', () => {
    test('redirects to Microsoft logout when not logged in', async () => {
      const response = await request(app).get('/auth/logout');

      // Even with no session, logout calls req.logout then redirects
      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/login\.microsoftonline\.com/);
      expect(response.headers.location).toMatch(/logout/);
    });
  });

  describe('GET /auth/login-error', () => {
    test('returns 401 with error message', async () => {
      const response = await request(app).get('/auth/login-error');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/Authentication failed/);
    });
  });
});
