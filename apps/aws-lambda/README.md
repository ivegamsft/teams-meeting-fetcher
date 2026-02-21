# AWS Lambda - Webhook Receiver

Lambda handler for receiving Graph API change notifications via HTTP webhooks.

## Handler

- **handler.js** - Webhook receiver (Graph API notifications via HTTP)

## Files

- `handler.js` - Webhook handler for processing Graph API notifications
- `package.json` - Dependencies and scripts
- `package.sh` / `package.ps1` - Deployment packaging scripts
- `sample-webhook.json` - Example webhook payload
- `test-event.json` - Test event for local testing

## Quick Start

```bash
# Install dependencies
npm install

# Deploy
./package.sh
```

## Architecture

**Webhook Path** (Graph API → API Gateway → Lambda → S3):

```
Graph API → API Gateway → Lambda → S3
```

## Environment Variables

```bash
BUCKET_NAME=tmf-webhook-payloads-dev
CLIENT_STATE=your-client-state
```

## Dependencies

```
@azure/event-hubs ^5.11.0  (NEW)
@aws-sdk/client-s3 ^3.744.0
aws-sdk ^2.1600.0
```
