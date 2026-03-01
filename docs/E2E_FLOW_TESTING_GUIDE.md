# End-to-End Flow Testing Guide

## Complete Pipeline: Meeting → Event Hub → Lambda → S3 → DynamoDB

### Architecture Flow

```
User Creates Meeting in Teams
           ↓
Microsoft Graph API (Change Notifications)
           ↓
Azure Event Hub (Receives Notification)
           ↓
Lambda: tmf-eventhub-processor-dev (Polls every 1 minute)
           ↓
Lambda: tmf-webhook-writer-dev (Processes Payload)
           ├→ AWS S3: tmf-webhooks-eus-dev (Stores Webhook)
           └→ AWS DynamoDB: eventhub-checkpoints (Tracks Offset)
```

---

## SETUP REQUIREMENTS (Before Testing)

### 1. Microsoft Graph Subscription

**STATUS**: Must be created
**Reference**: `docs/GRAPH_SUBSCRIPTIONS_SETUP.md`

**Critical Requirements**:

- Target group: `/groups/<YOUR_GROUP_ID>`
- Event type: `calendar.events`
- Notification URL must include:
  - Event Hub namespace FQDN
  - Topic path: `/<EVENT_HUB_NAME>`
  - Query parameter: `?tenantId=<YOUR_TENANT_ID>`

**Verify Subscription**:

```bash
az graph-query --query 'microsoft.graph.subscriptions' -o json
```

---

## TEST PHASE 1: Graph API → Event Hub

### Check Event Hub Connectivity

```bash
# Verify Event Hub namespace exists
az eventhub namespace show --name <EVENT_HUB_NAMESPACE> --resource-group <YOUR_RESOURCE_GROUP>

# List consumer groups
az eventhub eventhub consumer-group list \
  --namespace-name <EVENT_HUB_NAMESPACE> \
  --eventhub-name <EVENT_HUB_NAME> \
  --resource-group <YOUR_RESOURCE_GROUP>
```

### Expected Behavior

- Event Hub actively receiving notifications from Graph API
- Entries appear when meetings are created/updated in the target group
- Checkpoints are tracked per Event Hub partition

---

## TEST PHASE 2: Event Hub → Lambda Processing

### Monitor Lambda Logs (Real-time)

```bash
# Terminal 1: Event Hub Processor
aws logs tail /aws/lambda/tmf-eventhub-processor-dev \
  --follow --profile tmf-dev --region us-east-1

# Terminal 2: Webhook Writer
aws logs tail /aws/lambda/tmf-webhook-writer-dev \
  --follow --profile tmf-dev --region us-east-1
```

### Expected Log Output

```
[EventHubProcessor] Polling Event Hub for new messages
[EventHubProcessor] Received 1 message from partition 0, offset 1234
[WebhookWriter] Processing payload: meeting_created
[WebhookWriter] Payload size: 5432 bytes
[WebhookWriter] Stored to S3: webhooks/2026-02-19/timestamp.json
[WebhookWriter] Updated checkpoint: offset=1234, sequence=5678
```

### Lambda Metrics to Watch

- **Invocation Duration**: 100-500ms per call
- **Error Rate**: Should be 0%
- **Throttles**: Should be 0

---

## TEST PHASE 3: Lambda → Storage (S3 & DynamoDB)

### Verify S3 Payload Storage

```bash
# List all webhook payloads
aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev \
  --profile tmf-dev --region us-east-1 \
  --query 'Contents[].{Key:Key,Size:Size,Date:LastModified}' \
  --output table

# Download and inspect a payload
aws s3api get-object --bucket tmf-webhooks-eus-dev \
  --key webhooks/2026-02-19/timestamp.json \
  --profile tmf-dev --region us-east-1 \
  payload.json

# View payload
cat payload.json | jq .
```

### Expected S3 Structure

```
s3://tmf-webhooks-eus-dev/
├── webhooks/
│   ├── 2026-02-19/
│   │   ├── 14-30-45-123.json (2-10 KB)
│   │   ├── 14-32-12-456.json (2-10 KB)
│   │   └── ...
│   ├── 2026-02-20/
│   │   └── ...
```

### Verify DynamoDB Checkpoint Tracking

```bash
# Check Event Hub checkpoint progress
aws dynamodb scan --table-name eventhub-checkpoints \
  --profile tmf-dev --region us-east-1 \
  --output table

# Expected columns:
# - partition_id: (0-15 for Event Hub partitions)
# - sequence_number: Latest sequence processed
# - offset: Latest offset in partition
```

### Expected DynamoDB Entries

```
partition_id: 0
sequence_number: 5678
offset: 1234
checkpoint_timestamp: 2026-02-19T14:30:45Z
```

---

## COMPLETE TESTING WORKFLOW

### Step 1: Prepare Monitoring (5 minutes)

Open 3 terminal windows:

**Terminal 1**:

```bash
aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --profile tmf-dev --region us-east-1
```

**Terminal 2**:

```bash
aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev --region us-east-1
```

**Terminal 3**:

```bash
watch -n 5 'aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1'
```

### Step 2: Create Test Meeting (1 minute)

1. Open Microsoft Teams
2. Select the test group (containing members from `<YOUR_GROUP_ID>`)
3. Create a new calendar event:
   - Title: `Test Meeting [your name]`
   - Time: Within next 24 hours
   - Attendees: At least 1 group member

### Step 3: Wait for Event Hub Polling (2-3 minutes)

- Event Hub processor polls every 1 minute
- Wait for at least one polling cycle
- Observe for log entries in Terminal 1 & 2

### Step 4: Verify Flow Completion (1 minute)

Check each component:

```bash
# 1. Verify checkpoint was updated
aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1

# 2. Verify webhook payload stored in S3
aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev --profile tmf-dev --region us-east-1 --max-items 5

# 3. Check Graph subscription records
aws dynamodb scan --table-name graph_subscriptions --profile tmf-dev --region us-east-1

# 4. View Lambda execution summary
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=tmf-webhook-writer-dev \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --profile tmf-dev --region us-east-1
```

---

## TROUBLESHOOTING

### No Lambda Activity

**Symptom**: Logs show no invocations
**Check**:

1. Graph subscription created? `az graph-query --query 'microsoft.graph.subscriptions'`
2. Event Hub has messages? Check Azure Portal
3. Lambda function exists? `aws lambda get-function --function-name tmf-webhook-writer-dev --profile tmf-dev --region us-east-1`

### S3 Bucket Empty

**Symptom**: No payloads in S3
**Check**:

1. Lambda logs show "Stored to S3"?
2. Lambda has S3 permissions? Check IAM role
3. Bucket name correct? `aws s3api list-buckets --profile tmf-dev`

### DynamoDB Checkpoint Not Updating

**Symptom**: Offset stays the same
**Check**:

1. Event Hub has messages: `az eventhub eventhub consumer-group list...`
2. Lambda has DynamoDB permissions?
3. Table exists? `aws dynamodb list-tables --profile tmf-dev --region us-east-1`

---

## SUCCESS CRITERIA

Once all components complete, you should see:

- ✅ Lambda logs showing webhook processing
- ✅ S3 bucket contains multiple payload files
- ✅ DynamoDB checkpoint table has entries with increasing offsets
- ✅ Lambda execution time: <500ms per invocation
- ✅ Zero errors in CloudWatch logs
- ✅ Meeting data preserved in JSON payloads

---

## Next Steps After Successful E2E Test

1. **Configure Meeting Bot**: Integrate bot messaging endpoint
2. **Set up Subscription Renewal**: Configure Lambda schedule
3. **Add Group Sync**: Sync Teams group members to database
4. **Enable Monitoring**: Set up CloudWatch alarms
5. **Deploy to Production**: Scale infrastructure as needed
