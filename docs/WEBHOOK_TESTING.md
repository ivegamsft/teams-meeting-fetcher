# Webhook Testing & End-to-End Flow Guide

## Overview

The Teams Meeting Fetcher uses Microsoft Graph webhooks to receive real-time notifications when:

1. **Calendar events** are created/updated (meeting scheduled)
2. **Transcripts** are created (meeting recorded and transcript generated)

These webhooks deliver JSON payloads to your AWS API Gateway endpoint, which are processed by the Lambda function and stored in S3.

## Webhook Architecture

```
Microsoft Graph API
        ↓
  [Calendar/Transcript Event]
        ↓
[Webhook Notification POST]
        ↓
AWS API Gateway
        ↓
Lambda: tmf-webhook-writer-dev
        ↓
S3 Bucket: tmf-webhook-payloads-dev/webhooks/
        ↓
Your Processing Scripts
```

## Current Subscriptions

### Active Subscriptions

Run this to check what's currently subscribed:

```bash
python scripts/graph/list-subscriptions.py
```

Expected output:

- ✅ **Calendar subscription**: `users/{email}/events` (tracks meeting updates)
- ✅ **Transcript subscription**: `onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{oid}')` (tracks transcript creation)

## Testing the Webhook Flow

### Option 1: Manual Webhook Trigger (IMMEDIATE - for testing only)

**Simulate a webhook notification without waiting for a real Teams event:**

```bash
python scripts/graph/trigger-webhook-manual.py
```

This will:

1. ✅ Send a test transcript notification to your webhook URL
2. 📝 The Lambda will process and store it in S3
3. 📊 S3 payload will be saved for verification

**Then verify it was received:**

```bash
# Check latest S3 files (should see new file within 5 seconds)
aws s3 ls s3://tmf-webhook-payloads-dev/webhooks/ --profile tmf-dev --recursive | tail -5

# Read the webhook payload
aws s3 cp s3://tmf-webhook-payloads-dev/webhooks/FILENAME.json - --profile tmf-dev | python -m json.tool
```

### Option 2: Real Meeting Flow (RECOMMENDED)

**Create a real Teams meeting and test the actual flow:**

```bash
# 1. Create a test meeting with transcription enabled
python scripts/graph/03-create-test-meeting.py

# 2. Join the meeting and record it
# (Open Teams → Join meeting → Record → End meeting)

# 3. Monitor for webhook notifications
# (Typically arrives 5-30 minutes after meeting ends)
aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev

# 4. Monitor S3 for webhook payloads
watch -n 2 "aws s3 ls s3://tmf-webhook-payloads-dev/webhooks/ --profile tmf-dev --recursive | tail -10"
```

## Processing Transcripts

### After Webhook Notification Arrives in S3

Once a transcript notification webhook is delivered to S3:

```bash
# 1. Check for transcripts in Graph API
python scripts/graph/check-transcripts.py

# 2. Process transcript notification and fetch content
# (Reads from S3 and fetches full transcript from Graph API)
python process_transcript_notification.py

# 3. Or manually fetch a specific transcript
python scripts/graph/05-fetch-transcript.py
```

## Debugging Webhook Issues

### Issue: No Webhooks Arriving

**Check Lambda Logs:**

```bash
aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev
# Look for errors or failed deliveries
```

**Check API Gateway:**

```bash
aws logs tail /aws/api-gateway/... --follow --profile tmf-dev
# Or check API Gateway CloudWatch logs in AWS Console
```

**Verify Subscriptions:**

```bash
python scripts/graph/list-subscriptions.py

# Check expiration dates - subscriptions expire!
# Renew with: python scripts/graph/02-create-webhook-subscription.py
```

### Issue: Webhook Received but Lambda Not Processing

**Check Lambda Logs:**

```bash
# Look for specific errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/tmf-webhook-writer-dev \
  --filter-pattern "ERROR" \
  --start-time $(($(date +%s) - 3600))000 \
  --profile tmf-dev
```

**Test Manual Webhook:**

```bash
python scripts/graph/trigger-webhook-manual.py
# If this fails, the webhook endpoint/auth is misconfigured
```

### Issue: Subscriptions Expired

Subscriptions have a limited lifespan (24-72 hours depending on resource):

```bash
# List subscriptions and check expiration times
python scripts/graph/list-subscriptions.py

# Renew subscriptions interactively
python scripts/graph/02-create-webhook-subscription.py
# Choose option 4 to renew
```

## Integration with AWS

### Lambda Function Processing

The Lambda (`tmf-webhook-writer-dev`) receives webhooks and:

1. ✅ Validates `clientState` (webhook authentication)
2. ✅ Parses the JSON payload
3. ✅ Extracts subscription ID, resource, and change type
4. ✅ Stores normalized payload in S3 with timestamp

### S3 Storage Structure

```
s3://tmf-webhook-payloads-dev/
├── webhooks/
│   ├── 2026-02-13T02-18-51-337Z-08b6c46c-78b6-4747-9298-a2b972d4080d.json
│   ├── 2026-02-13T02-20-05-284Z-f1c2d3e4-a5b6-4c7d-8e9f-0g1h2i3j4k5l.json
│   └── ... (one file per webhook notification)
```

Each file contains the parsed Graph API webhook notification.

## Complete Workflow

### Scenario: Calendar Meeting → Recording → Transcript Delivery

```
TIME    EVENT                                          WEBHOOK TYPE
────    ────────────────────────────────────────────  ──────────────
T+0s    User creates Teams meeting from calendar      📅 Calendar (created)
T+1s    ✅ Webhook #1 arrives: meeting_created
        └→ Stored in S3

T+5m    User joins and starts recording               📅 Calendar (updated)
T+6s    ✅ Webhook #2 arrives: meeting_updated
        └→ Stored in S3

T+10m   User ends recording                           📝 Transcript (created)
T+25m   ✅ Webhook #3 arrives: transcript_created
        └→ Stored in S3
        └→ Contains transcript ID and metadata
        └→ Ready to fetch with 05-fetch-transcript.py
```

## Next Steps After Webhook Notification

Once a transcript webhook arrives in S3:

```bash
# 1. Check what webhooks are in S3
python -c "
import boto3
import json
s3 = boto3.client('s3', profile_name='tmf-dev', region_name='us-east-1')
resp = s3.list_objects_v2(Bucket='tmf-webhook-payloads-dev', Prefix='webhooks/', MaxKeys=10)
for obj in sorted(resp['Contents'], key=lambda x: x['LastModified'], reverse=True)[:3]:
    print(obj['Key'])
"

# 2. Process transcripts and fetch content
python process_transcript_notification.py

# 3. View transcript content (WebVTT format text file)
cat /path/to/downloaded/transcript.vtt
```

## Monitoring Best Practices

### Watch Real-Time Webhook Delivery

```bash
# Terminal 1: Monitor Lambda logs
aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev

# Terminal 2: Monitor S3 for new webhooks
watch -n 1 "aws s3 ls s3://tmf-webhook-payloads-dev/webhooks/ --profile tmf-dev | tail -5"

# Terminal 3: Run manual trigger or create meeting
python scripts/graph/trigger-webhook-manual.py
```

### Periodic Subscription Health Check

```bash
# Add to cron job or scheduled task
python scripts/graph/list-subscriptions.py

# If subscriptions expiring soon, renew them
python scripts/graph/02-create-webhook-subscription.py
```

## Troubleshooting Reference

| Symptom                      | Likely Cause                  | Solution                                      |
| ---------------------------- | ----------------------------- | --------------------------------------------- |
| No webhooks in S3            | Subscription expired          | Run `list-subscriptions.py` and renew         |
| Lambda not processing        | Webhook auth failed           | Check `clientState` matches webhook secret    |
| Manual trigger fails         | Endpoint/auth misconfigured   | Verify webhook URL and Bearer token           |
| Empty S3 files               | Lambda parsing error          | Check Lambda logs for exceptions              |
| Transcripts not in Graph API | Meeting not recorded properly | Verify meeting was actually recorded in Teams |

## Scripts Reference

| Script                               | Purpose                                      |
| ------------------------------------ | -------------------------------------------- |
| `list-subscriptions.py`              | Show active webhooks and expiration times    |
| `02-create-webhook-subscription.py`  | Create/renew webhooks (interactive)          |
| `trigger-webhook-manual.py`          | Send test webhook to Lambda                  |
| `check-transcripts.py`               | Check for transcripts in Graph API           |
| `process-transcript-notification.py` | Process webhook and fetch transcript content |
| `05-fetch-transcript.py`             | Fetch specific transcript by ID              |

---

**Last Updated**: 2026-02-13
**Subscription Status**: 2 active (calendar + transcripts), expires 2026-02-14
