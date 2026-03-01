jest.mock('../../../src/config/dynamodb', () => ({
  dynamoDb: { send: jest.fn() },
}));

jest.mock('../../../src/config', () => ({
  config: {
    aws: {
      dynamodb: { meetingsTable: 'test-meetings-table' },
    },
  },
}));

import { meetingStore } from '../../../src/services/meetingStore';
import { dynamoDb } from '../../../src/config/dynamodb';
import { Meeting } from '../../../src/models';

const mockSend = dynamoDb.send as jest.Mock;

const mockMeeting: Meeting = {
  meeting_id: 'meeting-1',
  tenantId: 'tenant-1',
  subject: 'Test Meeting',
  description: 'A test meeting',
  startTime: '2025-07-10T10:00:00Z',
  endTime: '2025-07-10T11:00:00Z',
  organizerId: 'org-1',
  organizerEmail: 'org@test.com',
  organizerDisplayName: 'Organizer',
  attendees: [],
  status: 'scheduled',
  subscriptionId: 'sub-1',
  createdAt: '2025-07-01T00:00:00Z',
  updatedAt: '2025-07-01T00:00:00Z',
};

describe('meetingStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('put', () => {
    test('saves meeting to DynamoDB', async () => {
      mockSend.mockResolvedValue({});

      await meetingStore.put(mockMeeting);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const call = mockSend.mock.calls[0][0];
      expect(call.input.Item.meeting_id).toBe('meeting-1');
      expect(call.input.TableName).toBe('test-meetings-table');
    });
  });

  describe('get', () => {
    test('returns meeting when found', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [{ meeting_id: 'meeting-1', created_at: '2025-07-01T00:00:00Z' }] })
        .mockResolvedValueOnce({ Item: mockMeeting });

      const result = await meetingStore.get('meeting-1');
      expect(result).toEqual(mockMeeting);
    });

    test('returns null when not found', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      const result = await meetingStore.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    test('returns paginated meetings sorted by startTime desc', async () => {
      const m1 = { ...mockMeeting, meeting_id: 'm1', startTime: '2025-07-10T10:00:00Z' };
      const m2 = { ...mockMeeting, meeting_id: 'm2', startTime: '2025-07-11T10:00:00Z' };
      mockSend.mockResolvedValue({ Items: [m1, m2] });

      const result = await meetingStore.list();
      expect(result.totalCount).toBe(2);
      expect(result.meetings[0].meeting_id).toBe('m2');
      expect(result.meetings[1].meeting_id).toBe('m1');
    });

    test('applies status filter', async () => {
      mockSend.mockResolvedValue({ Items: [mockMeeting] });

      await meetingStore.list({ status: 'scheduled' });
      const call = mockSend.mock.calls[0][0];
      expect(call.input.FilterExpression).toContain('#status = :status');
      expect(call.input.ExpressionAttributeValues[':status']).toBe('scheduled');
    });

    test('applies organizerEmail filter', async () => {
      mockSend.mockResolvedValue({ Items: [mockMeeting] });

      await meetingStore.list({ organizerEmail: 'org@test.com' });
      const call = mockSend.mock.calls[0][0];
      expect(call.input.FilterExpression).toContain('organizerEmail = :orgEmail');
    });

    test('applies date range filters', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      await meetingStore.list({ from: '2025-07-01', to: '2025-07-31' });
      const call = mockSend.mock.calls[0][0];
      expect(call.input.FilterExpression).toContain('startTime >= :fromDate');
      expect(call.input.FilterExpression).toContain('startTime <= :toDate');
    });

    test('paginates results', async () => {
      const items = Array.from({ length: 25 }, (_, i) => ({
        ...mockMeeting,
        meeting_id: `m${i}`,
        startTime: `2025-07-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      }));
      mockSend.mockResolvedValue({ Items: items });

      const page1 = await meetingStore.list({ page: 1, pageSize: 10 });
      expect(page1.meetings.length).toBe(10);
      expect(page1.totalCount).toBe(25);

      mockSend.mockResolvedValue({ Items: items });
      const page2 = await meetingStore.list({ page: 2, pageSize: 10 });
      expect(page2.meetings.length).toBe(10);
    });

    test('returns empty results', async () => {
      mockSend.mockResolvedValue({ Items: undefined });

      const result = await meetingStore.list();
      expect(result.meetings).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('updateStatus', () => {
    test('updates meeting status', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [{ meeting_id: 'meeting-1', created_at: '2025-07-01T00:00:00Z' }] })
        .mockResolvedValueOnce({});

      await meetingStore.updateStatus('meeting-1', 'completed');
      const updateCall = mockSend.mock.calls[1][0];
      expect(updateCall.input.Key).toEqual({ meeting_id: 'meeting-1', created_at: '2025-07-01T00:00:00Z' });
      expect(updateCall.input.ExpressionAttributeValues[':status']).toBe('completed');
    });
  });

  describe('setTranscriptionId', () => {
    test('sets transcription id and status', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [{ meeting_id: 'meeting-1', created_at: '2025-07-01T00:00:00Z' }] })
        .mockResolvedValueOnce({});

      await meetingStore.setTranscriptionId('meeting-1', 'transcript-1');
      const updateCall = mockSend.mock.calls[1][0];
      expect(updateCall.input.ExpressionAttributeValues[':tid']).toBe('transcript-1');
      expect(updateCall.input.ExpressionAttributeValues[':status']).toBe('transcript_pending');
    });
  });
});
