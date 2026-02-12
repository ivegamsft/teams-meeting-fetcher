'use strict';

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({});

exports.handler = async (event, context) => {
  const method = event && event.httpMethod ? event.httpMethod.toUpperCase() : '';
  const queryParams = event && event.queryStringParameters ? event.queryStringParameters : {};

  if (method === 'GET' && queryParams.validationToken) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
      body: queryParams.validationToken,
    };
  }

  const bucket = process.env.BUCKET_NAME;
  const expectedClientState = process.env.CLIENT_STATE;
  if (!bucket) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'BUCKET_NAME is not set' }),
    };
  }

  if (method === 'POST') {
    let body = {};
    if (event && event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (error) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid JSON body' }),
        };
      }
    }

    const notifications = body.value || [];
    const allValid =
      notifications.length > 0 &&
      notifications.every((notification) => {
        return notification.clientState === expectedClientState;
      });

    if (!allValid) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Invalid clientState' }),
      };
    }
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

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
    })
  );

  return {
    statusCode: 202,
    body: JSON.stringify({ status: 'ok', key }),
  };
};
