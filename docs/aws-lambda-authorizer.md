# AWS Lambda Authorizer Security Guide

## Overview

The AWS infrastructure now includes a Lambda REQUEST authorizer that validates all incoming Microsoft Graph webhook callbacks. This adds an essential security layer to prevent unauthorized access to your webhook endpoint.

## Architecture

```
Microsoft Graph        Teams Bot Framework
         ↓                     ↓
   /graph endpoint      /bot/* endpoints
         ↓                     ↓
  API Gateway with Lambda Authorizer
         ↓
    Validates:
    - validationToken (GET /graph)
    - clientState (POST /graph)
    - clientState (POST /bot/*)
         ↓
 If Valid ─→ Lambda Handler → (Webhook Writer or Bot)
 If Invalid → Deny (403)
```

**Protected Endpoints:**

- `POST /graph` - Microsoft Graph webhook notifications
- `GET /graph` - Subscription validation requests
- `POST /bot/callbacks` - Bot framework callbacks
- `POST /bot/messages` - Bot message handling

## Security Benefits

### Before Authorizer

- ❌ Any request to the webhook URL would be processed
- ❌ No validation of request origin
- ❌ Vulnerable to malicious webhook notifications

### With Authorizer

- ✅ Only requests with valid `validationToken` or `clientState` are processed
- ✅ Shared secret validation between you and Microsoft Graph
- ✅ Protects against unauthorized webhook calls
- ✅ Prevents potential data injection attacks

## How It Works

### 1. Subscription Creation (GET Request)

When you create a Microsoft Graph subscription:

```javascript
POST https://graph.microsoft.com/v1.0/subscriptions
{
  "notificationUrl": "https://your-api.execute-api.us-east-1.amazonaws.com/dev/graph",
  "clientState": "your-secret-value",
  ...
}
```

Microsoft sends a validation GET request:

```
GET /graph?validationToken=<random-token>
```

**Authorizer Action**: Allows the request (required for subscription setup)

### 2. Webhook Notifications (POST Request)

When events occur, Microsoft sends notifications:

```json
{
  "value": [
    {
      "clientState": "your-secret-value",
      "subscriptionId": "...",
      "resource": "...",
      "changeType": "created"
    }
  ]
}
```

**Authorizer Action** (Security Layer):

1. **Parse the request body** and extract all notifications
2. **Validate each notification's `clientState`** against `CLIENT_STATE` environment variable
3. **Allow request** only if ALL notifications match the expected clientState
4. **Deny request** if any notification has invalid or missing clientState

This ensures malicious or spoofed webhook requests are rejected at the API Gateway level before reaching the Lambda handler.

## 3. Bot API Routes (POST /bot/callbacks, /bot/messages)

The same authorizer also protects the bot's webhook routes:

```
Teams Bot Framework → API Gateway → Lambda Authorizer → Meeting Bot Lambda
```

**Authorizer Action**:

1. **Validate `clientState`** from the request body (same validation as Graph webhooks)
2. **Allow request** if clientState is valid
3. **Deny request** (403) if clientState is missing or invalid

This provides consistent security across both the Graph webhook receiver and the bot message handler, protecting against unauthorized bot interactions.

### Example Bot Route Request

```bash
curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/dev/bot/callbacks \
  -H "Content-Type: application/json" \
  -d '{
    "clientState": "your-configured-secret",
    "botId": "bot-123",
    "message": "..."
  }'
```

The authorizer will validate the `clientState` before the bot handler processes the request.

## Configuration

### 1. Generate a Strong Client State Secret

```bash
# Using OpenSSL (Linux/Mac/WSL)
openssl rand -base64 32

# Using PowerShell (Windows)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

### 2. Configure Terraform

Add to your `terraform.tfvars`:

```hcl
client_state = "your-generated-secret-value"
```

**Important**: Keep this value secret! Don't commit it to version control.

### 3. Deploy Infrastructure

```bash
cd iac/aws
terraform init
terraform apply
```

### 4. Create Graph Subscriptions

When creating subscriptions via Microsoft Graph API, use the **same** `clientState` value:

```javascript
{
  "changeType": "created,updated",
  "notificationUrl": "<your-api-gateway-url>",
  "resource": "users/{userId}/events",
  "clientState": "<same-value-as-terraform>"
}
```

## Testing

### Test Validation Request (Should Succeed)

```bash
curl "https://your-api.execute-api.us-east-1.amazonaws.com/dev/graph?validationToken=test"
```

Expected: 200 OK with token echoed back

### Test Valid Notification (Should Succeed)

```bash
curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/dev/graph \
  -H "Content-Type: application/json" \
  -d '{
    "value": [{
      "clientState": "your-configured-secret",
      "subscriptionId": "test-123",
      "resource": "users/test@example.com/events/abc123"
    }]
  }'
```

Expected: 200 OK

### Test Invalid Notification (Should Fail)

```bash
curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/dev/graph \
  -H "Content-Type: application/json" \
  -d '{
    "value": [{
      "clientState": "wrong-secret",
      "subscriptionId": "test-123"
    }]
  }'
```

Expected: 403 Forbidden

## Monitoring

### CloudWatch Logs

Check authorizer logs for security events:

```bash
aws logs tail /aws/lambda/tmf-webhook-authorizer-dev --follow
```

Look for:

- ✅ "Validation request detected, allowing" - Subscription setup
- ✅ "All notifications have valid clientState, allowing" - Valid webhook
- ❌ "Invalid clientState, denying" - **Security event - investigate!**
- ❌ "No notifications in body, denying" - **Malformed request**

### CloudWatch Metrics

Monitor:

- **Authorizer invocations** - Total requests
- **Denied requests** - Potential security incidents
- **Errors** - Authorizer failures (check logs)

### Alerting

Set up CloudWatch alarms for:

- High rate of denied requests (potential attack)
- Authorizer errors (availability issue)

## Security Best Practices

### 1. Rotate Client State Regularly

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -base64 32)

# Update terraform.tfvars
# Update Graph subscriptions with new clientState
# Apply terraform changes
```

### 2. Monitor for Anomalies

- Unexpected spikes in denied requests
- Requests from unusual IP ranges
- Failed authorization attempts

### 3. Keep Secrets Secure

- ✅ Use terraform.tfvars (in .gitignore)
- ✅ Use environment-specific secrets
- ❌ Never commit secrets to version control
- ❌ Never log the actual clientState value

### 4. Additional Security Layers (Optional)

Consider adding:

- **IP allowlist**: Restrict to Microsoft Graph IP ranges
- **Request signing**: Validate request signatures (if Graph supports)
- **Rate limiting**: API Gateway throttling
- **WAF**: AWS WAF for additional protection

## Troubleshooting

### Subscription Creation Fails

**Problem**: Graph returns validation error

**Solution**:

1. Check authorizer logs for "Validation request detected"
2. Ensure GET requests with `validationToken` are allowed
3. Verify webhook writer Lambda echoes the token correctly

### Notifications Rejected

**Problem**: Valid notifications return 403

**Solution**:

1. Check authorizer logs for clientState validation failures
2. Verify terraform.tfvars `client_state` matches Graph subscription
3. Ensure clientState hasn't been rotated without updating subscriptions

### Performance Issues

**Problem**: Slow webhook processing

**Solution**:

1. Authorizer is cached for 0 seconds (configurable)
2. Check authorizer Lambda execution time (should be <50ms)
3. Consider increasing authorizer memory if needed

## Cost Impact

The authorizer adds minimal cost:

- **Lambda invocations**: ~$0.20 per 1M requests
- **CloudWatch Logs**: ~$0.50/GB ingested
- **Compute time**: <128MB, <10ms average = negligible

Total additional cost: **< $1/month** for typical workloads

## Conclusion

The Lambda authorizer provides essential security for your webhook endpoint with minimal overhead. Always use it in production environments to protect against unauthorized access.

For questions or issues, check:

- CloudWatch Logs: `/aws/lambda/tmf-webhook-authorizer-{env}`
- Terraform state: `terraform show`
- API Gateway logs: Enable execution logging for detailed request tracking
