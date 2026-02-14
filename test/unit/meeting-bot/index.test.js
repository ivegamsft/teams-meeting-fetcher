/**
 * index.test.js – Unit tests for meeting-bot Lambda handler
 *
 * These tests mock ALL external dependencies (DynamoDB, S3, Graph API)
 * to test the business logic in isolation.
 *
 * Bugs these tests would have caught:
 *   1. userId scoping bug — `const userId` inside try{} but used after catch{}
 *   2. Transcript endpoints using /communications/ instead of /users/{userId}/
 *   3. Mention stripping leaving bot name text in the message
 */
'use strict';

// ─── Stub external dependencies BEFORE require ──────────────────────────────

// Mock graph-client
const mockGraphRequest = jest.fn().mockResolvedValue({ value: [] });
const mockGetMeetingTranscripts = jest.fn().mockResolvedValue({ value: [] });
const mockGetTranscriptContent = jest
  .fn()
  .mockResolvedValue('WEBVTT\n\n00:00:00 --> 00:00:05\nHello');
const mockSendBotMessage = jest.fn().mockResolvedValue({});
const mockReplyToActivity = jest.fn().mockResolvedValue({});
const mockIsUserInGroup = jest.fn().mockResolvedValue(true);
const mockGetUpcomingOnlineMeetings = jest.fn().mockResolvedValue({ value: [] });
const mockGetOnlineMeetingByJoinUrl = jest.fn().mockResolvedValue(null);
const mockGetInstalledAppsInChat = jest.fn().mockResolvedValue({ value: [] });
const mockInstallAppInChat = jest.fn().mockResolvedValue({});
const mockGetGroupMembers = jest.fn().mockResolvedValue([]);

jest.mock('../../../lambda/meeting-bot/graph-client', () => ({
  graphRequest: mockGraphRequest,
  getMeetingTranscripts: mockGetMeetingTranscripts,
  getTranscriptContent: mockGetTranscriptContent,
  sendBotMessage: mockSendBotMessage,
  replyToActivity: mockReplyToActivity,
  isUserInGroup: mockIsUserInGroup,
  getUpcomingOnlineMeetings: mockGetUpcomingOnlineMeetings,
  getOnlineMeetingByJoinUrl: mockGetOnlineMeetingByJoinUrl,
  getInstalledAppsInChat: mockGetInstalledAppsInChat,
  installAppInChat: mockInstallAppInChat,
  getGroupMembers: mockGetGroupMembers,
}));

// Mock AWS SDK
const mockDynamoPut = jest.fn().mockReturnValue({ promise: () => Promise.resolve() });
const mockDynamoGet = jest.fn().mockReturnValue({ promise: () => Promise.resolve({ Item: null }) });
const mockDynamoUpdate = jest.fn().mockReturnValue({ promise: () => Promise.resolve() });
const mockS3PutObject = jest.fn().mockReturnValue({ promise: () => Promise.resolve() });

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      put: mockDynamoPut,
      get: mockDynamoGet,
      update: mockDynamoUpdate,
    })),
  },
  S3: jest.fn(() => ({
    putObject: mockS3PutObject,
  })),
}));

// Set env vars before loading module
process.env.MEETINGS_TABLE = 'test-table';
process.env.TRANSCRIPT_BUCKET = 'test-transcript-bucket';
process.env.BOT_APP_ID = 'test-bot-app-id';
process.env.ALLOWED_GROUP_ID = '';
process.env.GRAPH_TENANT_ID = 'test-tenant';
process.env.TEAMS_CATALOG_APP_ID = 'test-catalog-app-id';
process.env.WATCHED_USER_IDS = 'user-1,user-2';
process.env.POLL_LOOKAHEAD_MINUTES = '60';

const { handler } = require('../../../lambda/meeting-bot/index');

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeEvent(body) {
  return {
    path: '/bot/messages',
    rawPath: '/bot/messages',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function makeMessageActivity(text, overrides = {}) {
  return {
    type: 'message',
    text,
    id: 'activity-id-123',
    serviceUrl: 'https://smba.trafficmanager.net/test/',
    from: {
      id: '29:user-bot-id',
      name: 'Test User',
      aadObjectId: 'user-aad-id',
    },
    conversation: {
      id: '19:meeting_test@thread.v2',
      isGroup: true,
    },
    recipient: {
      id: '28:test-bot-app-id',
      name: 'Meeting Fetcher',
    },
    channelId: 'msteams',
    channelData: {
      tenant: { id: 'test-tenant' },
      meeting: { id: 'test-meeting-id' },
    },
    ...overrides,
  };
}

function makeMeetingEndActivity(overrides = {}) {
  return {
    type: 'event',
    name: 'application/vnd.microsoft.meetingEnd',
    serviceUrl: 'https://smba.trafficmanager.net/test/',
    from: {
      id: '29:sender-id',
      name: 'Test User',
      aadObjectId: 'organizer-aad-id',
    },
    conversation: {
      id: '19:meeting_test@thread.v2',
    },
    channelData: {
      tenant: { id: 'test-tenant' },
      meeting: { id: 'test-meeting-id-base64==' },
    },
    value: {
      MeetingType: 'Scheduled',
      Title: 'Test Meeting',
      Id: 'test-meeting-id-base64==',
      JoinUrl:
        'https://teams.microsoft.com/l/meetup-join/19%3ameeting_test%40thread.v2/0?context=test',
      EndTime: '2026-02-13T23:00:00Z',
    },
    ...overrides,
  };
}

function makeMeetingStartActivity(overrides = {}) {
  return {
    type: 'event',
    name: 'application/vnd.microsoft.meetingStart',
    serviceUrl: 'https://smba.trafficmanager.net/test/',
    from: {
      id: '29:sender-id',
      name: '',
      aadObjectId: 'organizer-aad-id',
    },
    conversation: {
      id: '19:meeting_test@thread.v2',
    },
    channelData: {
      tenant: { id: 'test-tenant' },
      meeting: { id: 'test-meeting-id-base64==' },
    },
    value: {
      MeetingType: 'Scheduled',
      Title: 'Test Meeting',
      Id: 'test-meeting-id-base64==',
      JoinUrl: 'https://teams.microsoft.com/l/meetup-join/test',
    },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Meeting Bot Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no existing session in DynamoDB
    mockDynamoGet.mockReturnValue({
      promise: () => Promise.resolve({ Item: null }),
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Message handling & mention stripping
  // ══════════════════════════════════════════════════════════════════════════

  describe('Message handling (mention stripping)', () => {
    it('should recognize /debug when wrapped in <at> mention', async () => {
      const activity = makeMessageActivity('<at>Meeting Fetcher</at> /debug');
      const event = makeEvent(activity);

      // Provide a session for debug to display
      mockDynamoGet.mockReturnValue({
        promise: () =>
          Promise.resolve({
            Item: { meeting_id: 'test', status: 'active', event_type: 'meetingStart' },
          }),
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      // Debug command renders a table — it should have called replyToActivity
      // with content containing "Meeting Session" or "Current Context"
      expect(mockReplyToActivity).toHaveBeenCalled();
      const replyText = mockReplyToActivity.mock.calls[0][3];
      expect(replyText).toMatch(/Current Context|Meeting Session|DynamoDB/);
    });

    it('should recognize /info after stripping <at> mention with extra attributes', async () => {
      const activity = makeMessageActivity(
        '<at id="28:test-bot-app-id">Meeting Fetcher</at> /info'
      );
      const event = makeEvent(activity);

      mockDynamoGet.mockReturnValue({
        promise: () => Promise.resolve({ Item: { meeting_id: 'test', status: 'active' } }),
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(mockReplyToActivity).toHaveBeenCalled();
      const replyText = mockReplyToActivity.mock.calls[0][3];
      expect(replyText).toMatch(/Current Context/);
    });

    it('should recognize "help" without any mention wrapper', async () => {
      const activity = makeMessageActivity('help');
      const event = makeEvent(activity);

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(mockReplyToActivity).toHaveBeenCalled();
      const replyText = mockReplyToActivity.mock.calls[0][3];
      expect(replyText).toContain('Meeting Fetcher Help');
    });

    it('should recognize "/help" with slash prefix', async () => {
      const activity = makeMessageActivity('/help');
      const event = makeEvent(activity);

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const replyText = mockReplyToActivity.mock.calls[0][3];
      expect(replyText).toContain('Meeting Fetcher Help');
    });

    it('should strip plain-text bot name + recognize command', async () => {
      // Some Teams clients might send the mention as plain text
      const activity = makeMessageActivity('Meeting Fetcher /record');
      const event = makeEvent(activity);

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      // Should hit the "record" command path — saves session
      expect(mockDynamoPut).toHaveBeenCalled();
    });

    it('should return help for "hi"', async () => {
      const activity = makeMessageActivity('<at>Meeting Fetcher</at> hi');
      const event = makeEvent(activity);

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(mockReplyToActivity).toHaveBeenCalled();
      const replyText = mockReplyToActivity.mock.calls[0][3];
      expect(replyText).toContain('Hello');
    });

    it('should return default message for unknown text', async () => {
      const activity = makeMessageActivity('<at>Meeting Fetcher</at> what is life');
      const event = makeEvent(activity);

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(mockReplyToActivity).toHaveBeenCalled();
      const replyText = mockReplyToActivity.mock.calls[0][3];
      expect(replyText).toContain('Type **Help** to learn more');
    });

    it('should recognize "record" command (no slash)', async () => {
      const activity = makeMessageActivity('<at>Meeting Fetcher</at> record');
      const event = makeEvent(activity);

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      // Manual record saves session
      expect(mockDynamoPut).toHaveBeenCalled();
      const savedItem = mockDynamoPut.mock.calls[0][0].Item;
      expect(savedItem.event_type).toBe('manual_record');
    });

    it('should recognize "status" command', async () => {
      const activity = makeMessageActivity('<at>Meeting Fetcher</at> status');
      const event = makeEvent(activity);

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      // Should query DynamoDB for session
      expect(mockDynamoGet).toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Meeting Start
  // ══════════════════════════════════════════════════════════════════════════

  describe('meetingStart', () => {
    it('should save session to DynamoDB', async () => {
      const event = makeEvent(makeMeetingStartActivity());

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(mockDynamoPut).toHaveBeenCalled();
      const saved = mockDynamoPut.mock.calls[0][0].Item;
      expect(saved.meeting_id).toBe('test-meeting-id-base64==');
      expect(saved.status).toBe('active');
      expect(saved.join_url).toContain('meetup-join');
    });

    it('should send recording notice to chat', async () => {
      const event = makeEvent(makeMeetingStartActivity());

      await handler(event);
      expect(mockSendBotMessage).toHaveBeenCalled();
      const msgText = mockSendBotMessage.mock.calls[0][2];
      expect(msgText).toContain('recorded and transcribed');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Meeting End + Transcript Fetch
  // ══════════════════════════════════════════════════════════════════════════

  describe('meetingEnd + fetchTranscript', () => {
    const ONLINE_MEETING_ID = 'online-meeting-guid-123';
    const ORGANIZER_ID = 'organizer-aad-id';
    const TRANSCRIPT_TEXT = 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nHello world';

    beforeEach(() => {
      jest.useFakeTimers();

      // Simulate: DynamoDB has an active session with join_url
      mockDynamoGet.mockReturnValue({
        promise: () =>
          Promise.resolve({
            Item: {
              meeting_id: 'test-meeting-id-base64==',
              status: 'active',
              join_url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_test%40thread.v2/0',
              organizer_id: ORGANIZER_ID,
              service_url: 'https://smba.trafficmanager.net/test/',
              conversation_id: '19:meeting_test@thread.v2',
            },
          }),
      });

      // Meeting lookup succeeds
      mockGraphRequest.mockResolvedValue({
        value: [
          { id: ONLINE_MEETING_ID, joinWebUrl: 'https://teams.microsoft.com/l/meetup-join/test' },
        ],
      });

      // Transcripts found
      mockGetMeetingTranscripts.mockResolvedValue({
        value: [{ id: 'transcript-1', createdDateTime: '2026-02-13T23:00:00Z' }],
      });

      // Transcript content available
      mockGetTranscriptContent.mockResolvedValue(TRANSCRIPT_TEXT);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // Helper: run handler and advance fake timers past the 30s Graph delay + retries
    // Total worst-case: 30s initial + 15+30+60+60 retry delays = ~195s
    async function runHandler(event) {
      const promise = handler(event);
      await jest.advanceTimersByTimeAsync(300000);
      return promise;
    }

    it('should call getMeetingTranscripts with userId (not just meetingId)', async () => {
      const event = makeEvent(makeMeetingEndActivity());

      await runHandler(event);

      // This is the KEY assertion: getMeetingTranscripts MUST receive userId
      // as its first argument for the user-scoped endpoint.
      expect(mockGetMeetingTranscripts).toHaveBeenCalledWith(ORGANIZER_ID, ONLINE_MEETING_ID);
    });

    it('should call getTranscriptContent with userId', async () => {
      const event = makeEvent(makeMeetingEndActivity());

      await runHandler(event);

      expect(mockGetTranscriptContent).toHaveBeenCalledWith(
        ORGANIZER_ID,
        ONLINE_MEETING_ID,
        'transcript-1',
        'text/vtt'
      );
    });

    it('should save transcript to S3 when TRANSCRIPT_BUCKET is set', async () => {
      const event = makeEvent(makeMeetingEndActivity());

      await runHandler(event);

      expect(mockS3PutObject).toHaveBeenCalled();
      const s3Params = mockS3PutObject.mock.calls[0][0];
      expect(s3Params.Bucket).toBe('test-transcript-bucket');
      expect(s3Params.Key).toMatch(/^transcripts\/\d{4}-\d{2}-\d{2}\//);
      expect(s3Params.Key).toMatch(/\.vtt$/);
      expect(s3Params.ContentType).toBe('text/vtt');
      expect(s3Params.Body).toBe(TRANSCRIPT_TEXT);
    });

    it('should post transcript to chat', async () => {
      const event = makeEvent(makeMeetingEndActivity());

      await runHandler(event);

      // sendBotMessage should be called with transcript content
      const botMsgCalls = mockSendBotMessage.mock.calls;
      const transcriptMsg = botMsgCalls.find((c) => c[2].includes('Meeting Transcript'));
      expect(transcriptMsg).toBeTruthy();
      expect(transcriptMsg[2]).toContain('Hello world');
    });

    it('should use joinUrl from meetingEnd event when session has none', async () => {
      // Session exists but has no join_url
      mockDynamoGet.mockReturnValue({
        promise: () =>
          Promise.resolve({
            Item: {
              meeting_id: 'test-meeting-id-base64==',
              status: 'active',
              join_url: '', // empty!
              organizer_id: ORGANIZER_ID,
              service_url: 'https://smba.trafficmanager.net/test/',
              conversation_id: '19:meeting_test@thread.v2',
            },
          }),
      });

      const event = makeEvent(makeMeetingEndActivity());
      await runHandler(event);

      // Should still resolve the meeting via the JoinUrl from the event
      expect(mockGraphRequest).toHaveBeenCalled();
      const graphCall = mockGraphRequest.mock.calls[0];
      expect(graphCall[1]).toContain('$filter');
    });

    it('should use fromUserId when session has no organizer_id', async () => {
      mockDynamoGet.mockReturnValue({
        promise: () =>
          Promise.resolve({
            Item: {
              meeting_id: 'test-meeting-id-base64==',
              status: 'active',
              join_url: 'https://teams.microsoft.com/l/meetup-join/test',
              organizer_id: '', // empty
              service_url: 'https://smba.trafficmanager.net/test/',
              conversation_id: '19:meeting_test@thread.v2',
            },
          }),
      });

      const event = makeEvent(makeMeetingEndActivity());
      await runHandler(event);

      // userId should fall back to from_id (set from session.organizer_id || fromUserId in handleMeetingEnd)
      // The effective session sets from_id = session.organizer_id || fromUserId
      expect(mockGetMeetingTranscripts).toHaveBeenCalled();
      const calledUserId = mockGetMeetingTranscripts.mock.calls[0][0];
      expect(calledUserId).toBe('organizer-aad-id'); // from activity.from.aadObjectId
    });

    it('should retry when no transcripts available then give up gracefully', async () => {
      mockGetMeetingTranscripts.mockResolvedValue({ value: [] });

      const event = makeEvent(makeMeetingEndActivity());
      const result = await runHandler(event);

      expect(result.statusCode).toBe(200);
      // Should have retried (4 retries = up to 5 total calls)
      expect(mockGetMeetingTranscripts.mock.calls.length).toBeGreaterThanOrEqual(2);
      // Should NOT try to download content since list was always empty
      expect(mockGetTranscriptContent).not.toHaveBeenCalled();
      // Should NOT save to S3
      expect(mockS3PutObject).not.toHaveBeenCalled();
    });

    it('should continue posting to chat even if S3 upload fails', async () => {
      mockS3PutObject.mockReturnValue({
        promise: () => Promise.reject(new Error('S3 access denied')),
      });

      const event = makeEvent(makeMeetingEndActivity());
      const result = await runHandler(event);

      expect(result.statusCode).toBe(200);
      // Should still post transcript to chat even though S3 failed
      const transcriptMsg = mockSendBotMessage.mock.calls.find((c) =>
        c[2].includes('Meeting Transcript')
      );
      expect(transcriptMsg).toBeTruthy();
    });

    it('should work when no prior session exists but meetingEnd has JoinUrl', async () => {
      // No session in DynamoDB
      mockDynamoGet.mockReturnValue({
        promise: () => Promise.resolve({ Item: null }),
      });

      const event = makeEvent(makeMeetingEndActivity());
      const result = await runHandler(event);

      expect(result.statusCode).toBe(200);
      // Should still attempt transcript fetch using event data
      expect(mockGraphRequest).toHaveBeenCalled();
    });

    it('should use user-scoped endpoint for meeting lookup (not /communications)', async () => {
      const event = makeEvent(makeMeetingEndActivity());
      await runHandler(event);

      // graphRequest is called to look up the meeting by joinUrl
      expect(mockGraphRequest).toHaveBeenCalled();
      const graphPath = mockGraphRequest.mock.calls[0][1];
      expect(graphPath).toContain(`/users/${ORGANIZER_ID}/onlineMeetings`);
      expect(graphPath).not.toContain('/communications/');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Conversation Update (bot added)
  // ══════════════════════════════════════════════════════════════════════════

  describe('conversationUpdate (bot added)', () => {
    it('should send welcome message when bot is added', async () => {
      const activity = {
        type: 'conversationUpdate',
        membersAdded: [{ id: '28:test-bot-app-id' }],
        serviceUrl: 'https://smba.trafficmanager.net/test/',
        conversation: { id: '19:meeting_test@thread.v2' },
        channelData: {
          tenant: { id: 'test-tenant' },
          meeting: { id: 'test-meeting-id' },
        },
      };

      const event = makeEvent(activity);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockSendBotMessage).toHaveBeenCalled();
      const welcomeText = mockSendBotMessage.mock.calls[0][2];
      expect(welcomeText).toContain('Meeting Fetcher');
      expect(welcomeText).toContain('has been added');
    });

    it('should save meeting session when added to meeting chat', async () => {
      const activity = {
        type: 'conversationUpdate',
        membersAdded: [{ id: '28:test-bot-app-id' }],
        serviceUrl: 'https://smba.trafficmanager.net/test/',
        conversation: { id: '19:meeting_test@thread.v2' },
        channelData: {
          meeting: { id: 'test-meeting-id' },
        },
      };

      const event = makeEvent(activity);
      await handler(event);

      expect(mockDynamoPut).toHaveBeenCalled();
      const session = mockDynamoPut.mock.calls[0][0].Item;
      expect(session.meeting_id).toBe('test-meeting-id');
      expect(session.status).toBe('bot_installed');
    });

    it('should ignore when a user (not bot) is added', async () => {
      const activity = {
        type: 'conversationUpdate',
        membersAdded: [{ id: '29:some-user-id' }],
        serviceUrl: 'https://smba.trafficmanager.net/test/',
        conversation: { id: '19:meeting_test@thread.v2' },
        channelData: {},
      };

      const event = makeEvent(activity);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockSendBotMessage).not.toHaveBeenCalled();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Edge cases & routing
  // ══════════════════════════════════════════════════════════════════════════

  describe('Edge cases', () => {
    it('should handle empty activity gracefully', async () => {
      const event = makeEvent({ type: null });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });

    it('should return 200 for unknown routes', async () => {
      const event = {
        path: '/unknown/route',
        rawPath: '/unknown/route',
        body: JSON.stringify({ type: 'message' }),
      };
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });

    it('should serve config page for /bot/config', async () => {
      const event = {
        path: '/bot/config',
        rawPath: '/bot/config',
        body: null,
      };
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(result.headers['content-type']).toContain('text/html');
      expect(result.body).toContain('Meeting Fetcher');
    });

    it('should handle parse errors in body', async () => {
      const event = {
        path: '/bot/messages',
        rawPath: '/bot/messages',
        body: '{broken json',
      };
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Auto-install: Scheduled poll
  // ══════════════════════════════════════════════════════════════════════════

  describe('Scheduled poll (auto-install)', () => {
    function makeScheduledEvent() {
      return {
        source: 'aws.events',
        'detail-type': 'Scheduled Event',
        detail: {},
      };
    }

    it('should handle EventBridge scheduled event', async () => {
      mockGetUpcomingOnlineMeetings.mockResolvedValue({ value: [] });
      const result = await handler(makeScheduledEvent());
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.action).toBe('poll_complete');
    });

    it('should poll each watched user for upcoming meetings', async () => {
      mockGetUpcomingOnlineMeetings.mockResolvedValue({ value: [] });
      await handler(makeScheduledEvent());
      // WATCHED_USER_IDS = 'user-1,user-2', so two users polled
      expect(mockGetUpcomingOnlineMeetings).toHaveBeenCalledTimes(2);
      expect(mockGetUpcomingOnlineMeetings).toHaveBeenCalledWith('user-1', 60);
      expect(mockGetUpcomingOnlineMeetings).toHaveBeenCalledWith('user-2', 60);
    });

    it('should install bot when meeting found without bot installed', async () => {
      const meetingEvent = {
        id: 'cal-event-1',
        subject: 'Team Standup',
        isOnlineMeeting: true,
        onlineMeeting: {
          joinUrl: 'https://teams.microsoft.com/l/meetup-join/test-join-url',
        },
      };

      mockGetUpcomingOnlineMeetings.mockResolvedValue({ value: [meetingEvent] });
      mockGetOnlineMeetingByJoinUrl.mockResolvedValue({
        id: 'online-meeting-id',
        chatInfo: { threadId: '19:meeting_abc@thread.v2' },
      });
      mockGetInstalledAppsInChat.mockResolvedValue({ value: [] }); // bot NOT installed
      mockInstallAppInChat.mockResolvedValue({});

      const result = await handler(makeScheduledEvent());
      const body = JSON.parse(result.body);
      expect(body.installed).toBeGreaterThanOrEqual(1);
      expect(mockInstallAppInChat).toHaveBeenCalledWith(
        '19:meeting_abc@thread.v2',
        'test-catalog-app-id'
      );
    });

    it('should skip meeting when bot is already installed', async () => {
      const meetingEvent = {
        id: 'cal-event-2',
        subject: 'Already Has Bot',
        isOnlineMeeting: true,
        onlineMeeting: {
          joinUrl: 'https://teams.microsoft.com/l/meetup-join/already-installed',
        },
      };

      mockGetUpcomingOnlineMeetings.mockResolvedValue({ value: [meetingEvent] });
      mockGetOnlineMeetingByJoinUrl.mockResolvedValue({
        id: 'online-meeting-id-2',
        chatInfo: { threadId: '19:meeting_def@thread.v2' },
      });
      // Bot is already installed
      mockGetInstalledAppsInChat.mockResolvedValue({
        value: [{ teamsApp: { id: 'test-catalog-app-id' } }],
      });

      const result = await handler(makeScheduledEvent());
      const body = JSON.parse(result.body);
      expect(body.installed).toBe(0);
      expect(mockInstallAppInChat).not.toHaveBeenCalled();
    });

    it('should handle 409 conflict (already installed race condition)', async () => {
      const meetingEvent = {
        id: 'cal-event-3',
        subject: 'Race Condition',
        isOnlineMeeting: true,
        onlineMeeting: {
          joinUrl: 'https://teams.microsoft.com/l/meetup-join/race-condition',
        },
      };

      mockGetUpcomingOnlineMeetings.mockResolvedValue({ value: [meetingEvent] });
      mockGetOnlineMeetingByJoinUrl.mockResolvedValue({
        id: 'online-meeting-id-3',
        chatInfo: { threadId: '19:meeting_ghi@thread.v2' },
      });
      mockGetInstalledAppsInChat.mockResolvedValue({ value: [] });
      const err409 = new Error('Conflict');
      err409.statusCode = 409;
      mockInstallAppInChat.mockRejectedValue(err409);

      const result = await handler(makeScheduledEvent());
      const body = JSON.parse(result.body);
      // 409 is treated as "skipped", not "error"
      expect(body.errors).toBe(0);
    });

    it('should skip meetings without chatInfo', async () => {
      const meetingEvent = {
        id: 'cal-event-4',
        subject: 'No Chat Info',
        isOnlineMeeting: true,
        onlineMeeting: {
          joinUrl: 'https://teams.microsoft.com/l/meetup-join/no-chat-info',
        },
      };

      mockGetUpcomingOnlineMeetings.mockResolvedValue({ value: [meetingEvent] });
      mockGetOnlineMeetingByJoinUrl.mockResolvedValue({
        id: 'online-meeting-id-4',
        chatInfo: null, // no thread ID
      });

      const result = await handler(makeScheduledEvent());
      const body = JSON.parse(result.body);
      expect(body.installed).toBe(0);
      expect(mockInstallAppInChat).not.toHaveBeenCalled();
    });
  });
});
