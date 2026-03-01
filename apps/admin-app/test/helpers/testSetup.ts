import { Meeting, Subscription, Transcript, AppConfig } from '../../src/models';

// Environment variable defaults for tests
const TEST_ENV = {
  NODE_ENV: 'test',
  API_KEY: 'test-api-key-12345',
  WEBHOOK_AUTH_SECRET: 'test-webhook-secret',
  WEBHOOK_CLIENT_STATE: 'test-client-state',
  WEBHOOK_NOTIFICATION_URL: 'https://example.com/webhooks/graph',
  SESSION_SECRET: 'test-session-secret',
  GRAPH_TENANT_ID: 'test-tenant-id',
  GRAPH_CLIENT_ID: 'test-client-id',
  GRAPH_CLIENT_SECRET: 'test-client-secret',
  ENTRA_GROUP_ID: 'test-group-id',
  ENTRA_TENANT_ID: '',
  ENTRA_CLIENT_ID: '',
  ENTRA_CLIENT_SECRET: '',
  AWS_REGION: 'us-east-1',
  DYNAMODB_SUBSCRIPTIONS_TABLE: 'test-subscriptions',
  DYNAMODB_MEETINGS_TABLE: 'test-meetings',
  DYNAMODB_TRANSCRIPTS_TABLE: 'test-transcripts',
  DYNAMODB_CONFIG_TABLE: 'test-config',
  S3_RAW_TRANSCRIPT_BUCKET: 'test-raw-transcripts',
  S3_SANITIZED_TRANSCRIPT_BUCKET: 'test-sanitized-transcripts',
};

let savedEnv: Record<string, string | undefined> = {};

export function setupTestEnv(): void {
  savedEnv = {};
  for (const [key, value] of Object.entries(TEST_ENV)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
}

export function teardownTestEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export const TEST_API_KEY = TEST_ENV.API_KEY;
export const TEST_WEBHOOK_SECRET = TEST_ENV.WEBHOOK_AUTH_SECRET;

export function createMockMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    meeting_id: 'meeting-001',
    tenantId: 'test-tenant-id',
    subject: 'Test Meeting',
    description: 'A test meeting',
    startTime: '2025-01-01T10:00:00Z',
    endTime: '2025-01-01T11:00:00Z',
    organizerId: 'user-001',
    organizerEmail: 'organizer@example.com',
    organizerDisplayName: 'Test Organizer',
    attendees: [],
    status: 'scheduled',
    subscriptionId: 'sub-001',
    joinWebUrl: 'https://teams.microsoft.com/meet/test',
    onlineMeetingId: 'online-meeting-001',
    createdAt: '2025-01-01T09:00:00Z',
    updatedAt: '2025-01-01T09:00:00Z',
    ...overrides,
  };
}

export function createMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    subscription_id: 'sub-001',
    subscriptionType: 'calendar',
    userId: 'user-001',
    userEmail: 'user@example.com',
    userDisplayName: 'Test User',
    resource: '/users/user-001/events',
    changeType: 'created,updated,deleted',
    notificationUrl: 'https://example.com/webhooks/graph',
    clientState: 'test-client-state',
    expirationDateTime: '2025-02-01T00:00:00Z',
    renewalReminderAt: '2025-01-31T00:00:00Z',
    status: 'active',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

export function createMockTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    transcript_id: 'transcript-001',
    meetingId: 'meeting-001',
    status: 'completed',
    language: 'en',
    graphTranscriptId: 'graph-transcript-001',
    rawS3Path: 's3://test-raw-transcripts/raw/meeting-001/transcript-001.vtt',
    sanitizedS3Path: 's3://test-sanitized-transcripts/sanitized/meeting-001/transcript-001.vtt',
    createdAt: '2025-01-01T12:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
    ...overrides,
  };
}

export function createMockAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    config_key: 'primary',
    tenantId: 'test-tenant-id',
    monitoredGroups: [],
    monitoredMeetingsCount: 5,
    transcriptionsProcessed: 3,
    transcriptionsPending: 1,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}
