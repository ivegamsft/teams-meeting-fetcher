# EventHub Testing Guide - Step by Step

Test the complete flow: **Meeting Creation → Event Hub → Lambda → S3 → DynamoDB**

## Pre-Flight Checklist (2 minutes)

Run these verifications first:

```bash
# 1. Verify infrastructure is deployed
cd iac
terraform state list | wc -l  # Should show 101 resources

# 2. Check Terraform outputs
terraform output -json | ConvertFrom-Json | Select-Object -Property event_hub_namespace, s3_bucket_name
```

```bash
# 3. Verify AWS credentials
aws sts get-caller-identity --profile tmf-dev --region us-east-1

# 4. Verify Event Hub accessible
az eventhub namespace show --name tmf-ehns-eus-6an5wk --resource-group tmf-rg-eus-6an5wk --query provisioningState
```

## Phase 1: Setup Monitoring (3 terminals, 2 minutes)

Open **3 separate terminals** to monitor the data flow in real time.

### Terminal 1: Track Event Hub Processing Logs
```bash
aws logs tail /aws/lambda/tmf-eventhub-processor-dev \
  --follow --profile tmf-dev --region us-east-1 \
  --log-stream-name-prefix ""
```

**What to watch for**:
```
[EventHubProcessor] Polling Event Hub...
[EventHubProcessor] Received X messages from partition Y
[EventHubProcessor] Processing message at offset Z
```

### Terminal 2: Track Webhook Writer Logs
```bash
aws logs tail /aws/lambda/tmf-webhook-writer-dev \
  --follow --profile tmf-dev --region us-east-1 \
  --log-stream-name-prefix ""
```

**What to watch for**:
```
[WebhookWriter] Processing 1 message(s)
[WebhookWriter] Uploading to S3...
[WebhookWriter] Updating DynamoDB checkpoint
[WebhookWriter] Success
```

### Terminal 3: Monitor DynamoDB Checkpoints
```bash
# One-time check, then repeat every 5-10 seconds after meeting creation
aws dynamodb scan --table-name eventhub-checkpoints \
  --profile tmf-dev --region us-east-1 \
  --output table
```

**Watch for offset increases**:
```
partition_id    offset    sequence_number
0               1234      5678
1               0         0
2               512       2890
```

---

## Phase 2: Create Graph Subscription (1 minute)

If you haven't already created a subscription:

```bash
cd nobots-eventhub/scripts
python create-group-eventhub-subscription.py
```

**Expected output**:
```
✓ Subscription created successfully
Subscription ID: sub_12345678
Resource: /groups/5e7708f8-b0d2-467d-97f9-d9da4818084a/events
Notification URL: https://tmf-ehns-eus-6an5wk.servicebus.windows.net/...?tenantId=62837751...
Expires: 2026-03-21 14:30:00 UTC
```

Save the **Subscription ID**.

---

## Phase 3: Create Test Meeting (1 minute)

Create a meeting to trigger the workflow:

```bash
cd nobots-eventhub/scripts
python create-test-meeting.py --title "EventHub Test $(Get-Date -Format 'HH:mm:ss')" --minutes 60
```

**Expected output**:
```
✓ Meeting created successfully
Event ID: event_abc123def456
Online Meeting ID: onlineMeeting_xyz789
Join URL: https://teams.microsoft.com/l/meetup-join/...
Meeting starts: 2026-02-19 14:30:00
```

**Keep this info for reference, especially the Event ID.**

---

## Phase 4: Monitor Event Flow (5-10 minutes)

Watch the three terminals as data flows through the system:

### Timeline of What Should Happen

**Seconds 0-30**: 
- Meeting created in Teams group
- Teams notifies Graph API
- Graph API sends notification to Event Hub

**Seconds 30-60**: 
- EventBridge schedule triggers (every 1 minute)
- `tmf-eventhub-processor-dev` Lambda invoked
- Reads messages from Event Hub
- Invokes `tmf-webhook-writer-dev`

**Seconds 60-90**:
- `tmf-webhook-writer-dev` processes payload
- Uploads to S3
- Updates DynamoDB checkpoint
- Logs show success

### Terminal Monitoring Checklist

**Terminal 1 (Processor Logs)** — Should show:
- ✓ "Polling Event Hub for new messages"
- ✓ "Received 1 message from partition 0"
- ✓ "Offset: XXXX, Sequence: YYYY"
- ✓ "Invoking webhook writer"

**Terminal 2 (Writer Logs)** — Should show:
- ✓ "Processing X message(s)"
- ✓ "Calendar event detected: meeting_created"
- ✓ "Uploading payload to S3"
- ✓ "Stored to: webhooks/2026-02-19/HH-MM-SS-xxx.json"
- ✓ "Updating checkpoint"
- ✓ "Processing complete"

**Terminal 3 (DynamoDB)** — Should show:
- ✓ Checkpoint table with entries
- ✓ Offset numbers increasing with each poll
- ✓ sequence_number field updated
- ✓ checkpoint_timestamp recent

---

## Phase 5: Verify Data Storage (3 minutes)

### Check S3 Webhook Payloads

```bash
# List recent payloads
aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev \
  --profile tmf-dev --region us-east-1 \
  --prefix webhooks/ \
  --query 'Contents[*].{Key: Key, Size: Size, Modified: LastModified}' \
  --output table | sort -k3 -r | head -10
```

**Expected**: Files with today's date and recent timestamps

```bash
# Get the latest payload
$latest = aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev \
  --profile tmf-dev --region us-east-1 \
  --prefix webhooks/ \
  --query 'Contents | max_by(@, &LastModified).Key' --output text

# Download and inspect
aws s3api get-object --bucket tmf-webhooks-eus-dev \
  --key $latest --profile tmf-dev --region us-east-1 \
  latest-payload.json

# View the payload
cat latest-payload.json | ConvertFrom-Json | ConvertTo-Json -Depth 5 | more
```

**Should contain**:
```json
{
  "value": [
    {
      "changeType": "created",
      "resource": "/groups/5e7708f8-b0d2-467d-97f9-d9da4818084a/events/event_abc123",
      "resourceData": {
        "subject": "EventHub Test 14:30:45",
        "start": "2026-02-19T14:30:00.000Z",
        "organizer": {...},
        ...
      }
    }
  ]
}
```

### Check DynamoDB Tracking

```bash
# View checkpoint details
aws dynamodb scan --table-name eventhub-checkpoints \
  --profile tmf-dev --region us-east-1 \
  --output table

# Check graph subscriptions table
aws dynamodb scan --table-name graph_subscriptions \
  --profile tmf-dev --region us-east-1 \
  --output table

# Check meetings table (if populated)
aws dynamodb scan --table-name meetings \
  --profile tmf-dev --region us-east-1 \
  --output table
```

**Should show**:
- ✓ `eventhub-checkpoints`: 4 entries (one per partition), offsets increasing
- ✓ `graph_subscriptions`: Subscription record with expiration date
- ✓ `meetings`: Meeting record with event details

---

## Success Criteria

### ✅ Full Success
- [ ] All 3 terminals show activity
- [ ] Processor logs show messages received
- [ ] Writer logs show S3 upload
- [ ] DynamoDB checkpoint offset increased
- [ ] S3 contains new payload files
- [ ] Payload contains meeting data

### ⚠️ Partial Success (Issue to Fix)
| Symptom | Check |
|---------|-------|
| No processor logs | Event Hub subscription inactive? |
| No writer logs | Lambda permission issue? |
| No S3 files | S3 IAM role missing |
| No checkpoint update | DynamoDB permission issue |
| Offsets not increasing | Event Hub has no messages |

---

## Troubleshooting

### "No messages appearing in logs?"

**Check 1: Graph subscription active**
```bash
cd nobots-eventhub/scripts
python list-subscriptions.py
```
Should show subscription with status `active`

**Check 2: Event Hub has messages**
```bash
az eventhub eventhub show --name tmf-eh-eus-6an5wk \
  --namespace-name tmf-ehns-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk \
  --query '{CreatedAt: createdAt, MessageCount: messageCount}'
```

**Check 3: Lambda functions exist**
```bash
aws lambda get-function --function-name tmf-eventhub-processor-dev \
  --profile tmf-dev --region us-east-1 \
  --query 'Configuration.{State: State, Runtime: Runtime, Memory: MemorySize}'
```

### "Lambda timeout error?"

Increase timeout:
```bash
aws lambda update-function-configuration \
  --function-name tmf-eventhub-processor-dev \
  --timeout 60 \
  --profile tmf-dev --region us-east-1
```

### "Access denied on S3?"

Verify Lambda IAM role has S3 permissions:
```bash
aws iam get-role-policy --role-name tmf-lambda-webhook-writer-role \
  --policy-name s3-write-policy --profile tmf-dev
```

### "DynamoDB throttling?"

Check if using on-demand billing:
```bash
aws dynamodb describe-table --table-name eventhub-checkpoints \
  --profile tmf-dev --region us-east-1 \
  --query 'Table.BillingModeSummary'
```

Should show `PAY_PER_REQUEST` (on-demand)

---

## Quick Test Commands (Copy & Paste)

Run these in order to verify everything:

```bash
# Setup terminals 1-3 (as shown in Phase 1)

# Then in a 4th terminal, run:
cd nobots-eventhub/scripts

# Verify subscription
python list-subscriptions.py

# Create meeting
python create-test-meeting.py --title "Quick Test" --minutes 30

# Wait 2 minutes for event flow

# Check results
aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev --profile tmf-dev --region us-east-1 --prefix webhooks/ --query 'Contents[-1]'

aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1 --output table
```

---

## Review & Next Steps

After testing:

1. **All data flowing?** → Proceed to production
2. **Partial flow?** → Check logs in [MONITORING.md](../MONITORING.md)
3. **Errors?** → See troubleshooting section above
4. **Questions?** → Review documentation:
   - [SETUP.md](../SETUP.md)
   - [DEPLOYMENT.md](../DEPLOYMENT.md)
   - [MONITORING.md](../MONITORING.md)

---

**Estimated Total Test Time**: 15-20 minutes  
**Success Rate**: >95% if all prerequisites met  
**Next**: Proceed to production deployment or fine-tuning

