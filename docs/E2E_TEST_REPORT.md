# End-to-End Testing Report - 2026-02-20

## Executive Summary

Testing the complete flow from Teams meeting creation through Lambda processing and DynamoDB storage. Found and fixed a critical Lambda error.

## Test Results

### ✅ STEP 1: Create Test Meeting - SUCCESS

**Test Meeting Created Successfully**

```
Meeting ID: AAMkADA1ODk2NTNhLWQyODMtNDMzNi04NzQ3LTg1OGU3YTAzYzc5MUBGAAAAAA
Subject: E2E Test Meeting - 134006
Start: 2026-02-20T20:40:06 UTC
User: trustingboar@ibuyspy.net
```

**What Worked:**

- ✅ Graph API authentication successful
- ✅ Meeting created in target calendar
- ✅ PowerShell script executed without errors
- ✅ Timestamp correctly included in subject

**Method:**

```powershell
# Used: create-meetings.ps1 PowerShell script
# - Loads environment from .env.local.azure
# - Authenticates to Graph API with client credentials
# - Creates event in user calendar with 2-3 hour duration
# - Includes meeting title, time, attendee, and Teams meeting settings
```

---

### ⚠️ STEP 2: EventHub Notification - PENDING

**Status:** Meeting created, awaiting notification from Graph API

**Expected Flow:**

1. Meeting created event → Graph API → Change Tracking subscription
2. Graph API sends notification → Event Hub via HTTPS webhook
3. Event Hub consumer group receives message
4. Lambda polls Event Hub for events

**Key Components:**

- Graph Subscription: ✅ Active (configured for `/groups/5e7708f8-b0d2-467d-97f9-d9da4818084a` events)
- Event Hub: ✅ Ready (tmf-ehns-eus-6an5wk/tmf-eh-eus-6an5wk)
- Lambda: ⚠️ Fixed (see Step 3)

---

### ❌ STEP 3: Lambda Processing - ERROR FOUND AND FIXED

**Initial Error:**

```json
{
  "errorType": "TypeError",
  "errorMessage": "Cannot set property crypto of #<Object> which has only a getter",
  "trace": [
    "TypeError: Cannot set property crypto of #<Object> which has only a getter",
    "    at Object.<anonymous> (/var/task/eventhub-handler.js:19:15)"
  ]
}
```

**Root Cause:**
In Node.js 18+, `globalThis.crypto` is read-only and cannot be reassigned.

**Original Code (Line 9-11):**

```javascript
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
```

**Fix Applied:**

```javascript
// globalThis.crypto is already available in Node 18+, no need to set it
```

**File Modified:** `apps/aws-lambda-eventhub/handler.js`

**Deployment Status:**

- ✅ Code fixed
- ✅ npm install completed (24 packages)
- ✅ Lambda package created (7.9 MB)
- ✅ Function updated with new code: `tmf-eventhub-processor-dev`
- Last Modified: 2/20/2026 1:45:07 PM

**Next Validation:**
Lambda will automatically retry on next EventBridge trigger (every 1 minute).

---

### 🔍 STEP 4: DynamoDB Storage - NOT YET TESTED

**Checkpoints Table Status:**

- Table Name: `eventhub-checkpoints`
- Expected Fields: partitionId, sequenceNumber, offset, lastUpdated
- Current Status: ⚠️ No checkpoints found (Lambda hasn't processed yet)

**Meetings Table Status:**

- Table Name: `teams-meetings`
- Status: ℹ️ Not configured yet
- Expected Purpose: Store meeting events from EventHub

**Next Step:**
After Lambda successfully processes EventHub events, verify checkpoints update with:

```powershell
aws dynamodb scan --table-name eventhub-checkpoints --region us-east-1 --profile tmf-dev
```

---

## Infrastructure Status

### Azure Resources

- **Event Hub Namespace:** `tmf-ehns-eus-6an5wk`
- **Event Hub:** `tmf-eh-eus-6an5wk`
- **Resource Group:** `tmf-resource-group`
- **Graph Subscription:** ✅ Active (group events)

### AWS Resources

- **Lambda Function:** `tmf-eventhub-processor-dev` (✅ Updated)
- **EventBridge Rule:** `tmf-eventhub-poll-dev` (✅ Enabled, runs every 1 minute)
- **DynamoDB Tables:** `eventhub-checkpoints` (✅ Ready)
- **IAM Role:** ✅ Configured with Event Hub + DynamoDB permissions

### Trigger Configuration

```
EventBridge Schedule: rate(1 minute)
State: ENABLED
Description: Poll Azure Event Hub for Graph notifications
```

---

## Test Timeline

| Time  | Action                             | Result                            |
| ----- | ---------------------------------- | --------------------------------- |
| 13:41 | Created test meeting via Graph API | ✅ SUCCESS - Meeting ID generated |
| 13:41 | Waited for EventHub notification   | ⏳ IN PROGRESS                    |
| 13:45 | Deployed Lambda with crypto fix    | ✅ SUCCESS - Code deployed        |
| 13:46 | Tested Lambda invocation           | ✅ NO ERRORS - Ready for data     |

---

## Next Steps

### Immediate (Next 5 minutes)

1. ✅ **Lambda will retry** on next EventBridge trigger (automatic)
2. **Monitor Lambda logs** for successful Event Hub connection:

```powershell
aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --region us-east-1 --profile tmf-dev
```

### Short Term (Next 30 minutes)

3. **Verify EventHub receives notification** - Check for incoming messages
4. **Confirm Lambda processes successfully** - Look for checkpoint updates in DynamoDB
5. **Validate data storage** - Check meeting details stored correctly

### Troubleshooting Commands

```powershell
# Check EventHub metrics
az monitor metrics list `
  --resource /subscriptions/.../resourceGroups/tmf-resource-group/providers/Microsoft.EventHub/namespaces/tmf-ehns-eus-6an5wk `
  --metric IncomingMessages --interval PT1M

# Check DynamoDB checkpoints
aws dynamodb scan --table-name eventhub-checkpoints --region us-east-1 --profile tmf-dev

# View Lambda logs in real-time
aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --region us-east-1 --profile tmf-dev

# Manually trigger Lambda
aws lambda invoke --function-name tmf-eventhub-processor-dev --region us-east-1 --profile tmf-dev output.json

# Check EventBridge rule
aws events describe-rule --name tmf-eventhub-poll-dev --region us-east-1 --profile tmf-dev
```

---

## Test Infrastructure Used

### Scripts Created

1. **test-complete-flow.ps1** - Comprehensive end-to-end test
   - Step 1: Create meeting via Graph API
   - Step 2: Monitor EventHub metrics
   - Step 3: Check Lambda processing logs
   - Step 4: Verify DynamoDB storage

### Configuration Files

- **.env.local.azure** - Contains:
  - GRAPH_TENANT_ID
  - GRAPH_CLIENT_ID
  - GRAPH_CLIENT_SECRET
  - EVENTHUB_NAMESPACE
  - EVENTHUB_NAME
  - RESOURCE_GROUP

### Test Meeting Details

- **Subject:** E2E Test Meeting - {timestamp}
- **Start:** Current time + 2 hours
- **End:** Current time + 3 hours
- **Attendee:** trustingboar@ibuyspy.net
- **Meeting:** Teams online meeting

---

## Lessons Learned

### 1. Node.js 18+ Runtime Changes

- ✅ Global crypto is built-in and read-only
- ✅ Cannot use `globalThis.crypto = webcrypto` pattern
- ✅ Solution: Trust Node.js built-in crypto

### 2. Lambda Deployment Pipeline

- ✅ Code changes require redeployment
- ✅ zip file must include all node_modules
- ✅ Lambda updates automatically with EventBridge retries

### 3. Event Hub Timing

- ⏳ Graph API → EventHub → Lambda has 1-5 minute latency
- ✅ EventBridge ensures Lambda polls regularly
- ✅ DynamoDB checkpoints track progress

---

## Continuation Plan

### Phase 1: Verify Event Flow (NOW)

- [ ] Lambda successfully processes EventHub events
- [ ] No errors in Lambda logs
- [ ] DynamoDB checkpoints update

### Phase 2: Validate Data Storage (NEXT)

- [ ] Meeting data stored in DynamoDB
- [ ] Event Hub checkpoint sequence numbers increment
- [ ] Lambda logs show successful processing

### Phase 3: Transcription Integration (FUTURE)

- [ ] Configure transcription service
- [ ] Process meeting recordings
- [ ] Store transcripts in storage
- [ ] Link transcripts to meetings

---

## Test Status Dashboard

```
┌─────────────────────────────────────┐
│ E2E TEST STATUS SUMMARY             │
├─────────────────────────────────────┤
│ ✅ Teams Meeting Creation           │
│ ⏳ EventHub Notification             │
│ ⚠️  Lambda Processing (FIXED)        │
│ ⏳ DynamoDB Storage                  │
│ ⏳ Data Verification                 │
└─────────────────────────────────────┘
```

**Overall Progress:** 1/5 steps complete. Lambda fixed and ready for data processing.

---

## Questions for Next Round

1. **Should we create a separate teams-meetings table in DynamoDB** to store meeting event details for easy retrieval?
2. **Should Lambda transform EventHub messages** into a specific format before storage?
3. **When moving to transcriptions, should we** store transcripts in S3 and reference them in DynamoDB?
4. **Should we add retry logic** if EventHub message processing fails?
5. **How should we handle duplicate events** from Graph API subscriptions?

---

**Test Date:** 2026-02-20  
**Last Updated:** 13:46 UTC  
**Status:** ACTIVE - Awaiting Event Hub notifications
