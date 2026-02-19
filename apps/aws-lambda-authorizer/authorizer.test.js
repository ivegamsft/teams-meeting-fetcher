/**
 * Tests for Lambda REQUEST Authorizer
 */

const handler = require('./authorizer').handler;

// Mock environment variable
process.env.CLIENT_STATE = 'test-secret-value';

describe('Lambda Authorizer for Graph Webhooks', () => {
  test('allows GET request with validationToken', async () => {
    const event = {
      httpMethod: 'GET',
      queryStringParameters: {
        validationToken: 'some-validation-token-from-microsoft',
      },
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/GET/graph',
    };

    const result = await handler(event);

    expect(result.principalId).toBe('user');
    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
  });

  test('allows POST request with valid clientState', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        value: [
          {
            clientState: 'test-secret-value',
            subscriptionId: 'sub-123',
            resource: 'teams/teams',
            changeType: 'created',
          },
        ],
      }),
      headers: {},
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/POST/graph',
    };

    const result = await handler(event);

    expect(result.principalId).toBe('user');
    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
  });

  test('denies POST request with invalid clientState', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        value: [
          {
            clientState: 'wrong-secret',
            subscriptionId: 'sub-123',
            resource: 'teams/teams',
            changeType: 'created',
          },
        ],
      }),
      headers: {},
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/POST/graph',
    };

    const result = await handler(event);

    expect(result.principalId).toBe('user');
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  test('denies POST request with missing clientState', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        value: [
          {
            subscriptionId: 'sub-123',
            resource: 'teams/teams',
            changeType: 'created',
          },
        ],
      }),
      headers: {},
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/POST/graph',
    };

    const result = await handler(event);

    expect(result.principalId).toBe('user');
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  test('allows POST request with multiple notifications if all have valid clientState', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        value: [
          {
            clientState: 'test-secret-value',
            subscriptionId: 'sub-123',
            resource: 'teams/teams',
            changeType: 'created',
          },
          {
            clientState: 'test-secret-value',
            subscriptionId: 'sub-124',
            resource: 'teams/teams',
            changeType: 'updated',
          },
        ],
      }),
      headers: {},
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/POST/graph',
    };

    const result = await handler(event);

    expect(result.principalId).toBe('user');
    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
  });

  test('denies POST request if any notification has invalid clientState', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        value: [
          {
            clientState: 'test-secret-value',
            subscriptionId: 'sub-123',
            resource: 'teams/teams',
            changeType: 'created',
          },
          {
            clientState: 'wrong-secret',
            subscriptionId: 'sub-124',
            resource: 'teams/teams',
            changeType: 'updated',
          },
        ],
      }),
      headers: {},
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/POST/graph',
    };

    const result = await handler(event);

    expect(result.principalId).toBe('user');
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  test('denies POST request with empty notifications', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        value: [],
      }),
      headers: {},
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/POST/graph',
    };

    const result = await handler(event);

    expect(result.principalId).toBe('user');
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  test('denies unknown HTTP methods', async () => {
    const event = {
      httpMethod: 'DELETE',
      headers: {},
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/DELETE/graph',
    };

    const result = await handler(event);

    expect(result.principalId).toBe('user');
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  test('handles JSON parsing errors gracefully', async () => {
    const event = {
      httpMethod: 'POST',
      body: 'invalid json',
      headers: {},
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abc123/dev/POST/graph',
    };

    const result = await handler(event);

    // Should deny on parse error
    expect(result.principalId).toBe('user');
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });
});
