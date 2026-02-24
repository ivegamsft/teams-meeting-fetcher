# E2E Test Runbook — Teams Meeting Fetcher

> **If it's not documented, it doesn't exist.** This runbook is your operational bible for running end-to-end tests. Follow it step-by-step and report outcomes in your session notes.

---

## 1. Overview

The Teams Meeting Fetcher has **3 distinct E2E test scenarios**, all requiring **human participation in a live Teams meeting**. Automated tests cannot record meetings or generate transcripts — you must be present.

### Why Human-in-the-Loop?

- Graph API **only returns transcripts after a meeting ends** and has at least 30+ seconds of audio
- Recording and transcription require **actual Teams meeting events** that only humans can trigger
- Each scenario exercises a **different ingestion path** from Teams to data storage

### Scenario Overview

| **Scenario** | **Flow** | **Infrastructure** | **Location** | **Est. Time** | **Test File** |
|---|---|---|---|---|---|
| **1. Teams Bot** | Teams → Bot Framework → Graph API → S3 + DynamoDB | AWS Lambda, DynamoDB, S3, Teams Bot | `scenarios/lambda/meeting-bot/` | 30-40 min | TBD |
| **2. Event Hub** | Teams → Graph Subscription → Azure Event Hub → AWS Lambda → DynamoDB | Azure Event Hub, AWS Lambda, DynamoDB | `scenarios/nobots-eventhub/` | 25-35 min | `test-scripts/test-complete-flow.ps1` |
| **3. Direct Graph** | Teams → Graph Subscription → API Gateway → Lambda → S3 | AWS API Gateway, Lambda, S3 | `scenarios/nobots/` | 30-40 min | TBD |

### Time Commitment

- **Per scenario:** 25-40 minutes
- **All 3 scenarios:** 75-120 minutes
- **Including troubleshooting:** Plan 2-3 hours total

---

## 2. Prerequisites (All Scenarios)

### 2.1 Required Tools

Verify you have these installed:

```powershell
# PowerShell (Windows) or Bash (Mac/Linux)
$PSVersionTable.PSVersion  # Should be 5.1 or 7.x

# Node.js and npm
node --version             # Should be v18+ or v20+
npm --version              # Should be v9+

# AWS CLI
aws --version              # Should be v2+
aws sts get-caller-identity --profile tmf-dev  # Verify credentials work

# Azure CLI (for Event Hub scenario)
az --version               # Should be v2.50+
az account show            # Verify logged in

# Git
git --version              # Should be v2.30+
```

### 2.2 Azure AD App Registration

You need an **Azure AD application registration** with Graph API permissions.

**Verify:**

```powershell
# Check app registration exists
az ad app list --filter "displayName eq 'Teams Meeting Fetcher'" --query '[0].appId' -o tsv

# Verify it has required permissions (delegated + application scopes):
# - Calendars.Read (user)
# - Calendars.ReadWrite (user)
# - OnlineMeetings.Read (application)
# - Recordings.Read.All (application)
```

**If not present, register one:**

```powershell
# Create app registration (macOS/Linux add `--output json`)
az ad app create --display-name "Teams Meeting Fetcher" --native-app

# Copy the App ID from output, then add permissions via Azure Portal:
# API Permissions → Add a permission → Microsoft Graph
# Add: Calendars.Read, Calendars.ReadWrite, OnlineMeetings.Read, Recordings.Read.All
```

### 2.3 Environment Variables

Create `.env.test` in the repo root with these variables:

```bash
# Azure AD / Graph API
GRAPH_TENANT_ID=<your-azure-tenant-id>
GRAPH_CLIENT_ID=<your-app-registration-client-id>
GRAPH_CLIENT_SECRET=<your-app-registration-client-secret>

# AWS Configuration
AWS_PROFILE=tmf-dev
AWS_REGION=us-east-1

# Test User
TEST_USER_EMAIL=<your-email@company.com>

# Scenario-Specific (see below)
# EventHub scenario
EVENTHUB_CONNECTION_STRING=<connection-string>
EVENTHUB_NAME=<hub-name>

# Direct Graph scenario
BUCKET_NAME=tmf-webhook-payloads-dev
CLIENT_STATE=<unique-client-state-value>
WEBHOOK_URL=<your-api-gateway-url>/dev/graph
```

**Template:**

```bash
# Copy to .env.test and fill in values
cp .env.example .env.test
# Edit .env.test with your credentials
```

### 2.4 Verify Prerequisites

Run this pre-flight checklist:

```powershell
# ============================================================================
# PRE-FLIGHT CHECKLIST
# ============================================================================

Write-Host "🔍 Checking prerequisites..." -ForegroundColor Cyan

# 1. Load environment
if (Test-Path ".env.test") {
    Get-Content ".env.test" | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        }
    }
    Write-Host "✅ .env.test loaded" -ForegroundColor Green
} else {
    Write-Host "❌ .env.test not found" -ForegroundColor Red
    exit 1
}

# 2. Verify AWS credentials
try {
    $identity = aws sts get-caller-identity --profile tmf-dev --output json | ConvertFrom-Json
    Write-Host "✅ AWS credentials valid: $($identity.Arn)" -ForegroundColor Green
} catch {
    Write-Host "❌ AWS credentials failed: $_" -ForegroundColor Red
    exit 1
}

# 3. Verify Azure/Graph credentials
try {
    $tokenUrl = "https://login.microsoftonline.com/$env:GRAPH_TENANT_ID/oauth2/v2.0/token"
    $tokenBody = @{
        client_id = $env:GRAPH_CLIENT_ID
        client_secret = $env:GRAPH_CLIENT_SECRET
        scope = "https://graph.microsoft.com/.default"
        grant_type = "client_credentials"
    }
    $token = Invoke-RestMethod -Method Post -Uri $tokenUrl -Body $tokenBody -ContentType "application/x-www-form-urlencoded"
    Write-Host "✅ Graph API token acquired" -ForegroundColor Green
} catch {
    Write-Host "❌ Graph API auth failed: $_" -ForegroundColor Red
    exit 1
}

# 4. Verify Node.js and npm
$nodeVersion = node --version
Write-Host "✅ Node.js $nodeVersion installed" -ForegroundColor Green

# 5. Verify CLI tools
git --version | Out-Null
Write-Host "✅ Git installed" -ForegroundColor Green

Write-Host "`n✅ All prerequisites met. Ready for E2E testing!" -ForegroundColor Green
```

---

## 3. Scenario 1: Teams Bot E2E

**What it tests:** Teams Bot Framework → Graph API → Lambda → S3 + DynamoDB

**Location:** `scenarios/lambda/meeting-bot/`

**Time:** 30-40 minutes

### 3.1 Prerequisites Specific to Teams Bot

Before starting, verify:

```powershell
# 1. Lambda function exists
aws lambda get-function `
  --function-name meeting-bot-dev `
  --profile tmf-dev `
  --region us-east-1

# Expected: Returns function configuration

# 2. DynamoDB table exists
aws dynamodb describe-table `
  --table-name meeting-bot-sessions-dev `
  --profile tmf-dev `
  --region us-east-1

# Expected: Returns table description with "TableStatus": "ACTIVE"

# 3. S3 bucket exists
aws s3 ls s3://tmf-meeting-transcripts-dev/ --profile tmf-dev

# Expected: Lists bucket contents (even if empty)

# 4. Bot is registered in Teams
# Check in Teams Admin Center:
# - Apps → Manage apps → Search "Meeting Fetcher"
# - Should show bot app ID and status

# 5. Bot app is installed in your test team/meeting
# In Teams client:
# - Settings → Apps → Meeting apps → "Meeting Fetcher" should be installed
```

### 3.2 Pre-Flight Checklist

Run automated pre-flight checks:

```powershell
# Start from repo root
cd test

# Install dependencies (if needed)
npm install --save-dev jest @types/jest

# Run pre-flight tests (when available)
npx jest test/e2e/aws/teams-bot-preflight.test.js --verbose

# OR manually verify each component:

$profile = "tmf-dev"
$region = "us-east-1"

# Check Lambda
Write-Host "Checking Lambda..." -ForegroundColor Yellow
aws lambda get-function --function-name meeting-bot-dev --profile $profile --region $region | Out-Null
if ($?) { Write-Host "✅ Lambda ready" -ForegroundColor Green } else { Write-Host "❌ Lambda not found" -ForegroundColor Red; exit 1 }

# Check DynamoDB
Write-Host "Checking DynamoDB..." -ForegroundColor Yellow
aws dynamodb describe-table --table-name meeting-bot-sessions-dev --profile $profile --region $region | Out-Null
if ($?) { Write-Host "✅ DynamoDB ready" -ForegroundColor Green } else { Write-Host "❌ DynamoDB table not found" -ForegroundColor Red; exit 1 }

# Check S3
Write-Host "Checking S3..." -ForegroundColor Yellow
aws s3 ls s3://tmf-meeting-transcripts-dev/ --profile $profile | Out-Null
if ($?) { Write-Host "✅ S3 bucket ready" -ForegroundColor Green } else { Write-Host "❌ S3 bucket not found" -ForegroundColor Red; exit 1 }

Write-Host "`n✅ All infrastructure ready for Scenario 1" -ForegroundColor Green
```

### 3.3 Step-by-Step Test Flow

#### **STEP 1: Configure Environment (2 min)**

```powershell
# Load .env.test
$envFile = ".env.test"
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}

Write-Host "✅ Environment configured" -ForegroundColor Green
```

#### **STEP 2: Start Monitoring (open in SEPARATE terminal)**

```powershell
# Terminal 1: Lambda Logs
# Continuously stream CloudWatch logs
aws logs tail /aws/lambda/meeting-bot-dev `
  --follow `
  --profile tmf-dev `
  --region us-east-1 `
  --format short

# Terminal 2: Monitor DynamoDB (run separately)
# Every 5 seconds, check for new session records
while ($true) {
    Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Checking DynamoDB..." -ForegroundColor Cyan
    
    aws dynamodb scan `
      --table-name meeting-bot-sessions-dev `
      --profile tmf-dev `
      --region us-east-1 `
      --output table
    
    Start-Sleep -Seconds 5
}

# Terminal 3: Monitor S3 (run separately)
# Every 10 seconds, list new transcript files
while ($true) {
    Write-Host "`n[$(Get-Date -Format 'HH:mm:ss')] Checking S3..." -ForegroundColor Cyan
    
    aws s3 ls s3://tmf-meeting-transcripts-dev/ `
      --recursive `
      --human-readable `
      --summarize `
      --profile tmf-dev
    
    Start-Sleep -Seconds 10
}
```

#### **STEP 3: Human Action - Start Teams Meeting (5-15 min)**

⚠️ **You must be present in the meeting:**

1. **Open Teams** and create a new meeting or join an existing one
2. **Speak for at least 30 seconds** (the meeting must have audio to generate a transcript)
3. **Keep the meeting open** while you monitor data flow
4. **Take note of:**
   - Meeting ID
   - Start time
   - Attendee email addresses

#### **STEP 4: Trigger Bot Notification**

The bot should receive `meetingStart` and `meetingEnd` events automatically when you join/leave. Verify in Lambda logs:

```
✅ meetingStart event received: {meetingId: "xxx", organizer: "user@company.com"}
✅ Bot is processing transcript request...
```

#### **STEP 5: Wait for Transcript (5-10 min)**

⚠️ **This is the longest wait. Microsoft can take 2-10 minutes to generate a transcript after a meeting ends.**

Monitor the logs in Terminal 1:

```
✅ Transcript received from Graph API
✅ Uploading to S3: s3://tmf-meeting-transcripts-dev/meetingid/transcript.json
✅ Session record updated in DynamoDB
```

Check Terminal 2 (DynamoDB) and Terminal 3 (S3) for new data appearing.

#### **STEP 6: Validation - Verify Data Flow**

```powershell
# 1. Verify DynamoDB session record
Write-Host "`n📋 Checking DynamoDB for session record..." -ForegroundColor Yellow

$sessions = aws dynamodb scan `
  --table-name meeting-bot-sessions-dev `
  --profile tmf-dev `
  --region us-east-1 `
  --output json | ConvertFrom-Json

$latestSession = $sessions.Items | Sort-Object { [datetime]$_.createdAt.S } | Select-Object -Last 1

if ($latestSession) {
    Write-Host "✅ Session found:" -ForegroundColor Green
    Write-Host "  Meeting ID: $($latestSession.meetingId.S)" -ForegroundColor Green
    Write-Host "  Status: $($latestSession.status.S)" -ForegroundColor Green
    Write-Host "  Transcript URL: $($latestSession.transcriptUrl.S)" -ForegroundColor Green
} else {
    Write-Host "❌ No session found in DynamoDB" -ForegroundColor Red
}

# 2. Verify S3 transcript file
Write-Host "`n📋 Checking S3 for transcript..." -ForegroundColor Yellow

$transcripts = aws s3 ls s3://tmf-meeting-transcripts-dev/ `
  --recursive `
  --profile tmf-dev | Where-Object { $_ -match "\.json$" }

if ($transcripts) {
    Write-Host "✅ Transcript file(s) found:" -ForegroundColor Green
    $transcripts | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }
    
    # Download latest and verify content
    $latestFile = $transcripts[-1].Split(' ')[-1]
    aws s3 cp "s3://tmf-meeting-transcripts-dev/$latestFile" ./transcript.json --profile tmf-dev
    
    $content = Get-Content ./transcript.json | ConvertFrom-Json
    Write-Host "  Content preview:" -ForegroundColor Green
    Write-Host "    Transcript has $($content.body.Length) characters" -ForegroundColor Green
    
    if ($content.body -match "[a-zA-Z]") {
        Write-Host "  ✅ Transcript contains spoken text!" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Transcript appears empty" -ForegroundColor Red
    }
    
    Remove-Item ./transcript.json
} else {
    Write-Host "❌ No transcript files found in S3" -ForegroundColor Red
}

# 3. Check Lambda execution logs
Write-Host "`n📋 Checking Lambda logs..." -ForegroundColor Yellow
aws logs get-log-events `
  --log-group-name /aws/lambda/meeting-bot-dev `
  --log-stream-name "" `  # Latest stream
  --start-time $((Get-Date).AddMinutes(-15).Ticks) `
  --profile tmf-dev `
  --region us-east-1 | Select-Object -Last 20
```

### 3.4 Expected Outcomes

✅ **Success** if you see:

- [ ] DynamoDB contains a session record with meeting ID
- [ ] S3 contains a transcript JSON file with content
- [ ] Lambda logs show "✅ Success" messages
- [ ] Transcript text contains words you spoke

❌ **Failure** if:

- [ ] DynamoDB is empty after 10 minutes
- [ ] S3 bucket is empty
- [ ] Lambda errors in logs
- [ ] Transcript is empty or contains no text

### 3.5 Troubleshooting

#### **Problem: No session in DynamoDB after 10 minutes**

```powershell
# 1. Check if bot received the event
aws logs tail /aws/lambda/meeting-bot-dev --follow --profile tmf-dev --region us-east-1 | Select-String "meetingStart"

# Expected: At least one line with "meetingStart"
# If empty: Bot may not be installed in your test meeting. Reinstall in Teams.

# 2. Check if bot is properly registered
aws apigateway get-stage --rest-api-id <API_ID> --stage-name prod --profile tmf-dev

# Expected: Stage exists and is deployed
# If error: Re-deploy Lambda function

# 3. Check DynamoDB is writable
aws dynamodb put-item --table-name meeting-bot-sessions-dev --item '{
  "meetingId": {"S": "test-123"},
  "status": {"S": "test"}
}' --profile tmf-dev

# Expected: Command succeeds silently
# If error: Check IAM role permissions on Lambda
```

#### **Problem: S3 has session but no transcript**

```powershell
# 1. Check if Lambda is calling Graph API for transcript
aws logs tail /aws/lambda/meeting-bot-dev --follow --profile tmf-dev --region us-east-1 | Select-String "transcript"

# Expected: At least one line with "transcript" or "getCallRecordings"
# If empty: Lambda may not have Graph API credentials

# 2. Verify Graph API permissions
az ad app show --id $env:GRAPH_CLIENT_ID --query "requiredResourceAccess[].resourceAppId"

# Expected: Includes "00000003-0000-0000-c000-000000000000" (Microsoft Graph)

# 3. Test Graph API directly
$tokenUrl = "https://login.microsoftonline.com/$env:GRAPH_TENANT_ID/oauth2/v2.0/token"
$token = Invoke-RestMethod -Method Post -Uri $tokenUrl -Body @{
    client_id = $env:GRAPH_CLIENT_ID
    client_secret = $env:GRAPH_CLIENT_SECRET
    scope = "https://graph.microsoft.com/.default"
    grant_type = "client_credentials"
}

# Try to list a meeting
$meetingId = "YOUR_MEETING_ID"
$headers = @{ Authorization = "Bearer $($token.access_token)" }
Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/me/onlineMeetings/$meetingId" -Headers $headers
```

#### **Problem: Transcript is empty or has no text**

This is normal if:
- Meeting had less than 30 seconds of audio
- No one spoke during the meeting
- Wait another 5 minutes (Microsoft can take longer)

**Solution:** Repeat the meeting with more than 30 seconds of speaking time.

---

## 4. Scenario 2: Event Hub E2E

**What it tests:** Teams → Graph Subscription → Azure Event Hub → AWS Lambda → DynamoDB

**Location:** `scenarios/nobots-eventhub/`

**Time:** 25-35 minutes

**Prerequisite Script:** Uses existing `test-scripts/test-complete-flow.ps1`

### 4.1 Prerequisites Specific to Event Hub

```powershell
# 1. Event Hub exists
az eventhub namespace show `
  --name tmf-ehns-eus-<suffix> `
  --resource-group tmf-rg-eus-<suffix> `
  --query 'provisioningState'

# Expected: "Succeeded"

# 2. Graph subscription exists for calendar events
cd scenarios/nobots-eventhub/config
cat subscriptions.json
# Should show an entry for "users/<email>/events"

# 3. Lambda function exists
aws lambda get-function `
  --function-name tmf-eventhub-processor-dev `
  --profile tmf-dev `
  --region us-east-1

# Expected: Returns function configuration

# 4. DynamoDB checkpoints table exists
aws dynamodb describe-table `
  --table-name eventhub-checkpoints `
  --profile tmf-dev `
  --region us-east-1

# Expected: Returns table description
```

### 4.2 Using the Automated Script

The fastest way to run Scenario 2:

```powershell
# From repo root
cd test-scripts

# Run the complete automated test
.\test-complete-flow.ps1

# This will:
# 1. Load environment from .env.local.azure
# 2. Create a test meeting via Graph API
# 3. Monitor EventHub for 5 minutes
# 4. Check Lambda processing
# 5. Verify DynamoDB records
# 6. Print detailed report
```

### 4.3 Step-by-Step Manual Flow

If you want to understand each step:

#### **STEP 1: Load Environment**

```powershell
$envFile = ".env.local.azure"
if (-not (Test-Path $envFile)) {
    Write-Host "❌ .env.local.azure not found. Create it with Azure credentials:" -ForegroundColor Red
    Write-Host "  GRAPH_TENANT_ID=..." -ForegroundColor Yellow
    Write-Host "  GRAPH_CLIENT_ID=..." -ForegroundColor Yellow
    Write-Host "  GRAPH_CLIENT_SECRET=..." -ForegroundColor Yellow
    Write-Host "  TEST_USER_EMAIL=..." -ForegroundColor Yellow
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}

Write-Host "✅ Environment loaded from .env.local.azure" -ForegroundColor Green
```

#### **STEP 2: Verify EventHub Connection**

```powershell
# Test connection to EventHub
$ehName = $env:EVENTHUB_NAME
$ehConnStr = $env:EVENTHUB_CONNECTION_STRING

Write-Host "Testing EventHub connection..." -ForegroundColor Yellow

try {
    # List messages from EventHub (requires Azure CLI)
    az eventhub eventhub message peek `
      --resource-group tmf-rg-eus-<suffix> `
      --namespace-name tmf-ehns-eus-<suffix> `
      --name $ehName | Out-Null
    
    Write-Host "✅ EventHub is accessible" -ForegroundColor Green
} catch {
    Write-Host "⚠️ EventHub connection test skipped (requires specific Azure permissions)" -ForegroundColor Yellow
}
```

#### **STEP 3: Create Test Meeting**

```powershell
# Get Graph API token
$tokenUrl = "https://login.microsoftonline.com/$env:GRAPH_TENANT_ID/oauth2/v2.0/token"
$tokenBody = @{
    client_id = $env:GRAPH_CLIENT_ID
    client_secret = $env:GRAPH_CLIENT_SECRET
    scope = "https://graph.microsoft.com/.default"
    grant_type = "client_credentials"
}

try {
    $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenUrl -Body $tokenBody -ContentType "application/x-www-form-urlencoded"
    $accessToken = $tokenResponse.access_token
    Write-Host "✅ Access token acquired" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get token: $_" -ForegroundColor Red
    exit 1
}

# Create a meeting
$headers = @{ Authorization = "Bearer $accessToken" }
$meetingBody = @{
    subject = "E2E Test Meeting - $(Get-Date -Format 'HH:mm:ss')"
    startDateTime = (Get-Date).AddMinutes(5).ToString("yyyy-MM-ddTHH:mm:ss")
    endDateTime = (Get-Date).AddMinutes(35).ToString("yyyy-MM-ddTHH:mm:ss")
    onlineMeeting = @{
        conferenceId = $null
    }
} | ConvertTo-Json

try {
    $meeting = Invoke-RestMethod `
      -Uri "https://graph.microsoft.com/v1.0/users/$env:TEST_USER_EMAIL/events" `
      -Method Post `
      -Headers $headers `
      -Body $meetingBody `
      -ContentType "application/json"
    
    Write-Host "✅ Meeting created: $($meeting.subject)" -ForegroundColor Green
    Write-Host "  Start: $($meeting.start.dateTime)" -ForegroundColor Green
    
    $meetingId = $meeting.id
} catch {
    Write-Host "❌ Failed to create meeting: $_" -ForegroundColor Red
    exit 1
}
```

#### **STEP 4: Monitor EventHub (5 minutes)**

```powershell
# This waits for the Graph subscription to deliver the calendar event to EventHub
Write-Host "`n⏳ Waiting for Event Hub to receive calendar event (up to 5 minutes)..." -ForegroundColor Cyan
Write-Host "   Hint: Go to Teams and RSVP to the meeting to trigger the subscription" -ForegroundColor Yellow

$startTime = Get-Date
$timeout = 5 * 60  # 5 minutes in seconds

while ($true) {
    $elapsed = (Get-Date) - $startTime
    
    # Check EventHub for messages
    # (Requires custom monitoring setup - see detailed EventHub docs)
    
    if ($elapsed.TotalSeconds -gt $timeout) {
        Write-Host "⏱️ 5 minutes elapsed. Moving to validation." -ForegroundColor Yellow
        break
    }
    
    Start-Sleep -Seconds 10
}

Write-Host "✅ Monitoring period complete" -ForegroundColor Green
```

#### **STEP 5: Verify Lambda Processing**

```powershell
# Check CloudWatch logs for Lambda
Write-Host "`n📋 Checking Lambda logs..." -ForegroundColor Yellow

aws logs tail /aws/lambda/tmf-eventhub-processor-dev `
  --follow `
  --profile tmf-dev `
  --region us-east-1 `
  --format short `
  --max-items 100 `
  | Select-String "EVENTHUB\|ERROR\|success"

Write-Host "✅ Lambda processing verified in logs" -ForegroundColor Green
```

#### **STEP 6: Verify DynamoDB Checkpoints**

```powershell
# Scan checkpoints table
Write-Host "`n📋 Checking DynamoDB for processing checkpoints..." -ForegroundColor Yellow

$checkpoints = aws dynamodb scan `
  --table-name eventhub-checkpoints `
  --profile tmf-dev `
  --region us-east-1 `
  --output json | ConvertFrom-Json

if ($checkpoints.Items.Count -gt 0) {
    Write-Host "✅ Found $($checkpoints.Items.Count) checkpoint(s):" -ForegroundColor Green
    
    $checkpoints.Items | ForEach-Object {
        Write-Host "  - Offset: $($_.offset.N)" -ForegroundColor Green
        Write-Host "    Sequence: $($_.sequenceNumber.N)" -ForegroundColor Green
        Write-Host "    Timestamp: $($_.timestamp.S)" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️ No checkpoints found (may be normal if Lambda hasn't processed yet)" -ForegroundColor Yellow
}
```

### 4.4 Expected Outcomes

✅ **Success** if you see:

- [ ] Meeting created via Graph API
- [ ] EventHub receives calendar update within 5 minutes
- [ ] Lambda logs show "processing" messages
- [ ] DynamoDB contains checkpoint records

❌ **Failure** if:

- [ ] Meeting creation fails (Graph API error)
- [ ] EventHub shows no activity after 10 minutes
- [ ] Lambda logs are empty or show errors
- [ ] DynamoDB remains empty

### 4.5 Troubleshooting

#### **Problem: EventHub not receiving notifications**

```powershell
# 1. Verify subscription exists
cd scenarios/nobots-eventhub
python config/list-subscriptions.py

# Expected: Shows at least one entry for calendar events

# 2. Create subscription if missing
python config/create-subscription.py

# 3. Verify subscription is active
python config/check-subscription.py
```

#### **Problem: Lambda not processing messages**

```powershell
# 1. Check Lambda function exists and is up to date
aws lambda get-function `
  --function-name tmf-eventhub-processor-dev `
  --profile tmf-dev `
  --region us-east-1

# 2. Check Lambda execution role has EventHub read permissions
aws iam get-role-policy `
  --role-name tmf-eventhub-processor-role-dev `
  --policy-name EventHubRead `
  --profile tmf-dev

# Expected: Policy allows "eventhubs:ListEventHubs", "eventhubs:GetEventHub", "eventhubs:GetPartitionProperties"

# 3. Check EventHub connection string is correct in Lambda environment
aws lambda get-function-configuration `
  --function-name tmf-eventhub-processor-dev `
  --profile tmf-dev `
  --region us-east-1 | Select-Object -Property Environment
```

#### **Problem: Checkpoints table not updating**

```powershell
# 1. Verify DynamoDB table has write permissions
aws dynamodb put-item `
  --table-name eventhub-checkpoints `
  --item '{
    "partitionKey": {"S": "test-123"},
    "offset": {"N": "0"}
  }' `
  --profile tmf-dev

# If this works, Lambda role has permissions

# 2. Check if Lambda is even running
aws lambda invoke `
  --function-name tmf-eventhub-processor-dev `
  --profile tmf-dev `
  --payload '{"test": "true"}' `
  ./lambda-response.json

cat ./lambda-response.json
```

---

## 5. Scenario 3: Direct Graph API E2E

**What it tests:** Teams → Graph Subscription → API Gateway Webhook → Lambda → S3

**Location:** `scenarios/nobots/`

**Time:** 30-40 minutes

### 5.1 Prerequisites Specific to Direct Graph

```powershell
# 1. API Gateway webhook endpoint exists
$webhookUrl = $env:WEBHOOK_URL
Write-Host "Testing webhook endpoint: $webhookUrl"

try {
    Invoke-WebRequest -Uri $webhookUrl -Method Options -ErrorAction Stop | Out-Null
    Write-Host "✅ Webhook endpoint is accessible" -ForegroundColor Green
} catch {
    Write-Host "❌ Webhook endpoint not accessible: $_" -ForegroundColor Red
    Write-Host "   Expected at: $webhookUrl" -ForegroundColor Yellow
}

# 2. Lambda function exists
aws lambda get-function `
  --function-name tmf-webhook-writer-dev `
  --profile tmf-dev `
  --region us-east-1

# Expected: Returns function configuration

# 3. S3 bucket for payloads exists
aws s3 ls s3://$env:BUCKET_NAME/ --profile tmf-dev

# Expected: Lists bucket (may be empty)

# 4. Graph subscription for calendar events exists
cd scenarios/nobots
node config.js  # Or: cat data/subscriptions.json
```

### 5.2 Step-by-Step Test Flow

#### **STEP 1: Create/Verify Graph Subscription**

```powershell
cd scenarios/nobots

# Create a calendar event subscription pointing to your webhook
node 1-subscribe.js

# Expected output:
# ✅ Subscription created
# Subscription ID: <sub-id>
# Resource: users/<email>/events
# Notification URL: <your-webhook-url>
# Expiration: <future-date>
```

#### **STEP 2: Start Monitoring Lambda Logs**

Open in a separate terminal:

```powershell
aws logs tail /aws/lambda/tmf-webhook-writer-dev `
  --follow `
  --profile tmf-dev `
  --region us-east-1 `
  --format short
```

#### **STEP 3: Create Test Meeting**

```powershell
cd scenarios/nobots

# Option A: Automatic meeting creation
node demo.js create-meeting

# Expected: Returns meeting URL and event ID

# Option B: Manual Teams meeting
# Just start a Teams meeting and update the subscription
# (Calendar event change triggers notification within seconds)
```

#### **STEP 4: Verify Webhook Received Notification**

Look at Lambda logs (Terminal from STEP 2):

```
✅ Webhook received POST
✅ Payload: {...}
✅ Stored to S3: s3://tmf-webhook-payloads-dev/202401021430_webhook.json
```

#### **STEP 5: Validate S3 Storage**

```powershell
# List recently stored payloads
aws s3 ls s3://$env:BUCKET_NAME/ `
  --recursive `
  --human-readable `
  --summarize `
  --profile tmf-dev

# Expected: Shows JSON files with recent timestamps

# Download and verify one
$latestKey = aws s3 ls s3://$env:BUCKET_NAME/ --recursive --profile tmf-dev | Sort-Object -Property @{Expression={$_[0..9] -join ''}} | Select-Object -Last 1 | ForEach-Object { $_.Split()[-1] }

aws s3 cp s3://$env:BUCKET_NAME/$latestKey ./webhook-payload.json --profile tmf-dev

# Verify it's valid JSON
$payload = Get-Content ./webhook-payload.json | ConvertFrom-Json
Write-Host "✅ Payload is valid JSON with $($payload.value.Count) notification(s)" -ForegroundColor Green

Remove-Item ./webhook-payload.json
```

#### **STEP 6: Get Transcript**

```powershell
cd scenarios/nobots

# After meeting ends and Lambda has processed:
node 4-get-transcript.js

# Expected: Downloads and displays transcript content
```

### 5.3 Expected Outcomes

✅ **Success** if you see:

- [ ] Graph subscription created successfully
- [ ] Webhook endpoint receives POST from Graph API (in Lambda logs)
- [ ] S3 contains webhook payload files
- [ ] Transcript is retrieved and contains spoken text

❌ **Failure** if:

- [ ] Subscription creation fails
- [ ] Lambda logs show no webhook invocations
- [ ] S3 bucket remains empty
- [ ] Transcript retrieval fails

### 5.4 Troubleshooting

#### **Problem: Graph subscription won't create**

```powershell
cd scenarios/nobots

# 1. Check credentials
node config.js

# Expected: Shows Graph API token acquired, test user email verified

# 2. Verify app has correct permissions
az ad app show --id $env:GRAPH_CLIENT_ID --query "requiredResourceAccess"

# Expected: Includes OnlineMeetings.Read, Recordings.Read.All

# 3. Check subscription target email is correct
# In config.js, verify $env:TEST_USER_EMAIL matches your test user
```

#### **Problem: Webhook never receives notifications**

```powershell
# 1. Verify webhook URL is public and accessible
curl -X GET $env:WEBHOOK_URL

# Expected: Should return something (even a 404 is OK if it's from your Lambda)

# 2. Check webhook secret (CLIENT_STATE) matches
# In API Gateway, verify validation token handling:
$webhookUrl = $env:WEBHOOK_URL
$clientState = $env:CLIENT_STATE

Invoke-WebRequest -Uri "$webhookUrl?validationToken=test123&clientState=$clientState" -Method Get

# Expected: Returns "test123" if validation works

# 3. Check Lambda is deployed and has API Gateway trigger
aws apigateway get-integration `
  --rest-api-id <API_ID> `
  --resource-id <RESOURCE_ID> `
  --http-method POST `
  --profile tmf-dev

# Expected: Shows Lambda function as integration
```

#### **Problem: Transcript is empty**

Same as Scenario 1 — waiting for Microsoft to generate it can take 2-10 minutes. Ensure the meeting had 30+ seconds of audio.

---

## 6. Running All E2E Tests

### 6.1 Sequential Execution (Recommended for Beginners)

Run one scenario at a time to understand the flow:

```powershell
# Run Scenario 1 first (simplest)
# Follow section 3: Teams Bot E2E

# Once passing, run Scenario 2
# Follow section 4: Event Hub E2E

# Finally run Scenario 3 (most complex setup)
# Follow section 5: Direct Graph API E2E
```

### 6.2 Parallel Execution (Advanced)

If you have multiple test instances/environments, you can run scenarios in parallel:

```powershell
# Terminal 1: Scenario 1
.\test\e2e\run-scenario.ps1 -Scenario "teams-bot"

# Terminal 2: Scenario 2
.\test\e2e\run-scenario.ps1 -Scenario "eventhub"

# Terminal 3: Scenario 3
.\test\e2e\run-scenario.ps1 -Scenario "direct-graph"

# Wait for all to complete, then collect results
```

### 6.3 Jest-Based Execution (When Available)

Once E2E test suite is built:

```bash
# Run all E2E tests
npx jest test/e2e/ --verbose

# Run specific scenario
npx jest test/e2e/aws/teams-bot-e2e.test.js

# Run with coverage
npx jest test/e2e/ --coverage --coveragePathIgnorePatterns='node_modules'

# Run in watch mode (for development)
npx jest test/e2e/ --watch
```

### 6.4 CI/CD Considerations

**These tests require human participation and cannot run unattended in CI/CD.** However, you can:

1. **Trigger manually** from GitHub Actions workflow dispatch
2. **Run on schedule** (e.g., weekly) with manual approval
3. **Create semi-automated versions** that set up infrastructure but pause for human action

Example workflow:

```yaml
# .github/workflows/e2e-manual.yml
name: E2E Tests (Manual)
on:
  workflow_dispatch:
    inputs:
      scenario:
        description: 'Scenario to test'
        required: true
        default: 'all'
        type: choice
        options:
          - all
          - teams-bot
          - eventhub
          - direct-graph

jobs:
  e2e-test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run E2E test
        env:
          GRAPH_TENANT_ID: ${{ secrets.GRAPH_TENANT_ID }}
          GRAPH_CLIENT_ID: ${{ secrets.GRAPH_CLIENT_ID }}
          GRAPH_CLIENT_SECRET: ${{ secrets.GRAPH_CLIENT_SECRET }}
          AWS_PROFILE: tmf-dev
        run: |
          .\test\e2e\run-scenario.ps1 -Scenario "${{ github.event.inputs.scenario }}"
```

---

## 7. Troubleshooting Common Issues

### 7.1 Graph API Token Acquisition Fails

**Symptom:**
```
❌ Failed to get token: The OAuth token endpoint returned an error
```

**Solution:**

```powershell
# 1. Verify credentials in .env.test
Write-Host "Checking credentials..." -ForegroundColor Yellow
Write-Host "  GRAPH_TENANT_ID: $env:GRAPH_TENANT_ID" -ForegroundColor Cyan
Write-Host "  GRAPH_CLIENT_ID: $env:GRAPH_CLIENT_ID" -ForegroundColor Cyan
Write-Host "  GRAPH_CLIENT_SECRET: [hidden]" -ForegroundColor Cyan

# 2. Verify app registration exists
az ad app list --filter "appId eq '$env:GRAPH_CLIENT_ID'" --query '[0].displayName'

# Expected: Returns "Teams Meeting Fetcher" or similar

# 3. Verify client secret hasn't expired
az ad app credential list --id $env:GRAPH_CLIENT_ID --query '[0].endDateTime'

# If expired, create new credential:
az ad app credential reset --id $env:GRAPH_CLIENT_ID --append
```

### 7.2 AWS Credentials Invalid

**Symptom:**
```
❌ AWS credentials failed: Unable to locate credentials
```

**Solution:**

```powershell
# 1. Verify AWS CLI is configured
aws configure list --profile tmf-dev

# Expected: Shows AccessKey, SecretKey, Region

# 2. Test credentials
aws sts get-caller-identity --profile tmf-dev

# Expected: Returns your account ID and ARN

# 3. If failing, reconfigure profile
aws configure --profile tmf-dev
# Enter: AWS Access Key ID, Secret Access Key, Region (us-east-1), Output format (json)

# 4. Verify in credentials file
cat ~/.aws/credentials | Select-String "tmf-dev" -Context 0,2
```

### 7.3 Infrastructure Not Deployed

**Symptom:**
```
❌ Lambda function not found / DynamoDB table not found / S3 bucket not found
```

**Solution:**

```powershell
# 1. Check Terraform state
cd infra
terraform state list | Measure-Object -Line

# Expected: Shows 100+ resources for full deployment

# 2. List what's deployed
terraform state list | Select-String "lambda|dynamodb|s3"

# 3. If missing, deploy
terraform plan -out=tfplan
terraform apply tfplan

# 4. Verify specific resource
terraform state show 'aws_lambda_function.meeting_bot_dev'
```

### 7.4 Teams Meeting Not Generating Transcript

**Symptom:**
```
✅ Meeting ended but no transcript after 15 minutes
```

**Solution:**

This is normal! Microsoft can take 5-20 minutes to process transcripts. But verify:

```powershell
# 1. Meeting had audio
# Go back to Teams and check the meeting recording has audio waveform

# 2. Meeting was long enough (30+ seconds)
# Check meeting duration in Teams meeting history

# 3. Transcript feature is enabled
# Check Teams admin policies allow transcription for your org

# 4. Force retry (optional - schedule Lambda)
$meetingId = "YOUR_MEETING_ID"
aws lambda invoke `
  --function-name meeting-bot-dev `
  --payload "{\"meetingId\": \"$meetingId\"}" `
  ./lambda-response.json `
  --profile tmf-dev

cat ./lambda-response.json
```

### 7.5 EventHub Not Receiving Calendar Events

**Symptom:**
```
⏳ Waiting for Event Hub... (timeout after 5 minutes, nothing received)
```

**Solution:**

```powershell
# 1. Verify subscription still exists (subscriptions expire!)
cd scenarios/nobots-eventhub
python config/check-subscription.py

# If expired, renew:
python config/renew-subscription.py

# 2. Verify EventHub is receiving events at all
az eventhub eventhub show `
  --resource-group tmf-rg-eus-<suffix> `
  --namespace-name tmf-ehns-eus-<suffix> `
  --name <hub-name> `
  --query 'createdAt'

# 3. Check if Graph subscription is getting events from Teams
# Make a calendar change (create/update/delete event) and watch:
az monitor metrics list-definitions `
  --resource /subscriptions/<sub-id>/resourceGroups/tmf-rg-eus-<suffix>/providers/Microsoft.EventHub/namespaces/tmf-ehns-eus-<suffix> `
  --query '[0:3].name'
```

### 7.6 Webhook Never Called

**Symptom:**
```
📋 Checking Lambda logs...
(empty - no invocations)
```

**Solution:**

```powershell
# 1. Verify webhook URL is correct in Graph subscription
cd scenarios/nobots
node config.js

# Expected: Shows your webhook URL from env var

# 2. Verify webhook is publicly accessible
$url = $env:WEBHOOK_URL
curl -X OPTIONS $url

# Expected: Returns something (even an error is OK if it's from Lambda)

# 3. Check API Gateway is deployed
aws apigateway get-stage `
  --rest-api-id <REST_API_ID> `
  --stage-name dev `
  --profile tmf-dev

# Expected: Shows stage "dev" with deploymentId

# 4. Manually invoke to test connection
$testPayload = @{
    value = @(
        @{
            resourceData = @{
                id = "test-meeting-id"
            }
        }
    )
} | ConvertTo-Json

curl -X POST $url `
  -Header "Content-Type: application/json" `
  -Data $testPayload

# Expected: Returns 200 OK and Lambda logs show invocation
```

---

## 8. Session Notes Template

After running E2E tests, document your results:

```markdown
# E2E Test Session — [DATE]

## Scenario Tested
- [ ] Scenario 1: Teams Bot
- [ ] Scenario 2: Event Hub
- [ ] Scenario 3: Direct Graph

## Outcome
- [ ] ✅ PASSED
- [ ] ❌ FAILED
- [ ] ⚠️ PARTIAL

### Results

**Scenario 1: Teams Bot**
- DynamoDB session record: ✅ / ❌
- S3 transcript file: ✅ / ❌
- Transcript has content: ✅ / ❌
- Time taken: __ minutes

**Scenario 2: Event Hub**
- EventHub received calendar event: ✅ / ❌
- Lambda processed successfully: ✅ / ❌
- DynamoDB checkpoint created: ✅ / ❌
- Time taken: __ minutes

**Scenario 3: Direct Graph**
- Graph subscription created: ✅ / ❌
- Webhook received notification: ✅ / ❌
- S3 stored payload: ✅ / ❌
- Transcript retrieved: ✅ / ❌
- Time taken: __ minutes

### Issues Encountered
(List any failures and how you resolved them)

### Notes
(Any observations for future test runs)

---

**Next Action:** (What to do with these results)
```

---

## Appendix: Quick Reference

### Environment Checklist

```bash
# Copy and run this in your terminal
echo "=== TEAMS MEETING FETCHER - E2E PREREQUISITES ==="
echo ""
echo "1. Required Tools:"
node --version && echo "  ✅ Node.js" || echo "  ❌ Node.js not found"
aws --version && echo "  ✅ AWS CLI" || echo "  ❌ AWS CLI not found"
az --version && echo "  ✅ Azure CLI" || echo "  ❌ Azure CLI not found"
git --version && echo "  ✅ Git" || echo "  ❌ Git not found"
echo ""
echo "2. AWS Credentials:"
aws sts get-caller-identity --profile tmf-dev && echo "  ✅ AWS" || echo "  ❌ AWS"
echo ""
echo "3. Azure Authentication:"
az account show && echo "  ✅ Azure" || echo "  ❌ Azure"
echo ""
echo "4. Environment File:"
[ -f ".env.test" ] && echo "  ✅ .env.test exists" || echo "  ❌ .env.test missing"
```

### Useful Commands

```powershell
# Get Graph API token
$token = (Invoke-RestMethod -Method Post `
  -Uri "https://login.microsoftonline.com/$env:GRAPH_TENANT_ID/oauth2/v2.0/token" `
  -Body @{
    client_id = $env:GRAPH_CLIENT_ID
    client_secret = $env:GRAPH_CLIENT_SECRET
    scope = "https://graph.microsoft.com/.default"
    grant_type = "client_credentials"
  }).access_token

# Monitor all 3 scenarios simultaneously
# Terminal 1
aws logs tail /aws/lambda/meeting-bot-dev --follow --profile tmf-dev --region us-east-1

# Terminal 2
aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --profile tmf-dev --region us-east-1

# Terminal 3
aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev --region us-east-1

# Scan all DynamoDB tables
aws dynamodb list-tables --profile tmf-dev --region us-east-1

# List all S3 buckets
aws s3 ls --profile tmf-dev
```

### File Locations Reference

| **File** | **Purpose** | **Location** |
|---|---|---|
| **Test Scripts** | Ad-hoc E2E testing | `test-scripts/` |
| **Scenario 1** | Teams Bot implementation | `scenarios/lambda/meeting-bot/` |
| **Scenario 2** | EventHub implementation | `scenarios/nobots-eventhub/` |
| **Scenario 3** | Direct Graph implementation | `scenarios/nobots/` |
| **Environment** | Credentials and config | `.env.test` (create from `.env.example`) |
| **Infrastructure** | Terraform definitions | `infra/` |
| **Lambda Handlers** | AWS Lambda code | `apps/aws-lambda/` |

---

**Last Updated:** 2026-02-24  
**For questions:** See `test/README.md` and `docs/` folder
