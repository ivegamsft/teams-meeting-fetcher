jest.mock('../../../src/config/graph', () => ({
  getGraphClient: jest.fn(),
}));

jest.mock('../../../src/config', () => ({
  config: {
    graph: { tenantId: 'test-tenant', entraGroupId: 'test-group' },
    webhook: { notificationUrl: 'https://webhook.test', clientState: 'test-state' },
    aws: {
      dynamodb: {
        subscriptionsTable: 'test-subs',
        meetingsTable: 'test-meetings',
        transcriptsTable: 'test-transcripts',
        configTable: 'test-config',
      },
      s3: { rawBucket: 'raw', sanitizedBucket: 'sanitized' },
    },
    sanitization: { enabled: true },
  },
}));

jest.mock('../../../src/config/dynamodb', () => ({
  dynamoDb: { send: jest.fn() },
}));

jest.mock('../../../src/services/meetingStore', () => ({
  meetingStore: {
    put: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    updateStatus: jest.fn(),
    setTranscriptionId: jest.fn(),
  },
}));

jest.mock('../../../src/services/transcriptService', () => ({
  transcriptService: {
    fetchAndStore: jest.fn(),
  },
}));

jest.mock('../../../src/services/configStore', () => ({
  configStore: {
    incrementCounter: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

import { meetingService } from '../../../src/services/meetingService';
import { meetingStore } from '../../../src/services/meetingStore';
import { transcriptService } from '../../../src/services/transcriptService';
import { configStore } from '../../../src/services/configStore';
import { getGraphClient } from '../../../src/config/graph';
import { Meeting } from '../../../src/models';

const mockGetGraphClient = getGraphClient as jest.Mock;

const mockMeeting: Meeting = {
  id: 'event-123',
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
  createdAt: '2025-07-01T00:00:00Z',
  updatedAt: '2025-07-01T00:00:00Z',
};

describe('meetingService', () => {
  let mockGraphApi: jest.Mock;
  let mockApiGet: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet = jest.fn();
    mockGraphApi = jest.fn(() => ({ get: mockApiGet }));
    mockGetGraphClient.mockReturnValue({ api: mockGraphApi });
  });

  describe('processNotification', () => {
    test('handles deleted changeType', async () => {
      (meetingStore.get as jest.Mock).mockResolvedValue(mockMeeting);

      await meetingService.processNotification({
        resource: 'users/user-1/events/event-123',
        changeType: 'deleted',
        subscriptionId: 'sub-1',
      });

      expect(meetingStore.updateStatus).toHaveBeenCalledWith('event-123', 'cancelled');
    });

    test('skips deleted if meeting not found', async () => {
      (meetingStore.get as jest.Mock).mockResolvedValue(null);

      await meetingService.processNotification({
        resource: 'users/user-1/events/nonexistent',
        changeType: 'deleted',
        subscriptionId: 'sub-1',
      });

      expect(meetingStore.updateStatus).not.toHaveBeenCalled();
    });

    test('creates new meeting for created changeType', async () => {
      (meetingStore.get as jest.Mock).mockResolvedValue(null);
      (meetingStore.put as jest.Mock).mockResolvedValue(undefined);
      (configStore.incrementCounter as jest.Mock).mockResolvedValue(undefined);
      mockApiGet.mockResolvedValue({
        id: 'event-123',
        subject: 'New Meeting',
        bodyPreview: 'Description',
        start: { dateTime: '2025-07-10T10:00:00Z' },
        end: { dateTime: '2025-07-10T11:00:00Z' },
        organizer: { emailAddress: { address: 'org@test.com', name: 'Organizer' } },
        attendees: [],
        isOnlineMeeting: false,
      });

      await meetingService.processNotification({
        resource: 'users/user-1/events/event-123',
        changeType: 'created',
        subscriptionId: 'sub-1',
      });

      expect(meetingStore.put).toHaveBeenCalled();
      expect(configStore.incrementCounter).toHaveBeenCalledWith('monitoredMeetingsCount', 1);
    });

    test('updates existing meeting for updated changeType', async () => {
      (meetingStore.get as jest.Mock).mockResolvedValue(mockMeeting);
      (meetingStore.put as jest.Mock).mockResolvedValue(undefined);
      mockApiGet.mockResolvedValue({
        subject: 'Updated Meeting',
        start: { dateTime: '2025-07-10T10:00:00Z' },
        end: { dateTime: '2025-07-10T12:00:00Z' },
        attendees: [],
        isOnlineMeeting: false,
      });

      await meetingService.processNotification({
        resource: 'users/user-1/events/event-123',
        changeType: 'updated',
        subscriptionId: 'sub-1',
      });

      expect(meetingStore.put).toHaveBeenCalled();
      const savedMeeting = (meetingStore.put as jest.Mock).mock.calls[0][0];
      expect(savedMeeting.subject).toBe('Updated Meeting');
    });

    test('handles Graph API error gracefully', async () => {
      (meetingStore.get as jest.Mock).mockResolvedValue(null);
      mockApiGet.mockRejectedValue(new Error('Graph API unavailable'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await meetingService.processNotification({
        resource: 'users/user-1/events/event-123',
        changeType: 'created',
        subscriptionId: 'sub-1',
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(meetingStore.put).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('createMeeting', () => {
    test('creates meeting with attendees', async () => {
      (meetingStore.put as jest.Mock).mockResolvedValue(undefined);
      (configStore.incrementCounter as jest.Mock).mockResolvedValue(undefined);

      const eventData = {
        id: 'event-456',
        subject: 'Team Sync',
        bodyPreview: 'Weekly sync',
        start: { dateTime: '2025-07-10T10:00:00Z' },
        end: { dateTime: '2025-07-10T11:00:00Z' },
        organizer: { emailAddress: { address: 'boss@test.com', name: 'Boss' } },
        attendees: [
          {
            emailAddress: { address: 'dev@test.com', name: 'Dev' },
            type: 'required',
            status: { response: 'accepted' },
          },
        ],
        isOnlineMeeting: false,
      };

      const result = await meetingService.createMeeting(eventData, 'sub-1', 'users/u/events/e');
      expect(result.subject).toBe('Team Sync');
      expect(result.attendees).toHaveLength(1);
      expect(result.attendees[0].email).toBe('dev@test.com');
      expect(result.attendees[0].role).toBe('required');
    });

    test('checks transcript for online meetings', async () => {
      (meetingStore.put as jest.Mock).mockResolvedValue(undefined);
      (configStore.incrementCounter as jest.Mock).mockResolvedValue(undefined);
      mockApiGet.mockResolvedValue({ value: [] });

      const eventData = {
        id: 'event-789',
        subject: 'Online Meeting',
        start: { dateTime: '2025-07-10T10:00:00Z' },
        end: { dateTime: '2025-07-10T11:00:00Z' },
        organizer: { emailAddress: { address: 'org@test.com', name: 'Org' } },
        attendees: [],
        isOnlineMeeting: true,
        onlineMeetingId: 'online-123',
      };

      await meetingService.createMeeting(eventData, 'sub-1', 'users/u/events/e');

      // checkForTranscript is called async (fire-and-forget)
      // Verify transcript service was potentially invoked via the graph client
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  });

  describe('updateMeeting', () => {
    test('cancels meeting if isCancelled', async () => {
      (meetingStore.updateStatus as jest.Mock).mockResolvedValue(undefined);

      await meetingService.updateMeeting(mockMeeting, { isCancelled: true });
      expect(meetingStore.updateStatus).toHaveBeenCalledWith('event-123', 'cancelled');
    });

    test('updates meeting fields', async () => {
      (meetingStore.put as jest.Mock).mockResolvedValue(undefined);

      await meetingService.updateMeeting(mockMeeting, {
        subject: 'Updated Subject',
        start: { dateTime: '2025-07-11T10:00:00Z' },
        attendees: [],
        isOnlineMeeting: false,
      });

      const saved = (meetingStore.put as jest.Mock).mock.calls[0][0];
      expect(saved.subject).toBe('Updated Subject');
      expect(saved.startTime).toBe('2025-07-11T10:00:00Z');
    });
  });

  describe('checkForTranscript', () => {
    test('fetches transcript when available', async () => {
      mockApiGet.mockResolvedValue({
        value: [{ id: 'graph-transcript-1' }],
      });
      (transcriptService.fetchAndStore as jest.Mock).mockResolvedValue({});

      await meetingService.checkForTranscript({
        ...mockMeeting,
        onlineMeetingId: 'online-123',
      });

      expect(transcriptService.fetchAndStore).toHaveBeenCalled();
    });

    test('skips when no onlineMeetingId', async () => {
      await meetingService.checkForTranscript({
        ...mockMeeting,
        onlineMeetingId: undefined,
      });

      expect(mockGetGraphClient).not.toHaveBeenCalled();
    });

    test('handles 404 silently', async () => {
      mockApiGet.mockRejectedValue({ statusCode: 404, message: 'Not found' });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await meetingService.checkForTranscript({
        ...mockMeeting,
        onlineMeetingId: 'online-123',
      });

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('logs non-404 errors', async () => {
      mockApiGet.mockRejectedValue({ statusCode: 500, message: 'Server error' });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await meetingService.checkForTranscript({
        ...mockMeeting,
        onlineMeetingId: 'online-123',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('findMeetingByResource', () => {
    test('extracts event id from resource path', async () => {
      (meetingStore.get as jest.Mock).mockResolvedValue(mockMeeting);

      const result = await meetingService.findMeetingByResource('users/user-1/events/event-123');
      expect(meetingStore.get).toHaveBeenCalledWith('event-123');
      expect(result).toEqual(mockMeeting);
    });
  });

  describe('getMeeting', () => {
    test('delegates to meetingStore.get', async () => {
      (meetingStore.get as jest.Mock).mockResolvedValue(mockMeeting);

      const result = await meetingService.getMeeting('meeting-1');
      expect(meetingStore.get).toHaveBeenCalledWith('meeting-1');
      expect(result).toEqual(mockMeeting);
    });
  });

  describe('listMeetings', () => {
    test('delegates to meetingStore.list', async () => {
      const mockResult = { meetings: [mockMeeting], totalCount: 1 };
      (meetingStore.list as jest.Mock).mockResolvedValue(mockResult);

      const result = await meetingService.listMeetings({ status: 'scheduled' });
      expect(meetingStore.list).toHaveBeenCalledWith({ status: 'scheduled' });
      expect(result).toEqual(mockResult);
    });
  });
});
