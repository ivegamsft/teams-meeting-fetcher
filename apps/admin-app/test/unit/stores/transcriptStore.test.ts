jest.mock('../../../src/config/dynamodb', () => ({
  dynamoDb: { send: jest.fn() },
}));

jest.mock('../../../src/config', () => ({
  config: {
    aws: {
      dynamodb: { transcriptsTable: 'test-transcripts-table' },
    },
  },
}));

import { transcriptStore } from '../../../src/services/transcriptStore';
import { dynamoDb } from '../../../src/config/dynamodb';
import { Transcript } from '../../../src/models';

const mockSend = dynamoDb.send as jest.Mock;

const mockTranscript: Transcript = {
  id: 'transcript-1',
  meetingId: 'meeting-1',
  status: 'completed',
  language: 'en',
  rawS3Path: 's3://raw-bucket/raw/meeting-1/transcript-1.vtt',
  sanitizedS3Path: 's3://sanitized-bucket/sanitized/meeting-1/transcript-1.vtt',
  createdAt: '2025-07-01T00:00:00Z',
  updatedAt: '2025-07-01T00:00:00Z',
};

describe('transcriptStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('put', () => {
    test('saves transcript to DynamoDB', async () => {
      mockSend.mockResolvedValue({});

      await transcriptStore.put(mockTranscript);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.Item).toEqual(mockTranscript);
      expect(call.input.TableName).toBe('test-transcripts-table');
    });
  });

  describe('get', () => {
    test('returns transcript when found', async () => {
      mockSend.mockResolvedValue({ Item: mockTranscript });

      const result = await transcriptStore.get('transcript-1');
      expect(result).toEqual(mockTranscript);
    });

    test('returns null when not found', async () => {
      mockSend.mockResolvedValue({});

      const result = await transcriptStore.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getByMeetingId', () => {
    test('returns transcript for meeting', async () => {
      mockSend.mockResolvedValue({ Items: [mockTranscript] });

      const result = await transcriptStore.getByMeetingId('meeting-1');
      expect(result).toEqual(mockTranscript);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.FilterExpression).toBe('meetingId = :mid');
      expect(call.input.ExpressionAttributeValues[':mid']).toBe('meeting-1');
    });

    test('returns null when no transcript for meeting', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const result = await transcriptStore.getByMeetingId('nonexistent');
      expect(result).toBeNull();
    });

    test('returns null when Items is undefined', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await transcriptStore.getByMeetingId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listAll', () => {
    test('returns all transcripts without filter', async () => {
      mockSend.mockResolvedValue({ Items: [mockTranscript] });

      const result = await transcriptStore.listAll();
      expect(result).toEqual([mockTranscript]);
    });

    test('filters by status', async () => {
      mockSend.mockResolvedValue({ Items: [mockTranscript] });

      await transcriptStore.listAll({ status: 'completed' });
      const call = mockSend.mock.calls[0][0];
      expect(call.input.FilterExpression).toContain('#status = :status');
      expect(call.input.ExpressionAttributeValues[':status']).toBe('completed');
    });

    test('returns empty array when no items', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await transcriptStore.listAll();
      expect(result).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    test('updates status without error message', async () => {
      mockSend.mockResolvedValue({});

      await transcriptStore.updateStatus('transcript-1', 'raw_stored');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeValues[':status']).toBe('raw_stored');
      expect(call.input.UpdateExpression).not.toContain('errorMessage');
    });

    test('updates status with error message', async () => {
      mockSend.mockResolvedValue({});

      await transcriptStore.updateStatus('transcript-1', 'failed', 'Fetch error');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeValues[':err']).toBe('Fetch error');
      expect(call.input.UpdateExpression).toContain('errorMessage');
    });

    test('sets processedAt when status is completed', async () => {
      mockSend.mockResolvedValue({});

      await transcriptStore.updateStatus('transcript-1', 'completed');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.UpdateExpression).toContain('processedAt');
    });
  });

  describe('updateS3Paths', () => {
    test('updates raw S3 path', async () => {
      mockSend.mockResolvedValue({});

      await transcriptStore.updateS3Paths('transcript-1', 's3://bucket/raw.vtt');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeValues[':rawPath']).toBe('s3://bucket/raw.vtt');
    });

    test('updates sanitized S3 path', async () => {
      mockSend.mockResolvedValue({});

      await transcriptStore.updateS3Paths('transcript-1', undefined, 's3://bucket/sanitized.vtt');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeValues[':sanPath']).toBe('s3://bucket/sanitized.vtt');
      expect(call.input.ExpressionAttributeValues[':rawPath']).toBeUndefined();
    });

    test('updates both paths', async () => {
      mockSend.mockResolvedValue({});

      await transcriptStore.updateS3Paths('transcript-1', 's3://raw/path', 's3://san/path');
      const call = mockSend.mock.calls[0][0];
      expect(call.input.ExpressionAttributeValues[':rawPath']).toBe('s3://raw/path');
      expect(call.input.ExpressionAttributeValues[':sanPath']).toBe('s3://san/path');
    });
  });
});
