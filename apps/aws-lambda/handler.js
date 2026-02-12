'use strict';

const AWS = require('aws-sdk');

const s3 = new AWS.S3();

exports.handler = async (event, context) => {
  const bucket = process.env.BUCKET_NAME;
  if (!bucket) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'BUCKET_NAME is not set' }),
    };
  }

  const rawBody = event && event.body ? event.body : '';
  const bodyText = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const requestId = (context && context.awsRequestId) || 'unknown';
  const key = `webhooks/${timestamp}-${requestId}.json`;

  const payload = {
    receivedAt: new Date().toISOString(),
    requestId,
    source: 'graph-webhook',
    body: bodyText,
  };

  await s3
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
    })
    .promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'ok', key }),
  };
};
