# EventHub Testing - Guided Walkthrough

**Two Ways to Test:**

## ⚡ QUICK PATH (5 minutes) - Automated Script

Use the completely automated test that handles everything:

```powershell
cd <repo-root>
.\test-complete-flow.ps1
```

This script:
1. ✅ Creates a test meeting
2. ✅ Checks EventHub metrics  
3. ✅ Verifies Lambda processing
4. ✅ Checks DynamoDB storage
5. ✅ Provides detailed report

**Then open in separate terminal for live monitoring:**

```powersh
.\monitor-e2e-flow.ps1
```

This refreshes every 10 seconds showing real-time data flow.

---

## 🎯 DETAILED PATH (30-45 minutes) - Step-by-Step Walkthrough

**Estimated time: 30-45 minutes**

Follow this guide step-by-step to understand each part of the EventHub workflow including joining meetings and verifying transcripts.

### What You'll Do

1. ✅ Verify everything is working (pre-flight)
2. 🚀 Start monitoring in 3 terminals
3. 📅 Create a test meeting in Teams
4. 📞 Join the meeting
5. 🎙️ Keep meeting open for transcript capture
6. ✋ End meeting and wait for transcript
7. 📊 Verify all data flows (logs, storage, database)

---

## STEP 1: Pre-Flight Verification (5 minutes)

### 1.1 - Check Terraform Deployment

```bash
cd iac
terraform state list | wc -l
```

**Expected**: Shows **101**

**If not 101**: Run `terraform apply` first

### 1.2 - Verify Event Hub

```bash
az eventhub namespace show --name tmf-ehns-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk \
  --query 'provisioningState'
```

**Expected**: `Succeeded`

### 1.3 - Check Graph Subscription

```bash
cd nobots-eventhub/scripts
python list-subscriptions.py
```

**Expected output**:

```
✓ Found subscriptions
Subscription ID: sub_...
Resource: /groups/5e7708f8-b0d2-467d-97f9-d9da4818084a/events
Expires: [Today or future date]
```

❌ **If no subscription**: Create one:

```bash
python create-group-eventhub-subscription.py
```

### 1.4 - Verify AWS Access

```bash
aws sts get-caller-identity --profile tmf-dev --region us-east-1
```

**Expected**: Account `833337371676` and valid ARN

---

## STEP 2: Start Monitoring (3 Terminals, 5 minutes)

**You need 3 terminals open at the same time.**

### Terminal 1: Event Hub Processor Logs

Open new terminal, run:

```bash
aws logs tail /aws/lambda/tmf-eventhub-processor-dev \
  --follow --profile tmf-dev --region us-east-1
```

**What to watch for**:

- `Polling Event Hub...`
- `Received X messages from partition Y`
- `Processing message at offset Z`

### Terminal 2: Webhook Writer Logs

Open new terminal, run:

```bash
aws logs tail /aws/lambda/tmf-webhook-writer-dev \
  --follow --profile tmf-dev --region us-east-1
```

**What to watch for**:

- `Processing X message(s)`
- `Uploading payload to S3...`
- `Updating DynamoDB checkpoint`
- `Processing complete`

### Terminal 3: DynamoDB Checkpoints Monitor

Open new terminal, run:

```bash
# Watch for updates (refreshes every 5 seconds)
while ($true) {
  Clear-Host
  Write-Host "$(Get-Date) - DynamoDB Checkpoints"
  aws dynamodb scan --table-name eventhub-checkpoints \
    --profile tmf-dev --region us-east-1 --output table
  Start-Sleep -Seconds 5
}
```

**What to watch for**:

- Offset numbers appearing
- Offset numbers increasing over time
- Latest checkpoint_timestamp

✅ **All 3 terminals ready?** → Continue to Step 3

---

## STEP 3: Create Test Meeting in Teams (5 minutes)

### 3.1 - Create Meeting from Script

Back in your main terminal:

```bash
cd nobots-eventhub/scripts
python create-test-meeting.py --title "EventHub Transcript Test" --minutes 60
```

**You'll see output like**:

```
✓ Meeting created successfully
Event ID: event_abc123def456
Online Meeting ID: onlineMeeting_xyz789
Meeting starts: 2026-02-19 14:30:00
Join URL: https://teams.microsoft.com/l/meetup-join/...
```

**Save this information** (copy the Join URL)

### 3.2 - Verify Meeting in Teams

- Open Microsoft Teams
- Look in Calendar
- Should see "EventHub Transcript Test" meeting
- Meeting should be starting soon (in a few seconds)

### 3.3 - Watch Monitoring Terminals!

**At this moment, check your 3 monitoring terminals:**

**Terminal 1 (Processor)** should show:

```
[EventHubProcessor] Polling Event Hub for new messages
[EventHubProcessor] Received 1 message from partition 0
```

**Terminal 2 (Writer)** should show:

```
[WebhookWriter] Processing 1 message(s)
[WebhookWriter] Processing complete
```

**Terminal 3 (DynamoDB)** should show:

```
partition_id    offset    sequence_number    checkpoint_timestamp
0               1234      5678               2026-02-19T14:30:XX
```

✅ **Seeing activity in logs?** → Continue to Step 4

❌ **No activity?** → See [Troubleshooting](#troubleshooting) below

---

## STEP 4: Join the Meeting (2 minutes)

### 4.1 - Click Join URL

Paste the Join URL from Step 3.1 into your browser (or click from Teams)

### 4.2 - Join the Meeting

- Click "Join now"
- Allow camera/microphone (optional)
- Join the meeting

### 4.3 - Keep Meeting Open

**Important**: Keep the meeting open for **at least 2 minutes** so Teams can prepare the transcript

**While in meeting**:

- The meeting should show as active
- Recording/transcript capture should be enabled

---

## STEP 5: End Meeting & Capture (10 minutes)

### 5.1 - Leave Meeting

After 2+ minutes in the meeting:

- Click "Leave" to exit the meeting
- Meeting should end automatically after you leave

### 5.2 - Monitor Event Flow

**Check your 3 terminals again:**

**Terminal 1 (Processor)**: Should show another "Received messages"

```
[EventHubProcessor] Polling Event Hub...
[EventHubProcessor] Received 1 message from partition 2
[EventHubProcessor] Invoking webhook writer
```

**Terminal 2 (Writer)**: Should process the "meeting updated" event

```
[WebhookWriter] Processing 1 message(s)
[WebhookWriter] Calendar event: meeting_updated
[WebhookWriter] Uploading to S3...
```

**Terminal 3 (DynamoDB)**: Offset should increase

```
partition_id    offset    sequence_number    checkpoint_timestamp
2               512       2890               2026-02-19T14:31:XX
```

✅ **See activity for meeting end event?** → Continue to Step 6

---

## STEP 6: Verify Data Storage (10 minutes)

### 6.1 - Check S3 Webhook Payloads

In a new terminal:

```bash
# List all payloads
aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev \
  --profile tmf-dev --region us-east-1 \
  --prefix webhooks/ \
  --query 'Contents[*].{Key: Key, Size: Size, Modified: LastModified}' \
  --output table

# Get the latest payload
$latest = aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev \
  --profile tmf-dev --region us-east-1 \
  --prefix webhooks/ \
  --query 'Contents | max_by(@, &LastModified).Key' --output text

# Download it
aws s3api get-object --bucket tmf-webhooks-eus-dev \
  --key $latest --profile tmf-dev --region us-east-1 \
  latest-payload.json

# View it
$payload = Get-Content latest-payload.json | ConvertFrom-Json
$payload.value[0] | Select-Object changeType, @{Name='Subject';Expression={$_.resourceData.subject}}
```

**Expected output**:

```
changeType    Subject
----------    -------
created       EventHub Transcript Test
```

And later:

```
changeType    Subject
----------    -------
updated       EventHub Transcript Test
```

### 6.2 - Check DynamoDB Checkpoints

```bash
# View checkpoints
aws dynamodb scan --table-name eventhub-checkpoints \
  --profile tmf-dev --region us-east-1 \
  --output table

# Should show multiple partitions with increasing offsets
partition_id    offset    sequence_number
0               1234      5678
1               0         0
2               512       2890
3               0         0
```

✅ **Multiple partitions with offsets?** → Good!

### 6.3 - Check Graph Subscriptions Table

```bash
aws dynamodb scan --table-name graph_subscriptions \
  --profile tmf-dev --region us-east-1 \
  --output table
```

**Should show your subscription** with expiration date and resource path

### 6.4 - Check Meetings Table

```bash
aws dynamodb scan --table-name meetings \
  --profile tmf-dev --region us-east-1 \
  --output table
```

**Should show your test meeting** with details:

- meeting_id
- event_timestamp
- title: "EventHub Transcript Test"
- start_time
- end_time (should be recent)

---

## STEP 7: Verify Complete Data Flow (5 minutes)

### Checklist - Everything Working?

- [ ] **Pre-flight**: All infrastructure deployed
- [ ] **Monitoring**: 3 terminals showing logs
- [ ] **Meeting Created**: Visible in Teams calendar
- [ ] **Logs Show Activity**:
  - [ ] Processor logs show messages received
  - [ ] Writer logs show S3 uploads
- [ ] **DynamoDB Updated**:
  - [ ] Checkpoints have increasing offsets
  - [ ] Graph subscriptions recorded
  - [ ] Meetings table populated
- [ ] **S3 Payloads**:
  - [ ] Multiple payload files created
  - [ ] Files contain meeting data

### Success Score

| Component                    | Status | Points |
| ---------------------------- | ------ | ------ |
| Infrastructure deployed      | ✓      | 1      |
| Graph subscription active    | ✓      | 1      |
| Meeting created in Teams     | ✓      | 1      |
| Logs show processor activity | ✓      | 1      |
| Logs show writer activity    | ✓      | 1      |
| S3 has payloads              | ✓      | 1      |
| DynamoDB checkpoints updated | ✓      | 1      |
| Graph subscriptions tracked  | ✓      | 1      |
| Meetings table populated     | ✓      | 1      |

**Score 9/9?** 🎉 **COMPLETE SUCCESS!**

---

## 🎙️ TRANSCRIPT HANDLING (Advanced)

### Where Transcripts Are Stored

Transcripts are captured by Teams and can be accessed via Microsoft Graph API after the meeting ends:

```bash
# Get meeting transcript (after meeting ends)
cd nobots-eventhub/scripts

# List available transcripts
python <<'EOF'
import requests
from dotenv import load_dotenv
import os

load_dotenv("../../.env.local.azure")

# You'll implement this to fetch from:
# GET /me/onlineMeetings/{id}/transcripts

# Then save to S3 or DynamoDB
EOF
```

### Transcript Processing Flow

```
Meeting Ends
    ↓
Graph API notifies (via Event Hub)
    ↓
Lambda processes meeting_updated event
    ↓
Lambda polls for transcript availability
    ↓
Transcript downloaded via Graph API
    ↓
Transcript stored in S3: transcripts/{meeting-id}.vtt
```

### To Implement Transcript Handling

1. Update `tmf-webhook-writer-dev` Lambda to detect meeting end
2. Poll Graph API for transcript (`/onlineMeetings/{meetingId}/transcripts`)
3. Download transcript in VTT format
4. Store in S3: `s3://tmf-webhooks-eus-dev/transcripts/{meeting-id}.vtt`
5. Update DynamoDB meetings table with transcript_url

---

## ❌ TROUBLESHOOTING

### "No logs appearing in terminals?"

**Check 1**: Is subscription active?

```bash
python nobots-eventhub/scripts/list-subscriptions.py
```

**Check 2**: Did Event Hub receive the notification?

```bash
az eventhub eventhub show --name tmf-eh-eus-6an5wk \
  --namespace-name tmf-ehns-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk
```

**Check 3**: Do Lambda functions exist?

```bash
aws lambda get-function --function-name tmf-eventhub-processor-dev \
  --profile tmf-dev --region us-east-1 --query 'Configuration.State'
```

### "Lambda timeout error?"

Increase timeout:

```bash
aws lambda update-function-configuration \
  --function-name tmf-eventhub-processor-dev \
  --timeout 60 --profile tmf-dev --region us-east-1

aws lambda update-function-configuration \
  --function-name tmf-webhook-writer-dev \
  --timeout 60 --profile tmf-dev --region us-east-1
```

### "S3 upload fails?"

Check IAM role permissions:

```bash
aws iam get-role-policy --role-name tmf-lambda-webhook-writer-role \
  --policy-name s3-write-policy --profile tmf-dev
```

### "DynamoDB shows no data?"

Check table exists and has on-demand billing:

```bash
aws dynamodb describe-table --table-name eventhub-checkpoints \
  --profile tmf-dev --region us-east-1 \
  --query 'Table.{Status: TableStatus, BillingMode: BillingModeSummary}'
```

---

## 📝 NOTES FOR LATER

**Meeting Details** (save for reference):

- Event ID: ********\_********
- Online Meeting ID: ********\_********
- Join URL: ********\_********
- Meeting time: ********\_********

**Observations**:

- Logs appeared after \_\_\_ seconds
- S3 payload received after \_\_\_ seconds
- DynamoDB updated after \_\_\_ seconds

**Issues encountered**:

- ***
- ***

---

## 🎯 Next Steps

✅ **All tests passed?**

1. Review [MONITORING.md](../MONITORING.md) for production monitoring
2. Set up CloudWatch alarms
3. Configure SNS notifications
4. Deploy to production

❌ **Issues remaining?**

1. Check [MONITORING.md#troubleshooting](../MONITORING.md#troubleshooting)
2. Review Lambda logs in detail
3. Check Azure Event Hub metrics in Portal

📚 **Learn more**:

- [SETUP.md](../SETUP.md) - Configuration details
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Infrastructure code
- [MONITORING.md](../MONITORING.md) - Production operations

---

**Congratulations on testing EventHub!** 🎉

You've successfully verified the complete data flow from Teams meetings through Event Hub to AWS Lambda, S3, and DynamoDB.
