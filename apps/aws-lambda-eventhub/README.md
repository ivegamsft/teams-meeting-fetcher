# AWS Lambda - EventHub Consumer

Lambda handler for reading change notifications from Azure EventHub with custom AAD credential handling and DynamoDB state tracking.

## Handler

- **handler.js** - Production EventHub consumer with RBAC, custom credentials, and DynamoDB support

## Features

- ✅ Custom AAD credential fetching with token caching
- ✅ EventHub consumer with partition management
- ✅ DynamoDB state tracking for checkpoints
- ✅ S3 output for message archival
- ✅ RBAC authentication for Azure services
- ✅ Historical message reading with `earliestEventPosition`

## Files

- `handler.js` - Main EventHub consumer handler (297 lines)
- `package.json` - Dependencies and scripts
- `package.ps1` / `package.sh` - Deployment packaging scripts
- `LAMBDA_CONFIGURATION.md` - Complete deployment guide
- `HANDLER_IMPROVEMENTS.md` - Delta notes on recent improvements

## Quick Start

```bash
# Install dependencies
npm install

# Package and deploy
./package.sh
# or
./package.ps1
```

## Configuration

See [LAMBDA_CONFIGURATION.md](./LAMBDA_CONFIGURATION.md) for:

- Environment variables (required and optional)
- IAM permissions
- Deployment instructions
- Testing procedures
- Troubleshooting guide

Required environment variables:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `EVENT_HUB_NAMESPACE`
- `EVENT_HUB_NAME`
- `CONSUMER_GROUP`
- `BUCKET_NAME`

Optional:

- `EVENTHUB_CHECKPOINT_TABLE` (DynamoDB checkpoints)
- `PARTITION_IDS`
- `MESSAGE_PROCESSING_MODE`

## Architecture

**EventHub Consumer Path** (Azure → EventHub → Lambda):

```
Graph API → Azure EventHub → Lambda (RBAC) → S3 (optional)
```

The handler:

- ✅ Reads messages from EventHub with RBAC credentials
- ✅ Auto-detects available partitions
- ✅ Supports flexible partition configuration
- ✅ Handles multi-partition scenarios
- ✅ Outputs to S3 if configured

## Deployment

```bash
cd apps/aws-lambda-eventhub

# Build
npm install
./package.ps1  # or ./package.sh

# Update Lambda function
aws lambda update-function-code \
  --function-name tmf-eventhub-processor-dev \
  --zip-file fileb://lambda.zip \
  --profile tmf-dev \
  --region us-east-1

# Test
aws lambda invoke \
  --function-name tmf-eventhub-processor-dev \
  --profile tmf-dev \
  --region us-east-1 \
  response.json
```

See [LAMBDA_CONFIGURATION.md](./LAMBDA_CONFIGURATION.md) for complete setup instructions.
