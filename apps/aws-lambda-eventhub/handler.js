'use strict';

const https = require('https');
const { webcrypto } = require('crypto');
const { EventHubConsumerClient, earliestEventPosition } = require('@azure/event-hubs');
const { S3Client, PutObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

// globalThis.crypto is already available in Node 18+, no need to set it
const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function requireEnv(name) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEventHubNamespace(namespace) {
  if (!namespace) return namespace;
  if (namespace.includes('.')) {
    return namespace;
  }
  return `${namespace}.servicebus.windows.net`;
}

async function validateEventHubAccess(consumer) {
  try {
    return await consumer.getPartitionIds();
  } catch (err) {
    throw new Error(`EventHub RBAC check failed: ${err.message || err}`);
  }
}

async function validateS3Access(bucketName) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
  } catch (err) {
    throw new Error(`S3 access check failed for BUCKET_NAME=${bucketName}: ${err.message || err}`);
  }
}

async function validateDynamoAccess(tableName) {
  if (!tableName) return;
  try {
    await ddb.send(new DescribeTableCommand({ TableName: tableName }));
  } catch (err) {
    throw new Error(
      `DynamoDB access check failed for EVENTHUB_CHECKPOINT_TABLE=${tableName}: ${err.message || err}`
    );
  }
}

function createAadCredential(tenantId, clientId, clientSecret) {
  let cachedToken = null;
  let expiresOn = 0;

  async function fetchToken() {
    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://eventhubs.azure.net/.default',
      grant_type: 'client_credentials',
    }).toString();

    const options = {
      method: 'POST',
      hostname: 'login.microsoftonline.com',
      path: `/${tenantId}/oauth2/v2.0/token`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(form),
      },
    };

    const responseBody = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`Token request failed: ${res.statusCode} ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(form);
      req.end();
    });

    const payload = JSON.parse(responseBody);
    cachedToken = payload.access_token;
    expiresOn = Date.now() + (payload.expires_in - 60) * 1000;
    return cachedToken;
  }

  return {
    getToken: async () => {
      if (!cachedToken || Date.now() >= expiresOn) {
        await fetchToken();
      }
      return {
        token: cachedToken,
        expiresOnTimestamp: expiresOn,
      };
    },
  };
}
async function getCheckpoint(tableName, partitionId, consumerGroup) {
  if (!tableName) return null;

  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        partition_id: partitionId,
        consumer_group: consumerGroup,
      },
    })
  );

  return result.Item || null;
}

async function putCheckpoint(
  tableName,
  partitionId,
  consumerGroup,
  sequenceNumber,
  enqueuedTimeUtc
) {
  if (!tableName) return;

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        partition_id: partitionId,
        consumer_group: consumerGroup,
        sequence_number: sequenceNumber,
        enqueued_time_utc: enqueuedTimeUtc ? enqueuedTimeUtc.toISOString() : null,
        updated_at: new Date().toISOString(),
      },
    })
  );
}

async function receivePartitionEvents(
  consumer,
  partitionId,
  maxEvents,
  pollWindowMinutes,
  checkpoint
) {
  let startPosition = earliestEventPosition;

  if (checkpoint && Number.isFinite(checkpoint.sequence_number)) {
    startPosition = { sequenceNumber: checkpoint.sequence_number, isInclusive: false };
  } else if (pollWindowMinutes > 0) {
    startPosition = { enqueuedOn: new Date(Date.now() - pollWindowMinutes * 60 * 1000) };
  }

  const events = [];
  let subscription = null;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      if (subscription) {
        await subscription.close().catch((err) => {
          console.error(`Error closing subscription for partition ${partitionId}:`, err);
        });
      }
      resolve(events);
    }, 5000);

    const subscriptionHandler = {
      processEvents: async (receivedEvents, context) => {
        events.push(...receivedEvents);
        if (events.length >= maxEvents) {
          clearTimeout(timeout);
          if (subscription) {
            await subscription.close().catch((err) => {
              console.error(`Error closing subscription for partition ${partitionId}:`, err);
            });
          }
          resolve(events);
        }
      },
      processError: async (err, context) => {
        console.error(`Error processing partition ${partitionId}:`, err);
        clearTimeout(timeout);
        if (subscription) {
          await subscription.close().catch((closeErr) => {
            console.error(`Error closing subscription for partition ${partitionId}:`, closeErr);
          });
        }
        reject(err);
      },
    };

    try {
      subscription = consumer.subscribe(partitionId, subscriptionHandler, {
        startPosition,
        maxWaitTimeInSeconds: 5,
      });
    } catch (err) {
      console.error(`Failed to subscribe to partition ${partitionId}:`, err);
      clearTimeout(timeout);
      reject(err);
    }
  });
}

async function writeMeetingNotification(meetingsTableName, notification) {
  const { resource, changeType } = notification;
  if (!resource) {
    console.warn('Skipping notification with no resource path');
    return { written: false, reason: 'no_resource' };
  }

  const parts = resource.split('/');
  const meetingId = parts[parts.length - 1];
  if (!meetingId) {
    console.warn('Skipping notification — could not extract meeting_id from resource:', resource);
    return { written: false, reason: 'no_meeting_id' };
  }

  const now = new Date().toISOString();

  // Check if record already exists (composite key: meeting_id + created_at)
  const existingResult = await ddb.send(new QueryCommand({
    TableName: meetingsTableName,
    KeyConditionExpression: 'meeting_id = :pk',
    ExpressionAttributeValues: { ':pk': meetingId },
    Limit: 1,
  }));
  const existing = existingResult.Items && existingResult.Items.length > 0
    ? existingResult.Items[0]
    : null;

  if (changeType === 'deleted') {
    if (existing) {
      await ddb.send(new PutCommand({
        TableName: meetingsTableName,
        Item: {
          ...existing,
          changeType: 'deleted',
          status: 'cancelled',
          rawNotification: notification,
          updatedAt: now,
        },
      }));
    } else {
      // No existing record for a delete — write a minimal cancelled record
      await ddb.send(new PutCommand({
        TableName: meetingsTableName,
        Item: {
          meeting_id: meetingId,
          created_at: now,
          resource,
          changeType: 'deleted',
          status: 'cancelled',
          subject: '',
          startTime: '',
          endTime: '',
          organizerId: '',
          organizerEmail: '',
          organizerDisplayName: '',
          rawNotification: notification,
          createdAt: now,
          updatedAt: now,
        },
      }));
    }
    return { written: true, meetingId, action: 'deleted' };
  }

  // changeType guard: don't regress "updated"/"deleted" back to "created"
  let effectiveChangeType = changeType;
  if (existing) {
    if (changeType === 'created' && existing.changeType && existing.changeType !== 'created') {
      effectiveChangeType = existing.changeType;
    }
    await ddb.send(new PutCommand({
      TableName: meetingsTableName,
      Item: {
        ...existing,
        changeType: effectiveChangeType,
        resource,
        status: existing.status || 'notification_received',
        rawNotification: notification,
        updatedAt: now,
      },
    }));
    return { written: true, meetingId, action: 'updated' };
  }

  // New record
  await ddb.send(new PutCommand({
    TableName: meetingsTableName,
    Item: {
      meeting_id: meetingId,
      created_at: now,
      resource,
      changeType: effectiveChangeType || 'created',
      status: 'notification_received',
      subject: '',
      startTime: '',
      endTime: '',
      organizerId: '',
      organizerEmail: '',
      organizerDisplayName: '',
      rawNotification: notification,
      detailsFetched: false,
      createdAt: now,
      updatedAt: now,
    },
  }));
  return { written: true, meetingId, action: 'created' };
}

function classifyNotification(notification) {
  const resource = notification.resource || '';
  const odataType = (notification.resourceData && notification.resourceData['@odata.type']) || '';

  if (resource.startsWith('communications/callRecords')) {
    return 'callRecord';
  }
  if (resource.includes('/transcripts(') || odataType.includes('callTranscript')) {
    return 'transcript';
  }
  if (resource.includes('/recordings(') || odataType.includes('callRecording')) {
    return 'recording';
  }
  return 'calendarEvent';
}

async function writeCallRecordNotification(meetingsTableName, notification) {
  const callRecordId = notification.resourceData && notification.resourceData.id;
  if (!callRecordId) {
    console.warn('Skipping call record notification with no resourceData.id');
    return { written: false, reason: 'no_call_record_id' };
  }

  const now = new Date().toISOString();
  const meetingId = `cr_${callRecordId}`;

  await ddb.send(new PutCommand({
    TableName: meetingsTableName,
    Item: {
      meeting_id: meetingId,
      created_at: now,
      callRecordId,
      resource: notification.resource,
      changeType: notification.changeType || 'created',
      status: 'ended',
      lifecycleState: 'ended',
      rawNotification: notification,
      subject: '',
      startTime: '',
      endTime: '',
      organizerId: '',
      organizerEmail: '',
      organizerDisplayName: '',
      detailsFetched: false,
      createdAt: now,
      updatedAt: now,
    },
  }));
  return { written: true, meetingId, action: 'created' };
}

function extractIdFromResource(resource, entityName) {
  // Match patterns like onlineMeetings('id') or transcripts('id')
  const pattern = new RegExp(`${entityName}\\('([^']+)'\\)`);
  const match = resource.match(pattern);
  return match ? match[1] : null;
}

async function writeTranscriptNotification(meetingsTableName, notification) {
  const resource = notification.resource || '';
  const onlineMeetingId = extractIdFromResource(resource, 'onlineMeetings');
  const transcriptId = extractIdFromResource(resource, 'transcripts');

  if (!onlineMeetingId) {
    console.warn('Skipping transcript notification — could not extract onlineMeetingId from:', resource);
    return { written: false, reason: 'no_online_meeting_id' };
  }

  const now = new Date().toISOString();
  const meetingId = `tr_${onlineMeetingId}`;

  await ddb.send(new PutCommand({
    TableName: meetingsTableName,
    Item: {
      meeting_id: meetingId,
      created_at: now,
      onlineMeetingId,
      transcriptId: transcriptId || undefined,
      transcriptNotifiedAt: now,
      resource,
      changeType: notification.changeType || 'created',
      status: 'notification_received',
      rawNotification: notification,
      subject: '',
      startTime: '',
      endTime: '',
      organizerId: '',
      organizerEmail: '',
      organizerDisplayName: '',
      detailsFetched: false,
      createdAt: now,
      updatedAt: now,
    },
  }));
  return { written: true, meetingId, action: 'created' };
}

async function writeRecordingNotification(meetingsTableName, notification) {
  const resource = notification.resource || '';
  const onlineMeetingId = extractIdFromResource(resource, 'onlineMeetings');
  const recordingId = extractIdFromResource(resource, 'recordings');

  if (!onlineMeetingId) {
    console.warn('Skipping recording notification — could not extract onlineMeetingId from:', resource);
    return { written: false, reason: 'no_online_meeting_id' };
  }

  const now = new Date().toISOString();
  const meetingId = `rec_${onlineMeetingId}`;

  await ddb.send(new PutCommand({
    TableName: meetingsTableName,
    Item: {
      meeting_id: meetingId,
      created_at: now,
      onlineMeetingId,
      recordingId: recordingId || undefined,
      recordingNotifiedAt: now,
      resource,
      changeType: notification.changeType || 'created',
      status: 'notification_received',
      rawNotification: notification,
      subject: '',
      startTime: '',
      endTime: '',
      organizerId: '',
      organizerEmail: '',
      organizerDisplayName: '',
      detailsFetched: false,
      createdAt: now,
      updatedAt: now,
    },
  }));
  return { written: true, meetingId, action: 'created' };
}

exports.handler = async (event, context) => {
  const eventHubName = requireEnv('EVENT_HUB_NAME');
  const eventHubNamespaceRaw = requireEnv('EVENT_HUB_NAMESPACE');
  const eventHubNamespace = normalizeEventHubNamespace(eventHubNamespaceRaw);
  const consumerGroup = requireEnv('CONSUMER_GROUP');
  const bucketName = requireEnv('BUCKET_NAME');
  const checkpointTable = getEnv('EVENTHUB_CHECKPOINT_TABLE');
  const partitionIdsEnv = getEnv('PARTITION_IDS');
  const partitionIds = partitionIdsEnv
    ? partitionIdsEnv
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : null;
  const maxEvents = parseNumber(getEnv('EVENT_HUB_MAX_EVENTS', '50'), 50);
  const pollWindowMinutes = parseNumber(getEnv('EVENT_HUB_POLL_WINDOW_MINUTES', '10'), 10);

  // MESSAGE_PROCESSING_MODE: 'consume' (default) or 'peek'
  // - consume: Read messages and advance consumer group offset (normal operation)
  // - peek: Read messages WITHOUT advancing offset (for testing/debugging)
  const processingMode = getEnv('MESSAGE_PROCESSING_MODE', 'consume').toLowerCase();
  const shouldUpdateCheckpoint = processingMode === 'consume';

  const tenantId = requireEnv('AZURE_TENANT_ID');
  const clientId = requireEnv('AZURE_CLIENT_ID');
  const clientSecret = requireEnv('AZURE_CLIENT_SECRET');

  console.log(`Processing mode: ${processingMode} (checkpoint updates: ${shouldUpdateCheckpoint})`);

  const credential = createAadCredential(tenantId, clientId, clientSecret);
  const consumer = new EventHubConsumerClient(
    consumerGroup,
    eventHubNamespace,
    eventHubName,
    credential
  );

  try {
    const detectedPartitionIds = await validateEventHubAccess(consumer);
    await validateS3Access(bucketName);
    await validateDynamoAccess(checkpointTable);

    const targetPartitionIds = partitionIds || detectedPartitionIds;
    if (!partitionIds) {
      console.log(`Auto-detected partitions: ${targetPartitionIds.join(',')}`);
    }
    const allEvents = [];

    for (const partitionId of targetPartitionIds) {
      const checkpoint = await getCheckpoint(checkpointTable, partitionId, consumerGroup);
      const events = await receivePartitionEvents(
        consumer,
        partitionId,
        maxEvents,
        pollWindowMinutes,
        checkpoint
      );

      if (events.length) {
        const maxSequenceEvent = events.reduce(
          (max, evt) => (max && max.sequenceNumber > evt.sequenceNumber ? max : evt),
          null
        );

        // Only update checkpoint if in 'consume' mode
        // In 'peek' mode, we read messages without advancing the consumer offset
        if (shouldUpdateCheckpoint) {
          await putCheckpoint(
            checkpointTable,
            partitionId,
            consumerGroup,
            maxSequenceEvent.sequenceNumber,
            maxSequenceEvent.enqueuedTimeUtc
          );
        } else {
          console.log(
            `Peek mode: NOT updating checkpoint for partition ${partitionId} (seq: ${maxSequenceEvent.sequenceNumber})`
          );
        }

        allEvents.push(
          ...events.map((evt) => ({
            partitionId,
            sequenceNumber: evt.sequenceNumber,
            enqueuedTimeUtc: evt.enqueuedTimeUtc,
            body: evt.body,
            properties: evt.properties || {},
            systemProperties: evt.systemProperties || {},
          }))
        );
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const requestId = context && context.awsRequestId ? context.awsRequestId : 'unknown';
    const key = `eventhub/${timestamp}-${requestId}.json`;

    const payload = {
      receivedAt: new Date().toISOString(),
      requestId,
      processingMode,
      consumerGroup,
      eventCount: allEvents.length,
      pollWindowMinutes,
      checkpointUpdated: shouldUpdateCheckpoint,
      events: allEvents,
    };

    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: JSON.stringify(payload, null, 2),
        ContentType: 'application/json',
      })
    );

    // Write notifications directly to DynamoDB meetings table (change data feed pattern)
    const meetingsTableName = getEnv('MEETINGS_TABLE_NAME');
    let dynamoWriteCount = 0;
    let dynamoWriteErrors = 0;

    if (meetingsTableName && allEvents.length > 0) {
      for (const evt of allEvents) {
        const body = evt.body;
        // Normalize: handle both { value: [...] } batches and single notifications
        const notifications = body && body.value ? body.value : (body ? [body] : []);

        for (const notification of notifications) {
          try {
            const notificationType = classifyNotification(notification);
            let result;
            switch (notificationType) {
              case 'callRecord':
                result = await writeCallRecordNotification(meetingsTableName, notification);
                break;
              case 'transcript':
                result = await writeTranscriptNotification(meetingsTableName, notification);
                break;
              case 'recording':
                result = await writeRecordingNotification(meetingsTableName, notification);
                break;
              case 'calendarEvent':
              default:
                result = await writeMeetingNotification(meetingsTableName, notification);
                break;
            }
            if (result.written) {
              dynamoWriteCount++;
            }
          } catch (err) {
            dynamoWriteErrors++;
            console.error(`Failed to write meeting notification to DynamoDB: ${err.message}`);
          }
        }
      }
      console.log(`Wrote ${dynamoWriteCount} meeting notifications to DynamoDB (${dynamoWriteErrors} errors)`);
    } else if (allEvents.length > 0 && !meetingsTableName) {
      console.log('MEETINGS_TABLE_NAME not set - skipping direct DynamoDB writes');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'ok',
        processingMode,
        consumerGroup,
        eventCount: allEvents.length,
        dynamoWriteCount,
        dynamoWriteErrors,
        checkpointUpdated: shouldUpdateCheckpoint,
        key,
      }),
    };
  } finally {
    await consumer.close();
  }
};

// Test exports
if (process.env.NODE_ENV === 'test') {
  exports._classifyNotification = classifyNotification;
  exports._extractIdFromResource = extractIdFromResource;
}
