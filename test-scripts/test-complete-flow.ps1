#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Complete End-to-End Test for Teams Meeting Fetcher
    
.DESCRIPTION
    Tests the complete flow:
    1. Create a Teams meeting via Graph API
    2. Monitor EventHub for the notification
    3. Check Lambda processing logs
    4. Verify DynamoDB storage (checkpoints and events)
    
.NOTES
    Required: AWS CLI, Azure CLI configured with tmf-dev profile
#>

$ErrorActionPreference = "Stop"

# ============================================================================
# LOAD ENVIRONMENT
# ============================================================================
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         TEAMS MEETING FETCHER - END-TO-END TEST                ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$envFile = "F:\Git\teams-meeting-fetcher\.env.local.azure"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
        }
    }
    Write-Host "✅ Loaded environment from .env.local.azure" -ForegroundColor Green
} else {
    Write-Host "❌ ERROR: .env.local.azure not found" -ForegroundColor Red
    exit 1
}

$tenantId = $env:GRAPH_TENANT_ID
$clientId = $env:GRAPH_CLIENT_ID
$clientSecret = $env:GRAPH_CLIENT_SECRET
$userEmail = "trustingboar@ibuyspy.net"
$resourceGroup = $env:RESOURCE_GROUP
$eventhubNamespace = $env:EVENTHUB_NAMESPACE
$eventhubName = $env:EVENTHUB_NAME

if (-not $tenantId -or -not $clientId -or -not $clientSecret) {
    Write-Host "❌ ERROR: Missing required environment variables" -ForegroundColor Red
    exit 1
}

# AWS Configuration
$awsProfile = "tmf-dev"
$awsRegion = "us-east-1"
$lambdaFunction = "tmf-eventhub-processor-dev"
$dynamoCheckpoints = "eventhub-checkpoints"

# ============================================================================
# STEP 1: CREATE TEST MEETING
# ============================================================================
Write-Host "`n┌────────────────────────────────────────────────────────────────┐" -ForegroundColor Yellow
Write-Host "│ STEP 1: Create Test Meeting via Graph API                     │" -ForegroundColor Yellow
Write-Host "└────────────────────────────────────────────────────────────────┘" -ForegroundColor Yellow

Write-Host "`n📋 Getting Graph API access token..." -ForegroundColor Cyan

$tokenUrl = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token"
$tokenBody = @{
    client_id     = $clientId
    client_secret = $clientSecret
    scope         = "https://graph.microsoft.com/.default"
    grant_type    = "client_credentials"
}

try {
    $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenUrl -Body $tokenBody -ContentType "application/x-www-form-urlencoded"
    $accessToken = $tokenResponse.access_token
    Write-Host "✅ Access token acquired" -ForegroundColor Green
} catch {
    Write-Host "❌ FAILED to get token: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $accessToken"
    "Content-Type"  = "application/json"
}

Write-Host "`n📅 Creating test meeting..." -ForegroundColor Cyan

$startTime = (Get-Date).AddHours(2).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss")
$endTime = (Get-Date).AddHours(3).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss")
$timestamp = Get-Date -Format "HHmmss"

$meetingBody = @{
    subject = "E2E Test Meeting - $timestamp"
    start = @{
        dateTime = $startTime
        timeZone = "UTC"
    }
    end = @{
        dateTime = $endTime
        timeZone = "UTC"
    }
    isOnlineMeeting = $true
    onlineMeetingProvider = "teamsForBusiness"
    attendees = @(
        @{
            emailAddress = @{
                address = $userEmail
                name = "Test User"
            }
            type = "required"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $meetingUrl = "https://graph.microsoft.com/v1.0/users/$userEmail/events"
    $meetingResponse = Invoke-RestMethod -Method Post -Uri $meetingUrl -Headers $headers -Body $meetingBody
    $meetingId = $meetingResponse.id
    $meetingSubject = $meetingResponse.subject
    
    Write-Host "✅ Meeting created successfully!" -ForegroundColor Green
    Write-Host "   📌 Meeting ID: $meetingId" -ForegroundColor Gray
    Write-Host "   📌 Subject: $meetingSubject" -ForegroundColor Gray
    Write-Host "   📌 Start: $startTime UTC" -ForegroundColor Gray
    Write-Host "   📌 User: $userEmail" -ForegroundColor Gray
} catch {
    Write-Host "❌ FAILED to create meeting: $_" -ForegroundColor Red
    exit 1
}

# ============================================================================
# STEP 2: WAIT AND MONITOR EVENTHUB
# ============================================================================
Write-Host "`n┌────────────────────────────────────────────────────────────────┐" -ForegroundColor Yellow
Write-Host "│ STEP 2: Monitor EventHub for Notification                     │" -ForegroundColor Yellow
Write-Host "└────────────────────────────────────────────────────────────────┘" -ForegroundColor Yellow

Write-Host "`n⏳ Waiting 15 seconds for Graph API to send notification to EventHub..." -ForegroundColor Cyan
Start-Sleep -Seconds 15

Write-Host "`n📊 Checking EventHub metrics..." -ForegroundColor Cyan

try {
    # Get EventHub metrics for incoming messages
    $endTimeMetric = Get-Date
    $startTimeMetric = $endTimeMetric.AddMinutes(-5)
    
    $metricsCmd = "az monitor metrics list " +
                  "--resource /subscriptions/$(az account show --query id -o tsv)/resourceGroups/$resourceGroup/providers/Microsoft.EventHub/namespaces/$eventhubNamespace " +
                  "--metric IncomingMessages " +
                  "--start-time $($startTimeMetric.ToString('yyyy-MM-ddTHH:mm:ssZ')) " +
                  "--end-time $($endTimeMetric.ToString('yyyy-MM-ddTHH:mm:ssZ')) " +
                  "--interval PT1M " +
                  "--output json"
    
    $metrics = Invoke-Expression $metricsCmd | ConvertFrom-Json
    
    if ($metrics.value -and $metrics.value[0].timeseries) {
        $totalMessages = ($metrics.value[0].timeseries[0].data | Measure-Object -Property total -Sum).Sum
        
        if ($totalMessages -gt 0) {
            Write-Host "✅ EventHub received messages: $totalMessages in last 5 minutes" -ForegroundColor Green
        } else {
            Write-Host "⚠️  No messages detected in EventHub metrics (may need more time)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️  Could not retrieve EventHub metrics" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Error checking EventHub metrics: $_" -ForegroundColor Yellow
}

# ============================================================================
# STEP 3: CHECK LAMBDA PROCESSING
# ============================================================================
Write-Host "`n┌────────────────────────────────────────────────────────────────┐" -ForegroundColor Yellow
Write-Host "│ STEP 3: Check Lambda Processing Logs                          │" -ForegroundColor Yellow
Write-Host "└────────────────────────────────────────────────────────────────┘" -ForegroundColor Yellow

Write-Host "`n⏳ Waiting 30 seconds for Lambda to poll EventHub..." -ForegroundColor Cyan
Start-Sleep -Seconds 30

Write-Host "`n📋 Checking Lambda logs for recent activity..." -ForegroundColor Cyan

try {
    # Check Lambda invocations
    $startTimeMs = ([int]((Get-Date).AddMinutes(-5).Ticks / 10000))
    
    $logsJson = aws logs filter-log-events `
        --log-group-name "/aws/lambda/$lambdaFunction" `
        --start-time $startTimeMs `
        --region $awsRegion `
        --profile $awsProfile `
        --output json 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        $logEvents = ($logsJson | ConvertFrom-Json).events
        
        if ($logEvents -and $logEvents.Count -gt 0) {
            Write-Host "✅ Lambda has $($logEvents.Count) log events in last 5 minutes" -ForegroundColor Green
            
            # Look for specific patterns
            $processingEvents = $logEvents | Where-Object { $_.message -like "*Processing event*" -or $_.message -like "*Received event*" }
            $errorEvents = $logEvents | Where-Object { $_.message -like "*Error*" -or $_.message -like "*Failed*" }
            $successEvents = $logEvents | Where-Object { $_.message -like "*Successfully*" -or $_.message -like "*Stored*" }
            
            if ($processingEvents) {
                Write-Host "   📨 Processing events: $($processingEvents.Count)" -ForegroundColor Gray
            }
            if ($successEvents) {
                Write-Host "   ✅ Success events: $($successEvents.Count)" -ForegroundColor Green
            }
            if ($errorEvents) {
                Write-Host "   ❌ Error events: $($errorEvents.Count)" -ForegroundColor Red
                Write-Host "`n   Recent errors:" -ForegroundColor Red
                $errorEvents | Select-Object -First 3 | ForEach-Object {
                    Write-Host "      - $($_.message)" -ForegroundColor Red
                }
            }
            
            # Show last few log messages
            Write-Host "`n   📝 Recent log messages:" -ForegroundColor Cyan
            $logEvents | Select-Object -Last 5 | ForEach-Object {
                $timestamp = [DateTimeOffset]::FromUnixTimeMilliseconds($_.timestamp).ToString("HH:mm:ss")
                Write-Host "      [$timestamp] $($_.message.Substring(0, [Math]::Min(100, $_.message.Length)))" -ForegroundColor Gray
            }
        } else {
            Write-Host "⚠️  No Lambda log events found (Lambda may not have been invoked yet)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Failed to query Lambda logs" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error checking Lambda logs: $_" -ForegroundColor Red
}

# ============================================================================
# STEP 4: CHECK DYNAMODB STORAGE
# ============================================================================
Write-Host "`n┌────────────────────────────────────────────────────────────────┐" -ForegroundColor Yellow
Write-Host "│ STEP 4: Verify DynamoDB Storage                               │" -ForegroundColor Yellow
Write-Host "└────────────────────────────────────────────────────────────────┘" -ForegroundColor Yellow

Write-Host "`n📊 Checking DynamoDB tables..." -ForegroundColor Cyan

# Check EventHub checkpoints
try {
    Write-Host "`n1️⃣  EventHub Checkpoints Table:" -ForegroundColor Cyan
    
    $checkpointsJson = aws dynamodb scan `
        --table-name $dynamoCheckpoints `
        --region $awsRegion `
        --profile $awsProfile `
        --output json 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        $checkpoints = ($checkpointsJson | ConvertFrom-Json).Items
        
        if ($checkpoints -and $checkpoints.Count -gt 0) {
            Write-Host "   ✅ Found $($checkpoints.Count) checkpoint(s)" -ForegroundColor Green
            
            foreach ($checkpoint in $checkpoints) {
                $partitionId = $checkpoint.partitionId.S
                $sequenceNumber = $checkpoint.sequenceNumber.N
                $offset = $checkpoint.offset.S
                $lastUpdated = $checkpoint.lastUpdated.S
                
                Write-Host "      📍 Partition: $partitionId" -ForegroundColor Gray
                Write-Host "         - Sequence: $sequenceNumber" -ForegroundColor Gray
                Write-Host "         - Offset: $offset" -ForegroundColor Gray
                Write-Host "         - Updated: $lastUpdated" -ForegroundColor Gray
            }
        } else {
            Write-Host "   ⚠️  No checkpoints found (Lambda hasn't processed events yet)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ❌ Failed to query checkpoints table" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ Error checking checkpoints: $_" -ForegroundColor Red
}

# Check for meetings/events table (if exists)
try {
    Write-Host "`n2️⃣  Checking for teams-meetings table:" -ForegroundColor Cyan
    
    $tableExists = aws dynamodb describe-table `
        --table-name "teams-meetings" `
        --region $awsRegion `
        --profile $awsProfile `
        --output json 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Table exists" -ForegroundColor Green
        
        # Scan for recent items
        $itemsJson = aws dynamodb scan `
            --table-name "teams-meetings" `
            --region $awsRegion `
            --profile $awsProfile `
            --max-items 5 `
            --output json 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            $items = ($itemsJson | ConvertFrom-Json).Items
            
            if ($items -and $items.Count -gt 0) {
                Write-Host "   ✅ Found $($items.Count) meeting event(s)" -ForegroundColor Green
                
                # Look for our newly created meeting
                $ourMeeting = $items | Where-Object { 
                    $_.meetingId.S -eq $meetingId -or 
                    $_.subject.S -like "*$timestamp*" 
                }
                
                if ($ourMeeting) {
                    Write-Host "   🎯 FOUND OUR TEST MEETING in DynamoDB!" -ForegroundColor Green
                    Write-Host "      - Meeting ID: $($ourMeeting.meetingId.S)" -ForegroundColor Gray
                    Write-Host "      - Subject: $($ourMeeting.subject.S)" -ForegroundColor Gray
                } else {
                    Write-Host "   ⚠️  Test meeting not yet in DynamoDB (may need more time)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "   ⚠️  No meeting events found in DynamoDB" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "   ℹ️  teams-meetings table doesn't exist yet" -ForegroundColor Cyan
    }
} catch {
    Write-Host "   ℹ️  teams-meetings table not configured" -ForegroundColor Cyan
}

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                      TEST SUMMARY                              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n📋 Test Checklist:" -ForegroundColor White
Write-Host "   ✅ Step 1: Meeting created in Teams (ID: $($meetingId.Substring(0,20))...)" -ForegroundColor Green
Write-Host "   🔍 Step 2: Check EventHub metrics above" -ForegroundColor Yellow
Write-Host "   🔍 Step 3: Check Lambda logs above" -ForegroundColor Yellow
Write-Host "   🔍 Step 4: Check DynamoDB storage above" -ForegroundColor Yellow

Write-Host "`n📊 Next Steps:" -ForegroundColor White
Write-Host "   1. If EventHub shows no messages, check Graph subscription is active:" -ForegroundColor Gray
Write-Host "      python create-graph-subscription.py" -ForegroundColor Gray
Write-Host "   2. If Lambda shows no activity, check EventBridge schedule:" -ForegroundColor Gray
Write-Host "      aws events describe-rule --name tmf-eventhub-poll-dev --profile tmf-dev" -ForegroundColor Gray
Write-Host "   3. Manually trigger Lambda to process immediately:" -ForegroundColor Gray
Write-Host "      aws lambda invoke --function-name $lambdaFunction --profile $awsProfile output.json" -ForegroundColor Gray
Write-Host "   4. Monitor live Lambda logs:" -ForegroundColor Gray
Write-Host "      aws logs tail /aws/lambda/$lambdaFunction --follow --profile $awsProfile" -ForegroundColor Gray

Write-Host "`n✅ Test completed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Green
Write-Host ""
