# Lambda ↔ Event Hub Integration Setup

## Overview

This integration allows AWS Lambda to consume calendar change notifications from Azure Event Hub. The flow is:

```
Microsoft Graph API
         ↓
   Calendar Change
         ↓
  Azure Event Hub
         ↓
AWS Lambda (eventhub-handler.js)
         ↓
   Process Event
   (Download transcript, update status, etc.)
         ↓
     S3 (audit log)
```

## Prerequisites

### 1. Event Hub Configuration

You need an active Event Hub with:
- **Namespace**: `tmf-ehns-eus-6an5wk.servicebus.windows.net`
- **Event Hub Name**: `tmf-eh-eus-6an5wk`
- **Connection String**: With `Listen` and `Send` permissions

### 2. Lambda Execution Role Permissions

Lambda needs:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/eventhub-notifications/*"
    }
  ]
}
```

## Environment Variables

Set these in Lambda configuration:

```bash
# Event Hub Configuration
EVENT_HUB_CONNECTION_STRING=Endpoint=sb://tmf-ehns-eus-6an5wk.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=...
EVENT_HUB_NAME=tmf-eh-eus-6an5wk

# S3 Audit Log (optional)
BUCKET_NAME=tmf-webhook-payloads-dev
```

## Lambda Handlers

### 1. **eventhub-handler.js** (New)

The main Event Hub consumer handler.

**Trigger options:**
- CloudWatch Events (scheduled, e.g., every 5 minutes)
- Manual API invocation
- SQS integration

**What it does:**
1. Connects to Event Hub
2. Receives calendar change notifications
3. Processes changes (calendar events, meeting updates)
4. Stores results in S3 (audit trail)

**Usage:**
```bash
# Deploy
zip -r lambda-eventhub.zip eventhub-handler.js eventhub-client.js node_modules/

# Update Lambda function
aws lambda update-function-code \
  --function-name tmf-eventhub-consumer \
  --zip-file fileb://lambda-eventhub.zip
```

### 2. **handler.js** (Existing - Webhook Receiver)

Original webhook receiver for Graph API webhooks.
- Receives Graph API notifications
- Stores in S3
- Validates clientState

**No changes needed** - both handlers can coexist.

## Installation & Testing

### 1. Install Dependencies

```bash
npm install
```

### 2. Local Testing

Create `.env.test`:
```bash
EVENT_HUB_CONNECTION_STRING=Endpoint=sb://...
EVENT_HUB_NAME=tmf-eh-eus-6an5wk
BUCKET_NAME=tmf-webhook-payloads-dev
```

Run test:
```bash
npm run test
```

### 3. Deploy to Lambda

#### Option A: Using AWS Console

1. Go to AWS Lambda Console
2. Create/Update function: `tmf-eventhub-consumer`
3. Runtime: **Node.js 18.x or later**
4. Set environment variables
5. Upload ZIP file

#### Option B: Using AWS CLI

```bash
# Build deployment package
npm install --production
zip -r lambda-eventhub.zip . -x node_modules/jest node_modules/.bin

# Update function code
aws lambda update-function-code \
  --function-name tmf-eventhub-consumer \
  --zip-file fileb://lambda-eventhub.zip

# Update environment variables
aws lambda update-function-configuration \
  --function-name tmf-eventhub-consumer \
  --environment Variables="{
    EVENT_HUB_CONNECTION_STRING='Endpoint=sb://...',
    EVENT_HUB_NAME='tmf-eh-eus-6an5wk',
    BUCKET_NAME='tmf-webhook-payloads-dev'
  }"

# Update timeout (Event Hub operations take time)
aws lambda update-function-configuration \
  --function-name tmf-eventhub-consumer \
  --timeout 60 \
  --memory-size 512
```

### 4. Set Up Scheduled Invocation (CloudWatch)

```bash
# Create rule
aws events put-rule \
  --name tmf-eventhub-consumer-schedule \
  --schedule-expression "rate(5 minutes)" \
  --state ENABLED

# Add Lambda as target
aws events put-targets \
  --rule tmf-eventhub-consumer-schedule \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:ACCOUNT:function:tmf-eventhub-consumer"

# Give EventBridge permission to invoke Lambda
aws lambda add-permission \
  --function-name tmf-eventhub-consumer \
  --statement-id AllowEventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:ACCOUNT:rule/tmf-eventhub-consumer-schedule
```

## Architecture Details

### EventHubClient Class

Located in `eventhub-client.js`:

```javascript
// Create client
const ehClient = new EventHubClient({
  connectionString: process.env.EVENT_HUB_CONNECTION_STRING,
  eventHubName: process.env.EVENT_HUB_NAME,
});

// Connect and receive messages
await ehClient.connect();
const messages = await ehClient.receiveMessages({
  maxMessages: 10,
  maxWaitTimeInSeconds: 30,
});

// Close connection
await ehClient.close();
```

**Message Format:**
```json
{
  "sequenceNumber": 123,
  "offset": "456",
  "timestamp": "2026-02-19T12:00:00Z",
  "data": {
    "resource": "/groups/{id}/events/{eventId}",
    "changeType": "created",
    "resourceData": { ... }
  },
  "partitionKey": "..."
}
```

### Processing Pipeline

1. **Receive**: Get messages from Event Hub
2. **Parse**: Extract change notification data
3. **Identify**: Determine resource type (calendar event, meeting, etc.)
4. **Process**: Handle based on type
   - Calendar events: Fetch details, check if ended, download transcript
   - Meeting updates: Update status, trigger recording retrieval
5. **Store**: Log to S3 for audit trail

## Troubleshooting

### "Event Hub Connection Failed"

```bash
# Verify connection string
az eventhubs namespace authorization-rule keys list \
  --resource-group tmf-rg-eus-6an5wk \
  --namespace-name tmf-ehns-eus-6an5wk \
  --name RootManageSharedAccessKey

# Check Event Hub is accessible
az eventhubs eventhub show \
  --name tmf-eh-eus-6an5wk \
  --namespace-name tmf-ehns-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk
```

### "No Messages Received"

1. Check Graph API subscription is active
2. Verify Graph API sent notifications to Event Hub
3. Check Event Hub has messages: `azure-cli` command

### Timeout Issues

Event Hub operations can take 30+ seconds. Set Lambda timeout to **≥ 60 seconds**.

```bash
aws lambda update-function-configuration \
  --function-name tmf-eventhub-consumer \
  --timeout 60
```

## Cost Estimate

**Event Hub Standard Tier:**
- Base: ~$0.95/hour (~$20/month)
- Ingestion units: 1 TU included
- Capacity: 1 MB/s ingress

**Lambda (Consumer):**
- 5-minute schedule, 60s execution time
- 288 invocations/day
- ~150GB-seconds/month
- **Cost: ~$2.50/month** (within free tier)

**Total: ~$25-30/month**

## Next Steps

1. ✅ Deploy eventhub-handler.js to Lambda
2. ✅ Set up CloudWatch scheduled invocation
3. ⬜ Implement calendar event processing
4. ⬜ Implement transcript download logic
5. ⬜ Set up monitoring/alerting
6. ⬜ Add SQS for decoupled processing

## References

- [Azure Event Hubs Client for JavaScript](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/eventhub/event-hubs)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Microsoft Graph Webhooks](https://docs.microsoft.com/en-us/graph/webhooks)
