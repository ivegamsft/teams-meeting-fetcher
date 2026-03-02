// Mock Azure and AWS modules before requiring handler
jest.mock('@azure/event-hubs', () => ({
  EventHubConsumerClient: jest.fn(),
  earliestEventPosition: {},
}), { virtual: true });

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
}), { virtual: true });

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
  HeadBucketCommand: jest.fn(),
}), { virtual: true });

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
  DescribeTableCommand: jest.fn(),
}), { virtual: true });

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({ send: jest.fn() })),
  },
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  QueryCommand: jest.fn(),
}), { virtual: true });

const originalEnv = process.env;

describe('EventHub Lambda Handler - Notification Classification', () => {
  let handler;

  beforeAll(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
    };
    handler = require('../../../apps/aws-lambda-eventhub/handler');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('classifyNotification', () => {
    test('should classify callRecord notification by resource path', () => {
      const notification = {
        resource: "communications/callRecords('abc123')",
      };
      expect(handler._classifyNotification(notification)).toBe('callRecord');
    });

    test('should classify callRecord notification with full path', () => {
      const notification = {
        resource: "communications/callRecords('abc123')/sessions('xyz')",
      };
      expect(handler._classifyNotification(notification)).toBe('callRecord');
    });

    test('should classify transcript notification by resource path', () => {
      const notification = {
        resource: "communications/onlineMeetings('mid1')/transcripts('tid1')",
      };
      expect(handler._classifyNotification(notification)).toBe('transcript');
    });

    test('should classify transcript notification via @odata.type', () => {
      const notification = {
        resource: '',
        resourceData: {
          '@odata.type': '#microsoft.graph.callTranscript',
        },
      };
      expect(handler._classifyNotification(notification)).toBe('transcript');
    });

    test('should classify recording notification by resource path', () => {
      const notification = {
        resource: "communications/onlineMeetings('mid1')/recordings('rid1')",
      };
      expect(handler._classifyNotification(notification)).toBe('recording');
    });

    test('should classify recording notification via @odata.type', () => {
      const notification = {
        resource: '',
        resourceData: {
          '@odata.type': '#microsoft.graph.callRecording',
        },
      };
      expect(handler._classifyNotification(notification)).toBe('recording');
    });

    test('should classify calendar event notification', () => {
      const notification = {
        resource: '/users/abc/events/event123',
      };
      expect(handler._classifyNotification(notification)).toBe('calendarEvent');
    });

    test('should default to calendarEvent for unknown notification', () => {
      const notification = {
        resource: '',
      };
      expect(handler._classifyNotification(notification)).toBe('calendarEvent');
    });

    test('should default to calendarEvent for notification with missing resource', () => {
      const notification = {};
      expect(handler._classifyNotification(notification)).toBe('calendarEvent');
    });

    test('should handle notification with null resourceData', () => {
      const notification = {
        resource: '',
        resourceData: null,
      };
      expect(handler._classifyNotification(notification)).toBe('calendarEvent');
    });
  });

  describe('extractIdFromResource', () => {
    test('should extract onlineMeetingId from transcript resource', () => {
      const resource = "communications/onlineMeetings('abc123')/transcripts('xyz')";
      const result = handler._extractIdFromResource(resource, 'onlineMeetings');
      expect(result).toBe('abc123');
    });

    test('should extract transcriptId from transcript resource', () => {
      const resource = "communications/onlineMeetings('mid1')/transcripts('tid1')";
      const result = handler._extractIdFromResource(resource, 'transcripts');
      expect(result).toBe('tid1');
    });

    test('should extract recordingId from recording resource', () => {
      const resource = "communications/onlineMeetings('mid1')/recordings('rid1')";
      const result = handler._extractIdFromResource(resource, 'recordings');
      expect(result).toBe('rid1');
    });

    test('should return null when entity name not found', () => {
      const resource = 'random/path/without/match';
      const result = handler._extractIdFromResource(resource, 'onlineMeetings');
      expect(result).toBeNull();
    });

    test('should return null for empty resource string', () => {
      const resource = '';
      const result = handler._extractIdFromResource(resource, 'onlineMeetings');
      expect(result).toBeNull();
    });

    test('should handle complex IDs with special characters', () => {
      const resource = "communications/onlineMeetings('19:meeting_abc-123@thread.v2')/transcripts('xyz')";
      const result = handler._extractIdFromResource(resource, 'onlineMeetings');
      expect(result).toBe('19:meeting_abc-123@thread.v2');
    });

    test('should return null when pattern does not match format', () => {
      const resource = 'onlineMeetings/abc123/transcripts/xyz';
      const result = handler._extractIdFromResource(resource, 'onlineMeetings');
      expect(result).toBeNull();
    });

    test('should extract first matching entity when multiple exist', () => {
      const resource = "onlineMeetings('first')/something/onlineMeetings('second')";
      const result = handler._extractIdFromResource(resource, 'onlineMeetings');
      expect(result).toBe('first');
    });
  });
});
