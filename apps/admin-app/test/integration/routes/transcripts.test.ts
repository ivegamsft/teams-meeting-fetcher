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
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
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

jest.mock('../../../src/config/graph', () => ({
  getGraphClient: jest.fn(),
  getGraphToken: jest.fn().mockResolvedValue('mock-token'),
}));

import app from '../../../src/app';
import {
  createMockTranscript,
  TEST_API_KEY,
} from '../../helpers/testSetup';

describe('Transcript Routes - /api/transcripts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/transcripts', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).get('/api/transcripts');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('returns list of transcripts', async () => {
      const mockTranscripts = [
        createMockTranscript(),
        createMockTranscript({ id: 'transcript-002', meetingId: 'meeting-002' }),
      ];
      mockDynamoSend.mockResolvedValueOnce({ Items: mockTranscripts });

      const response = await request(app)
        .get('/api/transcripts')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('transcripts');
      expect(response.body).toHaveProperty('totalCount', 2);
      expect(response.body.transcripts).toHaveLength(2);
    });

    test('returns empty list when none exist', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Items: [] });

      const response = await request(app)
        .get('/api/transcripts')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.transcripts).toHaveLength(0);
      expect(response.body.totalCount).toBe(0);
    });

    test('supports status filter', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Items: [createMockTranscript()] });

      const response = await request(app)
        .get('/api/transcripts?status=completed')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
    });

    test('returns 500 on service error', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .get('/api/transcripts')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/transcripts/:id', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).get('/api/transcripts/transcript-001');
      expect(response.status).toBe(401);
    });

    test('returns a single transcript', async () => {
      const mockTranscript = createMockTranscript();
      mockDynamoSend.mockResolvedValueOnce({ Item: mockTranscript });

      const response = await request(app)
        .get('/api/transcripts/transcript-001')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 'transcript-001');
      expect(response.body).toHaveProperty('meetingId', 'meeting-001');
      expect(response.body).toHaveProperty('status', 'completed');
    });

    test('returns 404 when transcript not found', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: undefined });

      const response = await request(app)
        .get('/api/transcripts/nonexistent')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Transcript not found');
    });

    test('returns 500 on service error', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .get('/api/transcripts/transcript-001')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
