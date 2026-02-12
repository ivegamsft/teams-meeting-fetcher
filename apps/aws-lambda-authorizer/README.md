# Lambda Authorizer for Microsoft Graph Webhooks

This Lambda function acts as an API Gateway REQUEST authorizer to validate incoming Microsoft Graph webhook callbacks.

## Authentication Flow

### 1. Subscription Validation (GET Request)

When you create a Graph webhook subscription, Microsoft sends a GET request with a `validationToken`:

```
GET /graph?validationToken=<token>
```

The authorizer **allows** these requests so the webhook writer Lambda can echo back the token.

### 2. Notification Validation (POST Request)

When Graph sends webhook notifications, it includes the `clientState` you specified during subscription creation:

```json
{
  "value": [
    {
      "clientState": "your-secret-value",
      "subscriptionId": "...",
      "changeType": "created",
      ...
    }
  ]
}
```

The authorizer **validates** that the `clientState` in each notification matches the expected value from the `CLIENT_STATE` environment variable.

## Security

- ✅ Validates `clientState` matches the secret you configure
- ✅ Allows GET requests with `validationToken` (required for subscription setup)
- ✅ Denies all other requests
- ✅ Returns proper IAM policies for API Gateway

## Configuration

The authorizer requires one environment variable:

- `CLIENT_STATE`: Secret value to validate against notification clientState

This is automatically configured by Terraform using the `client_state` variable.

## Deployment

1. Package the Lambda:

```bash
npm run package
```

2. The Terraform authorizer module will deploy it automatically.

## Testing

You can test the authorizer locally or via API Gateway:

### GET with validationToken (should allow):

```bash
curl "https://your-api.execute-api.us-east-1.amazonaws.com/dev/graph?validationToken=test-token"
```

### POST with valid clientState (should allow):

```bash
curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/dev/graph \
  -H "Content-Type: application/json" \
  -d '{"value":[{"clientState":"your-secret","subscriptionId":"123"}]}'
```

### POST with invalid clientState (should deny):

```bash
curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/dev/graph \
  -H "Content-Type: application/json" \
  -d '{"value":[{"clientState":"wrong-secret","subscriptionId":"123"}]}'
```

## Best Practices

1. **Keep CLIENT_STATE secret**: Store it in your terraform.tfvars and mark as sensitive
2. **Use a strong random value**: Generate with `openssl rand -base64 32`
3. **Rotate periodically**: Update the value and recreate Graph subscriptions
4. **Monitor logs**: Check CloudWatch logs for denied requests

## CloudWatch Logs

The authorizer logs all decisions to CloudWatch:

- Log group: `/aws/lambda/tmf-webhook-authorizer-{environment}`
- Retention: 7 days (configurable)

Look for:

- "Validation request detected" - GET request allowed
- "All notifications have valid clientState" - POST allowed
- "Invalid clientState" - POST denied
