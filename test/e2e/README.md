# End-to-End (E2E) Tests

Human-in-the-loop tests for validating complete workflows across all three scenarios.

## Overview

These E2E tests validate the full pipeline from Teams meeting creation to transcript/notification processing. Each test requires human interaction to create real Teams meetings, making them unsuitable for CI/CD but essential for manual validation.

## Test Scenarios

### 1. Teams Bot E2E (`aws/teams-bot-e2e.test.js`)
Tests the Teams bot flow where the bot is installed in meetings and receives Bot Framework events.

**Flow:**
1. Bot receives `meetingStart`/`meetingEnd` events
2. Bot polls for transcripts via Graph API (`/users/{userId}/onlineMeetings/{id}/transcripts`)
3. Transcripts stored in S3, session data in DynamoDB

**Human actions required:**
- Install bot in Teams meeting
- Start meeting, speak, end meeting
- Wait for transcript processing

### 2. EventHub E2E (`aws/eventhub-e2e.test.js`)
Tests the EventHub-based notification flow for calendar events.

**Flow:**
1. Graph API sends change notifications to Azure EventHub
2. AWS Lambda polls EventHub for events
3. Lambda stores events in S3, checkpoints in DynamoDB

**Human actions required:**
- Create/modify Teams meeting in calendar
- Wait for Graph notification delivery

### 3. Direct Graph API E2E (`aws/direct-graph-e2e.test.js`)
Tests direct webhook notifications from Graph API (no EventHub, no bot).

**Flow:**
1. Test creates Graph subscription pointing to webhook
2. Graph API sends notifications directly to API Gateway
3. Lambda validates and stores payloads in S3

**Human actions required:**
- Create/modify Teams meeting
- Wait for webhook notification

### 4. Azure Container Apps E2E (`azure/placeholder.test.js`)
Placeholder for future Azure deployment tests (currently skipped).

## Setup

1. **Copy environment configuration:**
   ```bash
   cp test/e2e/.env.test.example .env.test
   ```

2. **Fill in your values:**
   - AWS credentials and resource names
   - Graph API credentials
   - Bot Framework credentials (for scenario 1)
   - EventHub details (for scenario 2)
   - Webhook URL (for scenario 3)

3. **Install dependencies:**
   ```bash
   cd test/e2e
   npm install
   ```

## Running Tests

**Run all E2E tests:**
```bash
cd test/e2e
npm test
```

**Run specific scenario:**
```bash
npm test -- aws/teams-bot-e2e.test.js
npm test -- aws/eventhub-e2e.test.js
npm test -- aws/direct-graph-e2e.test.js
```

**Run with verbose output:**
```bash
npm test -- --verbose
```

## Test Structure

Each test follows this pattern:

1. **Pre-flight checks** - Verify infrastructure exists (Lambda, DynamoDB, S3, etc.)
2. **Setup** - Prepare resources (acquire tokens, create subscriptions)
3. **Human action prompt** - Clear instructions for manual steps
4. **Wait periods** - Allow time for async processing
5. **Validation** - Check logs, S3 objects, DynamoDB records
6. **Teardown** - Clean up test resources
7. **Summary** - Display results and troubleshooting tips

## Expected Test Duration

- **Teams Bot E2E:** 5-10 minutes
  - Meeting creation: 1-2 min
  - Meeting execution: 2-3 min
  - Transcript processing: 5-10 min
  
- **EventHub E2E:** 3-5 minutes
  - Meeting creation: 1-2 min
  - EventHub delivery: 1-2 min
  - Lambda processing: 1-2 min
  
- **Direct Graph E2E:** 3-5 minutes
  - Subscription creation: 30 sec
  - Meeting creation: 1-2 min
  - Webhook delivery: 1-3 min

## Troubleshooting

### No Lambda logs found
- Check EventBridge schedule is enabled
- Manually invoke Lambda: `aws lambda invoke --function-name <name> --profile tmf-dev output.json`
- Check Lambda has correct IAM permissions

### No S3 objects found
- Verify Lambda is running successfully
- Check S3 bucket permissions
- Review Lambda CloudWatch logs for errors

### No DynamoDB records
- Verify table names match environment variables
- Check Lambda has DynamoDB write permissions
- Ensure processing completed without errors

### Graph subscription fails
- Verify webhook URL is publicly accessible (HTTPS required)
- Check Graph API permissions (Calendars.Read, OnlineMeetings.Read)
- Ensure admin consent granted for application

### EventHub connection fails
- Verify EventHub namespace and connection string
- Check RBAC permissions (Azure Event Hubs Data Receiver)
- Ensure Managed Identity or SPN is configured

## CI/CD Integration

These tests are **not suitable for CI/CD** due to human interaction requirements. They should be:
- Run manually before releases
- Run after infrastructure changes
- Documented in release checklists

For automated testing, use:
- Unit tests (`test/unit/`)
- Integration tests (`test/integration/`)
- Infrastructure tests (`test/infrastructure/`)

## Helper Functions

See `helpers.js` for reusable utilities:
- `checkAwsLambdaExists()` - Verify Lambda function
- `checkDynamoDBTable()` - Verify DynamoDB table
- `checkS3Bucket()` - Verify S3 bucket
- `getRecentS3Objects()` - List recent S3 objects
- `scanDynamoDBItems()` - Query DynamoDB
- `getRecentLambdaLogs()` - Fetch CloudWatch logs
- `getGraphAccessToken()` - Get Graph API token
- `createGraphSubscription()` - Create Graph subscription
- `deleteGraphSubscription()` - Clean up subscription
- `promptHumanAction()` - Display instructions and wait

## Notes

- Tests run serially (maxWorkers: 1) to avoid conflicts
- 10-minute timeout allows for human interaction
- Tests are idempotent where possible
- Clean up subscriptions in teardown phase
- Rich console output guides human through process
