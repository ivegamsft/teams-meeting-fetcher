import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key-12345';
process.env.WEBHOOK_AUTH_SECRET = 'test-webhook-secret';
process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';
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

const mockGraphApiGet = jest.fn();
jest.mock('../../../src/config/graph', () => ({
  getGraphClient: jest.fn().mockReturnValue({
    api: () => ({
      get: mockGraphApiGet,
    }),
  }),
  getGraphToken: jest.fn().mockResolvedValue('mock-token'),
}));

import app from '../../../src/app';
import { TEST_WEBHOOK_SECRET } from '../../helpers/testSetup';

describe('Webhook Routes - /api/webhooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: DynamoDB calls succeed
    mockDynamoSend.mockResolvedValue({});
  });

  describe('POST /api/webhooks/graph', () => {
    test('returns 401 without bearer token', async () => {
      const response = await request(app)
        .post('/api/webhooks/graph')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('returns 403 with invalid bearer token', async () => {
      const response = await request(app)
        .post('/api/webhooks/graph')
        .set('Authorization', 'Bearer wrong-token')
        .send({});

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    test('returns validation token for subscription validation', async () => {
      const response = await request(app)
        .post('/api/webhooks/graph?validationToken=abc123')
        .set('Authorization', `Bearer ${TEST_WEBHOOK_SECRET}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.text).toBe('abc123');
      expect(response.headers['content-type']).toMatch(/text\/plain/);
    });

    test('processes notification payload with empty notifications', async () => {
      const response = await request(app)
        .post('/api/webhooks/graph')
        .set('Authorization', `Bearer ${TEST_WEBHOOK_SECRET}`)
        .send({ value: [] });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('processed', 0);
    });

    test('processes notification with valid clientState', async () => {
      const mockMeeting = {
        id: 'event-001',
        subject: 'Test Event',
        start: { dateTime: '2025-01-01T10:00:00Z' },
        end: { dateTime: '2025-01-01T11:00:00Z' },
        organizer: { emailAddress: { address: 'org@example.com', name: 'Organizer' } },
        attendees: [],
      };
      mockGraphApiGet.mockResolvedValueOnce(mockMeeting);
      // getMeeting (findMeetingByResource) - not found
      mockDynamoSend.mockResolvedValueOnce({ Item: undefined });
      // put meeting
      mockDynamoSend.mockResolvedValueOnce({});
      // incrementCounter
      mockDynamoSend.mockResolvedValueOnce({});
      // updateLastNotification
      mockDynamoSend.mockResolvedValueOnce({});
      // updateLastWebhook
      mockDynamoSend.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/api/webhooks/graph')
        .set('Authorization', `Bearer ${TEST_WEBHOOK_SECRET}`)
        .send({
          value: [
            {
              subscriptionId: 'sub-001',
              changeType: 'created',
              resource: 'users/user-001/events/event-001',
              clientState: 'test-client-state',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('processed', 0);
      expect(response.body).toHaveProperty('deprecated', true);
    });

    test('skips notifications with invalid clientState', async () => {
      // updateLastWebhook will be called
      mockDynamoSend.mockResolvedValue({});

      const response = await request(app)
        .post('/api/webhooks/graph')
        .set('Authorization', `Bearer ${TEST_WEBHOOK_SECRET}`)
        .send({
          value: [
            {
              subscriptionId: 'sub-001',
              changeType: 'created',
              resource: 'users/user-001/events/event-001',
              clientState: 'wrong-state',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });
});
