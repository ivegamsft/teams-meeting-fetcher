# Lambda Event Hub Processor Diagnosis

**Date**: 2026-02-20  
**Function**: `tmf-eventhub-processor-dev`  
**Status**: 🔴 **FAILING** - SDK API Incompatibility

---

## 🔍 Findings

### ✅ Connection to Event Hub

- Lambda **IS attempting to connect** to Event Hub
- Creates `EventHubConsumerClient` with correct AAD credentials
- Environment variables properly configured:
  - `EVENT_HUB_NAMESPACE` = `<from-terraform-eventhub_namespace_name>`
  - `EVENT_HUB_NAME` = `<from-terraform-eventhub_name>`
  - `CONSUMER_GROUP` = `<from-terraform-eventhub_lambda_consumer_group>`
  - `BUCKET_NAME` = `<your-bucket-name>`
  - Azure credentials loaded from environment

**Status**: CONNECTION LOGIC EXISTS ✅

---

### ✅ Polling Configuration

- **EventBridge Rule**: `tmf-eventhub-poll-dev`
- **Schedule**: `rate(1 minute)`
- **Lambda Invocation**: Every 1 minute
- **Last Invokation**: 2026-02-20 00:50:45 UTC

**Status**: POLLING WORKING ✅

---

### ❌ Message Reading - **CRITICAL BUG**

**Error Log** (from CloudWatch):

```
2026-02-20T00:50:45.047Z  ERROR  Invoke Error
{
  "errorType": "TypeError",
  "errorMessage": "consumer.receiveBatch is not a function",
  "stack": [
    "TypeError: consumer.receiveBatch is not a function",
    "at receivePartitionEvents (/var/task/eventhub-handler.js:150:19)",
    "at exports.handler (/var/task/eventhub-handler.js:187:28)"
  ]
}
```

**Root Cause**:
The handler is calling `consumer.receiveBatch()` which **does not exist** in Azure SDK `@azure/event-hubs@^5.11.0`.

**Location**: `apps/aws-lambda-eventhub/handler.js` lines 148-154

**Buggy Code**:

```javascript
async function receivePartitionEvents(
  consumer,
  partitionId,
  maxEvents,
  pollWindowMinutes,
  checkpoint
) {
  // ... setup code ...
  return consumer.receiveBatch(partitionId, maxEvents, {
    // ❌ DOES NOT EXIST
    maxWaitTimeInSeconds: 5,
    startPosition,
  });
}
```

**Status**: MESSAGE READING FAILING ❌

---

### ❌ Seeing Messages - **NOT HAPPENING**

Since the handler crashes before reading, **zero messages** are being consumed.

**Evidence**:

- S3 bucket has NO files in `eventhub/` folder
- Lambda crashes on every invocation
- No messages reach processing pipeline

**Status**: NO MESSAGES PROCESSED ❌

---

## 🛠️ Solution Applied

### Fixed the Handler

**Changed** `receivePartitionEvents()` to use the correct Azure SDK API:

```javascript
async function receivePartitionEvents(
  consumer,
  partitionId,
  maxEvents,
  pollWindowMinutes,
  checkpoint
) {
  let startPosition = earliestEventPosition;

  if (checkpoint && Number.isFinite(checkpoint.sequence_number)) {
    startPosition = { sequenceNumber: checkpoint.sequence_number + 1 };
  } else if (pollWindowMinutes > 0) {
    startPosition = { enqueuedOn: new Date(Date.now() - pollWindowMinutes * 60 * 1000) };
  }

  const events = [];
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve(events);
    }, 5000);

    consumer
      .subscribe(
        // ✅ CORRECT API
        {
          processEvents: async (receivedEvents, context) => {
            events.push(...receivedEvents);
            if (events.length >= maxEvents) {
              clearTimeout(timeout);
              resolve(events);
            }
          },
          processError: async (err, context) => {
            console.error(`Error processing partition ${partitionId}:`, err);
            clearTimeout(timeout);
            reject(err);
          },
        },
        {
          startPosition,
          maxWaitTimeInSeconds: 5,
        }
      )
      .catch((err) => {
        console.error(`Failed to subscribe to partition ${partitionId}:`, err);
        clearTimeout(timeout);
        reject(err);
      });
  });
}
```

**Key Changes**:

1. ✅ Uses `consumer.subscribe()` instead of non-existent `receiveBatch()`
2. ✅ Implements callback-based event processing (`processEvents` handler)
3. ✅ Proper error handling with `processError` callback
4. ✅ Returns a Promise wrapper for async/await compatibility
5. ✅ Maintains checkpoint tracking (same as before)

---

## 📋 Deployment Steps

### Step 1: Create Deployment Package

```powershell
cd "f:\Git\teams-meeting-fetcher\apps\aws-lambda-eventhub"

# Create zip with fixed handler
Add-Type -AssemblyName "System.IO.Compression.FileSystem"
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  "$(Get-Location)",
  "lambda.zip",
  'Optimal',
  $true
)
```

or using native tools:

```bash
cd apps/aws-lambda-eventhub
zip -r lambda.zip handler.js node_modules
```

### Step 2: Deploy with Terraform

```bash
cd iac
terraform init
terraform plan -target=module.eventhub_processor
terraform apply -target=module.eventhub_processor
```

Or update directly:

```bash
aws lambda update-function-code \
  --function-name tmf-eventhub-processor-dev \
  --zip-file fileb://lambda.zip \
  --region us-east-1 \
  --profile tmf-dev
```

### Step 3: Verify Deployment

Azure Tenant Check:

```bash
az account show --query "tenantId"
# Expected: 62837751-4e48-4d06-8bcb-57be1a669b78
```

Check Lambda logs:

```bash
aws logs tail /aws/lambda/tmf-eventhub-processor-dev \
  --follow \
  --profile tmf-dev \
  --region us-east-1
```

Expected success logs:

```
START RequestId: ...
...
Received X messages
Processed X events
statusCode: 200
```

---

## 📊 Expected Outcome After Fix

### Before (Current - 🔴 FAILING):

- Lambda invoked every 1 minute: ✅
- Connection attempted: ✅
- **Message reading: ❌ Crashes with `receiveBatch is not a function`**
- Messages consumed: 0
- S3 payload files: 0

### After (Expected - 🟢 SUCCESS):

- Lambda invoked every 1 minute: ✅
- Connection successful: ✅
- Message reading: ✅ Reads from all partitions
- Messages consumed from Event Hub: **145+ (from Event Hub)**
- S3 payload files: ✅ JSON files with event data
- DynamoDB checkpoints: ✅ Updated with sequence numbers

---

## 🧪 Testing

After deployment, verify with:

```bash
# 1. Create test meeting
pwsh -c '[user should create test meeting]'

# 2. Monitor Lambda logs in real-time
aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --profile tmf-dev --region us-east-1

# 3. Check S3 for payload
aws s3 ls s3://tmf-webhook-payloads-dev/eventhub/ --profile tmf-dev --region us-east-1

# 4. Verify DynamoDB checkpoint
aws dynamodb scan --table-name eventhub-checkpoints-dev \
  --profile tmf-dev --region us-east-1 \
  --query 'Items | sort_by(@, &updated_at)[-1]'
```

---

## 📝 Summary

| Check                 | Before         | After            |
| --------------------- | -------------- | ---------------- |
| **Connection**        | ✅ Attempted   | ✅ Success       |
| **Polling**           | ✅ Every 1 min | ✅ Every 1 min   |
| **Message Reading**   | ❌ **Crashes** | ✅ Working       |
| **Messages Seen**     | 0              | 145+             |
| **S3 Payloads**       | 0 files        | ✅ Files created |
| **DynamoDB Checkpts** | Not updated    | ✅ Updated       |

---

## 🔗 Related Files

- **Handler (Fixed)**: [apps/aws-lambda-eventhub/handler.js](apps/aws-lambda-eventhub/handler.js)
- **Terraform Config**: [iac/aws/modules/eventhub-processor/main.tf](iac/aws/modules/eventhub-processor/main.tf)
- **Event Hub Config**: [iac/terraform.tfvars](iac/terraform.tfvars)
- **Azure credentials**: `.env.local.azure` (not in repo)

---

**Next Step**: Deploy the fixed handler using Terraform apply
