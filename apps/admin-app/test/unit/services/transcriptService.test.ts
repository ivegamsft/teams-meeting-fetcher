jest.mock('../../../src/config/graph', () => ({
  getGraphClient: jest.fn(),
}));

jest.mock('../../../src/config/s3', () => ({
  s3Client: { send: jest.fn() },
}));

jest.mock('../../../src/config', () => ({
  config: {
    aws: {
      s3: { rawBucket: 'test-raw-bucket', sanitizedBucket: 'test-sanitized-bucket' },
      dynamodb: {
        transcriptsTable: 'test-transcripts',
        meetingsTable: 'test-meetings',
        configTable: 'test-config',
      },
    },
    graph: { tenantId: 'test-tenant' },
    sanitization: { enabled: true },
  },
}));

jest.mock('../../../src/config/dynamodb', () => ({
  dynamoDb: { send: jest.fn() },
}));

jest.mock('../../../src/services/transcriptStore', () => ({
  transcriptStore: {
    put: jest.fn(),
    get: jest.fn(),
    getByMeetingId: jest.fn(),
    listAll: jest.fn(),
    updateStatus: jest.fn(),
    updateS3Paths: jest.fn(),
  },
}));

jest.mock('../../../src/services/meetingStore', () => ({
  meetingStore: {
    setTranscriptionId: jest.fn(),
    updateStatus: jest.fn(),
  },
}));

jest.mock('../../../src/services/configStore', () => ({
  configStore: {
    incrementCounter: jest.fn(),
  },
}));

jest.mock('../../../src/services/sanitizationService', () => ({
  sanitizationService: {
    sanitize: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-transcript-uuid'),
}));

import { transcriptService } from '../../../src/services/transcriptService';
import { transcriptStore } from '../../../src/services/transcriptStore';
import { meetingStore } from '../../../src/services/meetingStore';
import { configStore } from '../../../src/services/configStore';
import { sanitizationService } from '../../../src/services/sanitizationService';
import { getGraphClient } from '../../../src/config/graph';
import { s3Client } from '../../../src/config/s3';
import { Meeting, Transcript } from '../../../src/models';

const mockGetGraphClient = getGraphClient as jest.Mock;
const mockS3Send = s3Client.send as jest.Mock;

const mockMeeting: Meeting = {
  id: 'meeting-1',
  tenantId: 'test-tenant',
  subject: 'Test Meeting',
  description: '',
  startTime: '2025-07-10T10:00:00Z',
  endTime: '2025-07-10T11:00:00Z',
  organizerId: 'org@test.com',
  organizerEmail: 'org@test.com',
  organizerDisplayName: 'Organizer',
  attendees: [],
  status: 'scheduled',
  subscriptionId: 'sub-1',
  onlineMeetingId: 'online-meeting-1',
  createdAt: '2025-07-01T00:00:00Z',
  updatedAt: '2025-07-01T00:00:00Z',
};

describe('transcriptService', () => {
  let mockGraphApi: jest.Mock;
  let mockApiGet: jest.Mock;
  let mockResponseType: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet = jest.fn();
    mockResponseType = jest.fn(() => ({ get: mockApiGet }));
    mockGraphApi = jest.fn(() => ({ responseType: mockResponseType }));
    mockGetGraphClient.mockReturnValue({ api: mockGraphApi });
  });

  describe('fetchAndStore', () => {
    test('fetches transcript and stores to S3', async () => {
      const rawContent = 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello world';
      mockApiGet.mockResolvedValue(rawContent);
      mockS3Send.mockResolvedValue({});
      (transcriptStore.put as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateS3Paths as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.get as jest.Mock).mockResolvedValue({
        id: 'mock-transcript-uuid',
        meetingId: 'meeting-1',
        status: 'completed',
      });
      (meetingStore.setTranscriptionId as jest.Mock).mockResolvedValue(undefined);
      (configStore.incrementCounter as jest.Mock).mockResolvedValue(undefined);
      (sanitizationService.sanitize as jest.Mock).mockResolvedValue('WEBVTT\n\nSanitized');

      const result = await transcriptService.fetchAndStore(mockMeeting, 'graph-t-1');

      expect(transcriptStore.put).toHaveBeenCalled();
      const savedTranscript = (transcriptStore.put as jest.Mock).mock.calls[0][0];
      expect(savedTranscript.status).toBe('fetching');
      expect(savedTranscript.meetingId).toBe('meeting-1');

      expect(meetingStore.setTranscriptionId).toHaveBeenCalledWith('meeting-1', 'mock-transcript-uuid');
      expect(mockS3Send).toHaveBeenCalled();
      expect(transcriptStore.updateS3Paths).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    test('sanitizes when sanitization enabled', async () => {
      mockApiGet.mockResolvedValue('raw transcript content');
      mockS3Send.mockResolvedValue({});
      (transcriptStore.put as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateS3Paths as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.get as jest.Mock).mockResolvedValue({ id: 'mock-transcript-uuid' });
      (meetingStore.setTranscriptionId as jest.Mock).mockResolvedValue(undefined);
      (meetingStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (configStore.incrementCounter as jest.Mock).mockResolvedValue(undefined);
      (sanitizationService.sanitize as jest.Mock).mockResolvedValue('sanitized content');

      await transcriptService.fetchAndStore(mockMeeting, 'graph-t-1');

      expect(sanitizationService.sanitize).toHaveBeenCalledWith('raw transcript content');
    });

    test('handles non-string content response', async () => {
      mockApiGet.mockResolvedValue({ data: 'json response' });
      mockS3Send.mockResolvedValue({});
      (transcriptStore.put as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateS3Paths as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.get as jest.Mock).mockResolvedValue({ id: 'mock-transcript-uuid' });
      (meetingStore.setTranscriptionId as jest.Mock).mockResolvedValue(undefined);
      (meetingStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (configStore.incrementCounter as jest.Mock).mockResolvedValue(undefined);
      (sanitizationService.sanitize as jest.Mock).mockResolvedValue('{}');

      await transcriptService.fetchAndStore(mockMeeting, 'graph-t-1');

      expect(mockS3Send).toHaveBeenCalled();
    });

    test('handles fetch error', async () => {
      mockApiGet.mockRejectedValue(new Error('Graph API error'));
      (transcriptStore.put as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (meetingStore.setTranscriptionId as jest.Mock).mockResolvedValue(undefined);
      (meetingStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (configStore.incrementCounter as jest.Mock).mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(
        transcriptService.fetchAndStore(mockMeeting, 'graph-t-1')
      ).rejects.toThrow('Graph API error');

      expect(transcriptStore.updateStatus).toHaveBeenCalledWith(
        'mock-transcript-uuid', 'failed', 'Graph API error'
      );
      expect(meetingStore.updateStatus).toHaveBeenCalledWith('meeting-1', 'failed');
      consoleSpy.mockRestore();
    });

    test('skips sanitization when disabled', async () => {
      // Temporarily override config
      const configMod = require('../../../src/config');
      const origEnabled = configMod.config.sanitization.enabled;
      configMod.config.sanitization.enabled = false;

      mockApiGet.mockResolvedValue('raw content');
      mockS3Send.mockResolvedValue({});
      (transcriptStore.put as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateS3Paths as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.get as jest.Mock).mockResolvedValue({ id: 'mock-transcript-uuid' });
      (meetingStore.setTranscriptionId as jest.Mock).mockResolvedValue(undefined);
      (meetingStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (configStore.incrementCounter as jest.Mock).mockResolvedValue(undefined);

      await transcriptService.fetchAndStore(mockMeeting, 'graph-t-1');

      expect(sanitizationService.sanitize).not.toHaveBeenCalled();
      expect(transcriptStore.updateStatus).toHaveBeenCalledWith('mock-transcript-uuid', 'completed');
      expect(meetingStore.updateStatus).toHaveBeenCalledWith('meeting-1', 'completed');

      configMod.config.sanitization.enabled = origEnabled;
    });
  });

  describe('sanitizeTranscript', () => {
    test('sanitizes and stores to S3', async () => {
      (sanitizationService.sanitize as jest.Mock).mockResolvedValue('sanitized output');
      mockS3Send.mockResolvedValue({});
      (transcriptStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (transcriptStore.updateS3Paths as jest.Mock).mockResolvedValue(undefined);
      (meetingStore.updateStatus as jest.Mock).mockResolvedValue(undefined);
      (configStore.incrementCounter as jest.Mock).mockResolvedValue(undefined);

      await transcriptService.sanitizeTranscript('t-1', 'raw text', 'meeting-1');

      expect(transcriptStore.updateStatus).toHaveBeenCalledWith('t-1', 'sanitizing');
      expect(sanitizationService.sanitize).toHaveBeenCalledWith('raw text');
      expect(mockS3Send).toHaveBeenCalled();
      expect(transcriptStore.updateStatus).toHaveBeenCalledWith('t-1', 'completed');
      expect(meetingStore.updateStatus).toHaveBeenCalledWith('meeting-1', 'completed');
    });

    test('handles sanitization error', async () => {
      (sanitizationService.sanitize as jest.Mock).mockRejectedValue(new Error('Sanitize failed'));
      (transcriptStore.updateStatus as jest.Mock).mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await transcriptService.sanitizeTranscript('t-1', 'raw', 'meeting-1');

      expect(transcriptStore.updateStatus).toHaveBeenCalledWith(
        't-1', 'failed', 'Sanitization failed: Sanitize failed'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getTranscript', () => {
    test('delegates to transcriptStore', async () => {
      const mockT: Transcript = {
        id: 't-1', meetingId: 'm-1', status: 'completed',
        language: 'en', createdAt: '', updatedAt: '',
      };
      (transcriptStore.get as jest.Mock).mockResolvedValue(mockT);

      const result = await transcriptService.getTranscript('t-1');
      expect(result).toEqual(mockT);
    });
  });

  describe('getTranscriptByMeetingId', () => {
    test('delegates to transcriptStore', async () => {
      (transcriptStore.getByMeetingId as jest.Mock).mockResolvedValue(null);

      const result = await transcriptService.getTranscriptByMeetingId('m-1');
      expect(result).toBeNull();
    });
  });

  describe('getTranscriptContent', () => {
    test('retrieves raw content from S3', async () => {
      const transcript: Transcript = {
        id: 't-1', meetingId: 'm-1', status: 'completed', language: 'en',
        rawS3Path: 's3://test-raw-bucket/raw/m-1/t-1.vtt',
        createdAt: '', updatedAt: '',
      };
      mockS3Send.mockResolvedValue({
        Body: { transformToString: jest.fn().mockResolvedValue('raw vtt content') },
      });

      const result = await transcriptService.getTranscriptContent(transcript, 'raw');
      expect(result).toBe('raw vtt content');
    });

    test('retrieves sanitized content from S3', async () => {
      const transcript: Transcript = {
        id: 't-1', meetingId: 'm-1', status: 'completed', language: 'en',
        sanitizedS3Path: 's3://test-sanitized-bucket/sanitized/m-1/t-1.vtt',
        createdAt: '', updatedAt: '',
      };
      mockS3Send.mockResolvedValue({
        Body: { transformToString: jest.fn().mockResolvedValue('sanitized vtt') },
      });

      const result = await transcriptService.getTranscriptContent(transcript, 'sanitized');
      expect(result).toBe('sanitized vtt');
    });

    test('returns null when no S3 path', async () => {
      const transcript: Transcript = {
        id: 't-1', meetingId: 'm-1', status: 'completed', language: 'en',
        createdAt: '', updatedAt: '',
      };

      const result = await transcriptService.getTranscriptContent(transcript, 'raw');
      expect(result).toBeNull();
    });

    test('returns null for invalid S3 path format', async () => {
      const transcript: Transcript = {
        id: 't-1', meetingId: 'm-1', status: 'completed', language: 'en',
        rawS3Path: 'invalid-path',
        createdAt: '', updatedAt: '',
      };

      const result = await transcriptService.getTranscriptContent(transcript, 'raw');
      expect(result).toBeNull();
    });

    test('returns null on S3 error', async () => {
      const transcript: Transcript = {
        id: 't-1', meetingId: 'm-1', status: 'completed', language: 'en',
        rawS3Path: 's3://bucket/key.vtt',
        createdAt: '', updatedAt: '',
      };
      mockS3Send.mockRejectedValue(new Error('S3 error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await transcriptService.getTranscriptContent(transcript, 'raw');
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    test('defaults to sanitized type', async () => {
      const transcript: Transcript = {
        id: 't-1', meetingId: 'm-1', status: 'completed', language: 'en',
        sanitizedS3Path: 's3://bucket/sanitized.vtt',
        createdAt: '', updatedAt: '',
      };
      mockS3Send.mockResolvedValue({
        Body: { transformToString: jest.fn().mockResolvedValue('content') },
      });

      const result = await transcriptService.getTranscriptContent(transcript);
      expect(result).toBe('content');
    });
  });

  describe('listTranscripts', () => {
    test('delegates to transcriptStore', async () => {
      (transcriptStore.listAll as jest.Mock).mockResolvedValue([]);

      const result = await transcriptService.listTranscripts({ status: 'completed' });
      expect(transcriptStore.listAll).toHaveBeenCalledWith({ status: 'completed' });
      expect(result).toEqual([]);
    });
  });
});
