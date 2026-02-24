/**
 * graph-client.test.js – Unit tests for Graph API client
 *
 * Validates:
 *   • Transcript endpoints use user-scoped paths (/users/{userId}/onlineMeetings/...)
 *   • NOT the app-level path (/communications/onlineMeetings/...) which returns 404
 *   • Token acquisition flows
 *   • Error propagation
 */
'use strict';

// ─── Mocks (must be before require) ──────────────────────────────────────────

const mockAcquireToken = jest.fn().mockResolvedValue({ accessToken: 'mock-token-abc' });

jest.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: jest.fn(() => ({
    acquireTokenByClientCredential: mockAcquireToken,
  })),
}));

// Mock https to intercept all outbound HTTP calls

function createMockResponse(statusCode, body) {
  const { PassThrough } = require('stream');
  const res = new PassThrough();
  res.statusCode = statusCode;
  process.nextTick(() => {
    res.emit('data', typeof body === 'string' ? body : JSON.stringify(body));
    res.emit('end');
  });
  return res;
}

let lastRequestOptions = null;
let lastRequestBody = null;
let mockResponseFn = () => createMockResponse(200, { value: [] });

jest.mock('https', () => ({
  request: jest.fn((options, callback) => {
    lastRequestOptions = options;
    const res = mockResponseFn(options);
    callback(res);
    const { PassThrough: MockPassThrough } = require('stream');
    const req = new MockPassThrough();
    req.end = jest.fn();
    const origWrite = req.write.bind(req);
    req.write = (data) => {
      lastRequestBody = data;
      return origWrite(data);
    };
    return req;
  }),
}));

// ─── Setup env vars before loading module ────────────────────────────────────

process.env.GRAPH_TENANT_ID = 'test-tenant-id';
process.env.BOT_APP_ID = 'test-bot-app-id';
process.env.BOT_APP_SECRET = 'test-secret';

const graphClient = require('../../../scenarios/lambda/meeting-bot/graph-client');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('graph-client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastRequestOptions = null;
    lastRequestBody = null;
    mockResponseFn = () => createMockResponse(200, { value: [] });
  });

  describe('getMeetingTranscripts', () => {
    it('should use user-scoped endpoint /users/{userId}/onlineMeetings/{id}/transcripts', async () => {
      const userId = 'user-aad-id-123';
      const meetingId = 'online-meeting-id-456';

      await graphClient.getMeetingTranscripts(userId, meetingId);

      expect(lastRequestOptions.path).toBe(
        `/v1.0/users/${userId}/onlineMeetings/${meetingId}/transcripts`
      );
      expect(lastRequestOptions.hostname).toBe('graph.microsoft.com');
      expect(lastRequestOptions.method).toBe('GET');
    });

    it('should NOT use /communications/onlineMeetings (app-level 404 path)', async () => {
      await graphClient.getMeetingTranscripts('user-123', 'meeting-456');

      expect(lastRequestOptions.path).not.toContain('/communications/');
    });

    it('should include Authorization header with token', async () => {
      await graphClient.getMeetingTranscripts('user-123', 'meeting-456');

      expect(lastRequestOptions.headers.Authorization).toBe('Bearer mock-token-abc');
    });

    it('should reject when Graph returns an error', async () => {
      mockResponseFn = () =>
        createMockResponse(404, { error: { code: 'NotFound', message: 'Not found' } });

      await expect(graphClient.getMeetingTranscripts('user-123', 'meeting-456')).rejects.toThrow(
        '404'
      );
    });
  });

  describe('getTranscriptContent', () => {
    it('should use user-scoped endpoint for transcript content download', async () => {
      const userId = 'user-aad-id-789';
      const meetingId = 'online-meeting-id-abc';
      const transcriptId = 'transcript-id-xyz';

      mockResponseFn = () =>
        createMockResponse(200, 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello');

      await graphClient.getTranscriptContent(userId, meetingId, transcriptId, 'text/vtt');

      expect(lastRequestOptions.path).toBe(
        `/v1.0/users/${userId}/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content`
      );
    });

    it('should NOT use /communications/ path for transcript content', async () => {
      mockResponseFn = () => createMockResponse(200, 'WEBVTT\n\ncontent');

      await graphClient.getTranscriptContent('user-1', 'meeting-1', 'trans-1');

      expect(lastRequestOptions.path).not.toContain('/communications/');
    });

    it('should default to text/vtt Accept header', async () => {
      mockResponseFn = () => createMockResponse(200, 'WEBVTT');

      await graphClient.getTranscriptContent('u', 'm', 't');

      expect(lastRequestOptions.headers.Accept).toBe('text/vtt');
    });

    it('should use custom format when specified', async () => {
      const docxFormat = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      mockResponseFn = () => createMockResponse(200, 'docx-content');

      await graphClient.getTranscriptContent('u', 'm', 't', docxFormat);

      expect(lastRequestOptions.headers.Accept).toBe(docxFormat);
    });

    it('should reject on non-2xx status', async () => {
      mockResponseFn = () => createMockResponse(403, 'Forbidden');

      await expect(graphClient.getTranscriptContent('u', 'm', 't')).rejects.toThrow('403');
    });
  });

  describe('graphRequest', () => {
    it('should resolve JSON on success', async () => {
      mockResponseFn = () => createMockResponse(200, { value: [{ id: '1' }] });

      const result = await graphClient.graphRequest('GET', '/test/path');

      expect(result).toEqual({ value: [{ id: '1' }] });
    });

    it('should reject with statusCode on failure', async () => {
      mockResponseFn = () =>
        createMockResponse(400, { error: { code: 'BadRequest', message: 'Bad request' } });

      try {
        await graphClient.graphRequest('GET', '/bad/path');
        fail('Should have thrown');
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain('400');
      }
    });
  });

  describe('createGraphSubscription', () => {
    it('should POST to /subscriptions with correct body', async () => {
      mockResponseFn = () => createMockResponse(201, { id: 'sub-123', resource: 'test/resource' });

      await graphClient.createGraphSubscription(
        'https://example.com/notify',
        'communications/onlineMeetings/getAllTranscripts',
        'created',
        4230,
        'my-secret',
        'https://example.com/lifecycle'
      );

      expect(lastRequestOptions.path).toBe('/v1.0/subscriptions');
      expect(lastRequestOptions.method).toBe('POST');
      const body = JSON.parse(lastRequestBody);
      expect(body.changeType).toBe('created');
      expect(body.notificationUrl).toBe('https://example.com/notify');
      expect(body.resource).toBe('communications/onlineMeetings/getAllTranscripts');
      expect(body.clientState).toBe('my-secret');
      expect(body.lifecycleNotificationUrl).toBe('https://example.com/lifecycle');
    });
  });

  describe('renewGraphSubscription', () => {
    it('should PATCH subscription with new expiration', async () => {
      mockResponseFn = () => createMockResponse(200, { id: 'sub-123' });

      await graphClient.renewGraphSubscription('sub-123', 60);

      expect(lastRequestOptions.path).toBe('/v1.0/subscriptions/sub-123');
      expect(lastRequestOptions.method).toBe('PATCH');
      const body = JSON.parse(lastRequestBody);
      expect(body.expirationDateTime).toBeDefined();
    });
  });

  describe('deleteGraphSubscription', () => {
    it('should DELETE the subscription by ID', async () => {
      mockResponseFn = () => createMockResponse(204, '');

      await graphClient.deleteGraphSubscription('sub-456');

      expect(lastRequestOptions.path).toBe('/v1.0/subscriptions/sub-456');
      expect(lastRequestOptions.method).toBe('DELETE');
    });
  });

  describe('getOnlineMeeting', () => {
    it('should GET meeting with select for chatInfo', async () => {
      mockResponseFn = () =>
        createMockResponse(200, {
          id: 'meeting-1',
          chatInfo: { threadId: '19:meeting_abc@thread.v2' },
        });

      const result = await graphClient.getOnlineMeeting('user-1', 'meeting-1');

      expect(lastRequestOptions.path).toContain('/users/user-1/onlineMeetings/meeting-1');
      expect(lastRequestOptions.path).toContain('$select=');
      expect(result.chatInfo.threadId).toBe('19:meeting_abc@thread.v2');
    });
  });

  describe('updateOnlineMeeting', () => {
    it('should PATCH meeting with provided properties', async () => {
      mockResponseFn = () =>
        createMockResponse(200, { id: 'meeting-1', recordAutomatically: true });

      await graphClient.updateOnlineMeeting('user-1', 'meeting-1', {
        recordAutomatically: true,
        allowTranscription: true,
      });

      expect(lastRequestOptions.path).toBe('/v1.0/users/user-1/onlineMeetings/meeting-1');
      expect(lastRequestOptions.method).toBe('PATCH');
      const body = JSON.parse(lastRequestBody);
      expect(body.recordAutomatically).toBe(true);
      expect(body.allowTranscription).toBe(true);
    });
  });
});
