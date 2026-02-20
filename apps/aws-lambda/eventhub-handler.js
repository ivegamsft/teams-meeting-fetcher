/**
 * Lambda Handler for processing Event Hub calendar change notifications
 * 
 * This handler can be invoked by:
 * 1. CloudWatch Events (scheduled)
 * 2. SQS messages
 * 3. Direct API call (for testing)
 * 
 * It connects to Azure Event Hub, receives calendar change notifications,
 * and processes them (e.g., download transcripts, track status)
 */

'use strict';

const EventHubClient = require('./eventhub-client');
const {
  S3Client,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');

const s3 = new S3Client({});

/**
 * Process a single change notification
 * @param {Object} notification - The change notification from Event Hub
 * @param {Object} context - Lambda context
 * @returns {Object} Processing result
 */
async function processNotification(notification, context) {
  try {
    const data = notification.data || {};
    const resource = data.resource || {};

    // Extract change details
    const changeType = data.changeType; // created, updated, deleted
    const resourcePath = resource.resourcePath || '';

    console.log(`Processing change: ${changeType} on ${resourcePath}`);

    // Store notification in S3 for audit trail
    await storeNotificationInS3(notification, context);

    // Process based on resource type
    if (resourcePath.includes('/events')) {
      return processCalendarEvent(notification);
    }

    if (resourcePath.includes('/onlineMeetings')) {
      return processMeetingUpdate(notification);
    }

    return {
      success: true,
      changeType,
      resourcePath,
      action: 'stored',
    };
  } catch (err) {
    console.error('Error processing notification:', err);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Process a calendar event change
 * @param {Object} notification - Event Hub notification
 */
async function processCalendarEvent(notification) {
  const data = notification.data || {};
  const changeType = data.changeType;

  console.log(`Calendar event ${changeType}:`, data.resource);

  // TODO: Implement calendar event processing
  // - Query Graph API for event details
  // - Update local cache
  // - Check if meeting has ended
  // - Trigger transcript download if ended

  return {
    success: true,
    type: 'calendarEvent',
    changeType,
  };
}

/**
 * Process a meeting update (e.g., recording started/ended)
 * @param {Object} notification - Event Hub notification
 */
async function processMeetingUpdate(notification) {
  const data = notification.data || {};
  const changeType = data.changeType;

  console.log(`Meeting update ${changeType}:`, data.resource);

  // TODO: Implement meeting update processing
  // - Check if recording is available
  // - Trigger transcript download
  // - Update meeting status

  return {
    success: true,
    type: 'meetingUpdate',
    changeType,
  };
}

/**
 * Store notification in S3 for audit trail
 * @param {Object} notification - The notification
 * @param {Object} context - Lambda context
 */
async function storeNotificationInS3(notification, context) {
  const bucket = process.env.BUCKET_NAME;
  if (!bucket) {
    console.warn('BUCKET_NAME not set, skipping S3 storage');
    return;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const requestId = context.awsRequestId || 'unknown';
    const changeType = notification.data?.changeType || 'unknown';

    const key = `eventhub-notifications/${changeType}/${timestamp}-${requestId}.json`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(notification, null, 2),
        ContentType: 'application/json',
      })
    );

    console.log(`Stored notification in S3: ${key}`);
  } catch (err) {
    console.error('Error storing notification in S3:', err);
    // Don't throw - this is auxiliary
  }
}

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  console.log('Event Hub consumer lambda invoked');

  // Validate Event Hub configuration
  const connectionString = process.env.EVENT_HUB_CONNECTION_STRING;
  const eventHubName = process.env.EVENT_HUB_NAME;

  if (!connectionString || !eventHubName) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          'EVENT_HUB_CONNECTION_STRING or EVENT_HUB_NAME not configured',
      }),
    };
  }

  let ehClient = null;

  try {
    // Connect to Event Hub
    ehClient = new EventHubClient({
      connectionString,
      eventHubName,
    });

    console.log('Connecting to Event Hub...');
    await ehClient.connect();

    // Receive messages from Event Hub
    console.log('Receiving messages from Event Hub...');
    const messages = await ehClient.receiveMessages({
      maxMessages: 10,
      maxWaitTimeInSeconds: 30,
    });

    console.log(`Received ${messages.length} messages`);

    // Process each message
    const results = [];
    for (const message of messages) {
      if (message) {
        const result = await processNotification(message, context);
        results.push(result);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        messagesReceived: messages.length,
        messagesProcessed: results.length,
        results,
      }),
    };
  } catch (err) {
    console.error('Fatal error in lambda:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
        stack: err.stack,
      }),
    };
  } finally {
    if (ehClient) {
      try {
        await ehClient.close();
      } catch (err) {
        console.error('Error closing Event Hub connection:', err);
      }
    }
  }
};

/**
 * Optional: Test handler for local testing
 * Invoke with: npm run test:eventhub
 */
exports.testHandler = async (event) => {
  console.log('Testing Event Hub integration...');
  // This will be called in test scripts
  return exports.handler(event, {
    awsRequestId: 'test-request-' + Date.now(),
  });
};
