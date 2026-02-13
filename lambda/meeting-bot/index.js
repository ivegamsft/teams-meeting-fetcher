/**
 * Meeting Bot Webhook Handler
 * Processes Graph API subscription notifications for meeting transcripts
 * Stores session data in DynamoDB
 */
'use strict';

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME =
  process.env.MEETINGS_TABLE || process.env.DYNAMODB_TABLE || 'meeting-bot-sessions-dev';

exports.handler = async (event) => {
  console.log('📥 Webhook received:', JSON.stringify(event, null, 2));

  // Handle Graph's validation request
  if (event.queryStringParameters?.validationToken) {
    console.log('✅ Validation token request - echoing back');
    return {
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
      body: event.queryStringParameters.validationToken,
    };
  }

  try {
    // Parse webhook payload
    let body = event.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const path = event.rawPath || event.path || '';
    const isBotRoute =
      path.includes('/bot/callbacks') ||
      path.includes('/bot/meeting-started') ||
      path.includes('/bot/messages');

    if (isBotRoute && body && body.type) {
      // Handle conversational messages (Hi, Hello, Help)
      if (body.type === 'message' && body.text) {
        const response = handleBotCommand(body.text.trim());
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(response),
        };
      }

      // Handle meeting events and other activities
      const result = await processBotActivity(body);
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, activity: result }),
      };
    }

    const notifications = body.value || [];
    console.log(`📊 Processing ${notifications.length} notification(s)`);

    if (!notifications.length) {
      return { statusCode: 200, body: 'OK - no notifications' };
    }

    // Process each notification
    let processed = 0;
    for (const notification of notifications) {
      await processNotification(notification);
      processed++;
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, processed }),
    };
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

/**
 * Handle conversational bot commands (Hi, Hello, Help)
 * Required by Teams app validation for bots that aren't notification-only.
 */
function handleBotCommand(text) {
  const cmd = text.toLowerCase().replace(/[^a-z]/g, '');

  if (cmd === 'help') {
    return {
      type: 'message',
      text:
        '**Meeting Fetcher Bot** - Commands:\n\n' +
        '- **Hi** / **Hello** — Say hello\n' +
        '- **Help** — Show this help message\n\n' +
        'This bot automatically monitors Teams meetings for recording and transcription. ' +
        'No manual action is needed — just start a meeting and the bot will handle the rest.',
    };
  }

  // Hi, Hello, or any unrecognized text
  return {
    type: 'message',
    text:
      "Hello! I'm the **Meeting Fetcher** bot. " +
      'I automatically monitor Teams meetings for recording and transcription.\n\n' +
      'Type **Help** to learn more.',
  };
}

async function processBotActivity(activity) {
  const channelData = activity.channelData || {};
  const meeting = channelData.meeting || {};
  const meetingId =
    meeting.id ||
    meeting.meetingId ||
    (meeting.conversation && meeting.conversation.id) ||
    (activity.conversation && activity.conversation.id) ||
    `activity-${Date.now()}`;

  const session = {
    meeting_id: meetingId,
    event_type: activity.name || activity.type,
    client_state: 'bot-framework',
    received_at: new Date().toISOString(),
    organizer_id: activity.from && (activity.from.aadObjectId || activity.from.id),
    raw_notification: activity,
  };

  console.log('🤖 Bot activity received:', JSON.stringify(session));

  await dynamodb
    .put({
      TableName: TABLE_NAME,
      Item: session,
    })
    .promise();

  return { meetingId, eventType: session.event_type };
}

async function processNotification(notification) {
  const changeType = notification.changeType || 'unknown';
  const resourceData = notification.resourceData || {};
  const clientState = notification.clientState || '';

  console.log(`📝 Change type: ${changeType}`);
  console.log(`📝 Resource data:`, JSON.stringify(resourceData));

  // Extract meeting/transcript info
  const id = resourceData.id || `notification-${Date.now()}`;

  // Store in DynamoDB
  const session = {
    meeting_id: id,
    event_type: changeType,
    client_state: clientState,
    received_at: new Date().toISOString(),
    raw_notification: notification,
  };

  console.log(`💾 Storing to DynamoDB:`, JSON.stringify(session));

  try {
    await dynamodb
      .put({
        TableName: TABLE_NAME,
        Item: session,
      })
      .promise();

    console.log(`✅ Stored session: ${id}`);
  } catch (err) {
    console.error(`❌ DynamoDB error:`, err);
    throw err;
  }
}
