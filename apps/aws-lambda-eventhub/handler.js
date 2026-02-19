'use strict';

const { EventHubConsumerClient, earliestEventPosition } = require('@azure/event-hubs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    startPosition = { sequenceNumber: checkpoint.sequence_number + 1 };
  } else if (pollWindowMinutes > 0) {
    startPosition = { enqueuedOn: new Date(Date.now() - pollWindowMinutes * 60 * 1000) };
  }

  return consumer.receiveBatch(partitionId, maxEvents, {
    maxWaitTimeInSeconds: 5,
    startPosition,
  });
}

exports.handler = async (event, context) => {
  const connectionString = getEnv('EVENT_HUB_CONNECTION_STRING');
  const eventHubName = getEnv('EVENT_HUB_NAME');
  const consumerGroup = getEnv('EVENT_HUB_CONSUMER_GROUP', '$Default');
  const bucketName = getEnv('BUCKET_NAME');
  const checkpointTable = getEnv('EVENTHUB_CHECKPOINT_TABLE');
  const maxEvents = parseNumber(getEnv('EVENT_HUB_MAX_EVENTS', '50'), 50);
  const pollWindowMinutes = parseNumber(getEnv('EVENT_HUB_POLL_WINDOW_MINUTES', '10'), 10);

  if (!connectionString || !eventHubName) {
    throw new Error('EVENT_HUB_CONNECTION_STRING and EVENT_HUB_NAME are required');
  }

  if (!bucketName) {
    throw new Error('BUCKET_NAME is required');
  }

  const consumer = new EventHubConsumerClient(consumerGroup, connectionString, eventHubName);

  try {
    const partitionIds = await consumer.getPartitionIds();
    const allEvents = [];

    for (const partitionId of partitionIds) {
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

        await putCheckpoint(
          checkpointTable,
          partitionId,
          consumerGroup,
          maxSequenceEvent.sequenceNumber,
          maxSequenceEvent.enqueuedTimeUtc
        );

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
      eventCount: allEvents.length,
      pollWindowMinutes,
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'ok',
        eventCount: allEvents.length,
        key,
      }),
    };
  } finally {
    await consumer.close();
  }
};
