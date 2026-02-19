# AWS Lambda Functions

This package contains Lambda handlers for processing Teams meeting notifications from Azure Event Hub and storing in S3.

## Handlers

- **handler.js** - Webhook receiver (Graph API webhooks via HTTP)
- **eventhub-handler.js** - Event Hub consumer ⭐ NEW (cross-cloud integration)

## Files

- `eventhub-handler.js` - NEW: Event Hub consumer handler
- `eventhub-client.js` - NEW: Azure Event Hub client
- `test-eventhub.js` - NEW: Local test script
- `EVENTHUB_INTEGRATION.md` - NEW: Complete setup guide
- `package.sh` / `package.ps1` - Deployment packaging scripts

## Quick Start

```bash
# Install + test
npm install
npm run test:eventhub

# Deploy
./package.sh
```

## Event Hub Integration ⭐

See **[EVENTHUB_INTEGRATION.md](./EVENTHUB_INTEGRATION.md)** for:
- Setup instructions
- Deployment guide  
- Environment configuration
- Troubleshooting
- Cost estimates

## Architecture

**New Event Hub Path** (AWS ↔ Azure cross-cloud):
```
Graph API → Event Hub → Lambda → S3
```

**Existing Webhook Path**:
```
Graph API → API Gateway → Lambda → S3
```

## Environment Variables

```bash
EVENT_HUB_CONNECTION_STRING=Endpoint=sb://...
EVENT_HUB_NAME=tmf-eh-eus-6an5wk
BUCKET_NAME=tmf-webhook-payloads-dev
```

## Dependencies

```
@azure/event-hubs ^5.11.0  (NEW)
@aws-sdk/client-s3 ^3.744.0
aws-sdk ^2.1600.0
```
