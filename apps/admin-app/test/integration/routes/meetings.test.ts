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
  ScanCommand: jest.fn().mockImplementation((params: any) => ({ _type: 'Scan', ...params })),
  QueryCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: (...args: any[]) => mockS3Send(...args) })),
  PutObjectCommand: jest.fn().mockImplementation((params: any) => ({ _type: 'PutObject', ...params })),
  GetObjectCommand: jest.fn().mockImplementation((params: any) => ({ _type: 'GetObject', ...params })),
}));

jest.mock('../../../src/config/graph', () => ({
  getGraphClient: jest.fn(),
  getGraphToken: jest.fn().mockResolvedValue('mock-token'),
}));

import app from '../../../src/app';
import {
  createMockMeeting,
  createMockTranscript,
  TEST_API_KEY,
} from '../../helpers/testSetup';

describe('Meeting Routes - /api/meetings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/meetings', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).get('/api/meetings');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('returns list of meetings', async () => {
      const mockMeetings = [createMockMeeting(), createMockMeeting({ meeting_id: 'meeting-002' })];
      mockDynamoSend.mockResolvedValueOnce({ Items: mockMeetings, Count: 2 });

      const response = await request(app)
        .get('/api/meetings')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('meetings');
      expect(response.body).toHaveProperty('totalCount');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('pageSize');
    });

    test('passes query filters', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Items: [], Count: 0 });

      const response = await request(app)
        .get('/api/meetings?status=scheduled&organizer=test@example.com&page=2&pageSize=10')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body.page).toBe(2);
      expect(response.body.pageSize).toBe(10);
    });

    test('returns 500 on service error', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .get('/api/meetings')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/meetings/:id', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).get('/api/meetings/meeting-001');
      expect(response.status).toBe(401);
    });

    test('returns a single meeting', async () => {
      const mockMeeting = createMockMeeting();
      mockDynamoSend
        .mockResolvedValueOnce({ Items: [{ meeting_id: 'meeting-001', created_at: '2025-01-01T09:00:00Z' }] })
        .mockResolvedValueOnce({ Item: mockMeeting });

      const response = await request(app)
        .get('/api/meetings/meeting-001')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('meeting_id', 'meeting-001');
      expect(response.body).toHaveProperty('subject', 'Test Meeting');
    });

    test('returns 404 when meeting not found', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Items: [] });

      const response = await request(app)
        .get('/api/meetings/nonexistent')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Meeting not found');
    });

    test('returns 500 on service error', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('DB error'));

      const response = await request(app)
        .get('/api/meetings/meeting-001')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/meetings/:id/transcript', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).get('/api/meetings/meeting-001/transcript');
      expect(response.status).toBe(401);
    });

    test('returns transcript for a meeting', async () => {
      const mockTranscript = createMockTranscript();
      // getByMeetingId uses scan
      mockDynamoSend.mockResolvedValueOnce({ Items: [mockTranscript] });
      // getTranscriptContent fetches from S3
      mockS3Send.mockResolvedValueOnce({
        Body: { transformToString: () => Promise.resolve('WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello world') },
      });

      const response = await request(app)
        .get('/api/meetings/meeting-001/transcript')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('transcript_id', 'transcript-001');
      expect(response.body).toHaveProperty('meetingId', 'meeting-001');
    });

    test('returns 404 when transcript not found', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Items: [] });

      const response = await request(app)
        .get('/api/meetings/meeting-001/transcript')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    test('returns 500 on service error', async () => {
      mockDynamoSend.mockRejectedValueOnce(new Error('Transcript error'));

      const response = await request(app)
        .get('/api/meetings/meeting-001/transcript')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/meetings/:id/transcript/download', () => {
    test('returns 401 without API key', async () => {
      const response = await request(app).get('/api/meetings/meeting-001/transcript/download');
      expect(response.status).toBe(401);
    });

    test('downloads transcript as VTT', async () => {
      const vttContent = 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello world';
      const mockTranscript = createMockTranscript();
      mockDynamoSend.mockResolvedValueOnce({ Items: [mockTranscript] });
      mockS3Send.mockResolvedValueOnce({
        Body: { transformToString: () => Promise.resolve(vttContent) },
      });

      const response = await request(app)
        .get('/api/meetings/meeting-001/transcript/download')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/vtt/);
      expect(response.headers['content-disposition']).toMatch(/attachment.*transcript/);
      expect(response.text).toBe(vttContent);
    });

    test('returns 404 when transcript not found', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Items: [] });

      const response = await request(app)
        .get('/api/meetings/meeting-001/transcript/download')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(404);
    });

    test('returns 404 when content not available', async () => {
      const mockTranscript = createMockTranscript({ sanitizedS3Path: undefined, rawS3Path: undefined });
      mockDynamoSend.mockResolvedValueOnce({ Items: [mockTranscript] });

      const response = await request(app)
        .get('/api/meetings/meeting-001/transcript/download')
        .set('X-API-Key', TEST_API_KEY);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });
});
