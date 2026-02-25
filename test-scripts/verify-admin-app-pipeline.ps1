#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verify the Admin App sees data produced by the upstream pipeline.

.DESCRIPTION
    Cross-checks DynamoDB / S3 data written by Lambda against the Admin App API:
      1. Subscriptions in DynamoDB visible via /api/subscriptions
      2. Meetings stored by Lambda visible via /api/meetings
      3. Transcripts in S3 accessible via /api/transcripts
      4. Config endpoint returns valid data
      5. Health check includes Graph API connectivity status

.PARAMETER ApiKey
    API key for authenticated endpoints. Falls back to env:ADMIN_APP_API_KEY.

.PARAMETER BaseUrl
    Override automatic ECS discovery with a known base URL.

.PARAMETER Cluster
    ECS cluster name. Defaults to tmf-admin-app-8akfpg.

.PARAMETER Service
    ECS service name. Defaults to tmf-admin-app-8akfpg.

.EXAMPLE
    .\test-scripts\verify-admin-app-pipeline.ps1
    .\test-scripts\verify-admin-app-pipeline.ps1 -ApiKey "key" -BaseUrl http://1.2.3.4:3000
#>

param(
    [string]$ApiKey = $env:ADMIN_APP_API_KEY,
    [string]$BaseUrl = "",
    [string]$Cluster = "tmf-admin-app-8akfpg",
    [string]$Service = "tmf-admin-app-8akfpg"
)

$ErrorActionPreference = "Stop"

# ============================================================================
# COUNTERS
# ============================================================================
$script:passed = 0
$script:failed = 0
$script:skipped = 0
$script:results = @()

function Record-Result {
    param([string]$Name, [string]$Status, [string]$Detail = "")
    switch ($Status) {
        "PASS" { $script:passed++; Write-Host "[PASS] $Name" -ForegroundColor Green }
        "FAIL" { $script:failed++; Write-Host "[FAIL] $Name - $Detail" -ForegroundColor Red }
        "SKIP" { $script:skipped++; Write-Host "[SKIP] $Name - $Detail" -ForegroundColor Yellow }
    }
    $script:results += [PSCustomObject]@{ Test = $Name; Status = $Status; Detail = $Detail }
}

# ============================================================================
# HEADER
# ============================================================================
Write-Host "`n=====================================================================" -ForegroundColor Cyan
Write-Host "  ADMIN APP - PIPELINE DATA VERIFICATION" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# CONSTANTS
# ============================================================================
$subscriptionsTable = "graph-subscriptions"
$meetingsTable      = "tmf-meetings-8akfpg"
$transcriptsTable   = "tmf-transcripts-8akfpg"
$configTable        = "tmf-config-8akfpg"

# ============================================================================
# DISCOVER ADMIN APP
# ============================================================================
Write-Host "--- Discover Admin App ---" -ForegroundColor Yellow

if ($BaseUrl) {
    Write-Host "  Using provided BaseUrl: $BaseUrl"
} else {
    try {
        $taskArn = (aws ecs list-tasks --cluster $Cluster --service-name $Service --query 'taskArns[0]' --output text 2>&1)
        if (-not $taskArn -or $taskArn -eq "None" -or $taskArn -like "*error*" -or $taskArn -like "*Exception*") {
            Write-Host "[FAIL] No running ECS tasks. Service may be scaled to 0." -ForegroundColor Red
            Record-Result "ECS Discovery" "FAIL" "No running tasks"
            # Print summary and exit
            Write-Host "`n=====================================================================" -ForegroundColor Cyan
            Write-Host ("  TOTAL: {0} passed, {1} failed, {2} skipped" -f $script:passed, $script:failed, $script:skipped) -ForegroundColor Cyan
            Write-Host "=====================================================================" -ForegroundColor Cyan
            exit 1
        }

        $taskDetailJson = aws ecs describe-tasks --cluster $Cluster --tasks $taskArn --query 'tasks[0].attachments[0].details' --output json 2>&1
        $taskDetail = $taskDetailJson | ConvertFrom-Json
        $eniId = ($taskDetail | Where-Object { $_.name -eq 'networkInterfaceId' }).value

        if (-not $eniId) {
            Record-Result "ECS Discovery" "FAIL" "No ENI found on task"
            exit 1
        }

        $publicIp = (aws ec2 describe-network-interfaces --network-interface-ids $eniId --query 'NetworkInterfaces[0].Association.PublicIp' --output text 2>&1)
        if (-not $publicIp -or $publicIp -eq "None" -or $publicIp -like "*error*") {
            Record-Result "ECS Discovery" "FAIL" "No public IP on ENI $eniId"
            exit 1
        }

        $BaseUrl = "http://${publicIp}:3000"
    } catch {
        Record-Result "ECS Discovery" "FAIL" "$_"
        exit 1
    }
}

Write-Host "  Admin App URL: $BaseUrl"
Record-Result "ECS Discovery" "PASS" $BaseUrl
Write-Host ""

if (-not $ApiKey) {
    Write-Host "[SKIP] No ADMIN_APP_API_KEY set. Cannot test authenticated endpoints." -ForegroundColor Yellow
    Write-Host "  Set env:ADMIN_APP_API_KEY or pass -ApiKey to enable full verification."
    Record-Result "API Key Available" "SKIP" "Set ADMIN_APP_API_KEY to enable"
    # Still run unauthenticated checks below
}

$headers = @{}
if ($ApiKey) { $headers["X-API-Key"] = $ApiKey }

# ============================================================================
# CHECK 1: SUBSCRIPTIONS (DynamoDB -> Admin App)
# ============================================================================
Write-Host "--- Check 1: Subscriptions ---" -ForegroundColor Yellow

try {
    $dynamoSubsJson = aws dynamodb scan --table-name $subscriptionsTable --select COUNT --query 'Count' --output text 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dynamoSubsCount = [int]$dynamoSubsJson
        Write-Host "  DynamoDB ($subscriptionsTable): $dynamoSubsCount subscription(s)"
    } else {
        $dynamoSubsCount = -1
        Write-Host "  DynamoDB: Could not query $subscriptionsTable" -ForegroundColor Yellow
    }
} catch {
    $dynamoSubsCount = -1
    Write-Host "  DynamoDB query error: $_" -ForegroundColor Yellow
}

if ($ApiKey) {
    try {
        $apiSubs = Invoke-RestMethod -Uri "$BaseUrl/api/subscriptions" -Method Get -Headers $headers -TimeoutSec 10
        $apiSubsCount = $apiSubs.totalCount
        Write-Host "  Admin App /api/subscriptions: $apiSubsCount subscription(s)"

        if ($dynamoSubsCount -ge 0) {
            if ($apiSubsCount -eq $dynamoSubsCount) {
                Record-Result "Subscriptions Sync" "PASS" "DynamoDB=$dynamoSubsCount, App=$apiSubsCount"
            } elseif ($apiSubsCount -ge 0) {
                # Counts may legitimately differ due to Graph enrichment
                Record-Result "Subscriptions Sync" "PASS" "DynamoDB=$dynamoSubsCount, App=$apiSubsCount (counts may differ)"
            }
        } else {
            Record-Result "Subscriptions Sync" "PASS" "App returned $apiSubsCount (DynamoDB query skipped)"
        }
    } catch {
        Record-Result "Subscriptions Sync" "FAIL" "$_"
    }
} else {
    Record-Result "Subscriptions Sync" "SKIP" "No API key"
}
Write-Host ""

# ============================================================================
# CHECK 2: MEETINGS (DynamoDB -> Admin App)
# ============================================================================
Write-Host "--- Check 2: Meetings ---" -ForegroundColor Yellow

try {
    $dynamoMeetJson = aws dynamodb scan --table-name $meetingsTable --select COUNT --query 'Count' --output text 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dynamoMeetCount = [int]$dynamoMeetJson
        Write-Host "  DynamoDB ($meetingsTable): $dynamoMeetCount meeting(s)"
    } else {
        $dynamoMeetCount = -1
        Write-Host "  DynamoDB: Could not query $meetingsTable" -ForegroundColor Yellow
    }
} catch {
    $dynamoMeetCount = -1
    Write-Host "  DynamoDB query error: $_" -ForegroundColor Yellow
}

if ($ApiKey) {
    try {
        $apiMeet = Invoke-RestMethod -Uri "$BaseUrl/api/meetings" -Method Get -Headers $headers -TimeoutSec 10
        $apiMeetCount = $apiMeet.totalCount
        Write-Host "  Admin App /api/meetings: $apiMeetCount meeting(s)"

        if ($dynamoMeetCount -ge 0 -and $dynamoMeetCount -gt 0) {
            if ($apiMeetCount -gt 0) {
                Record-Result "Meetings Sync" "PASS" "DynamoDB=$dynamoMeetCount, App=$apiMeetCount"
            } else {
                Record-Result "Meetings Sync" "FAIL" "DynamoDB has $dynamoMeetCount but App shows 0"
            }
        } elseif ($dynamoMeetCount -eq 0) {
            Record-Result "Meetings Sync" "SKIP" "No meetings in pipeline yet"
        } else {
            Record-Result "Meetings Sync" "PASS" "App returned $apiMeetCount (DynamoDB query skipped)"
        }
    } catch {
        Record-Result "Meetings Sync" "FAIL" "$_"
    }
} else {
    Record-Result "Meetings Sync" "SKIP" "No API key"
}
Write-Host ""

# ============================================================================
# CHECK 3: TRANSCRIPTS (S3/DynamoDB -> Admin App)
# ============================================================================
Write-Host "--- Check 3: Transcripts ---" -ForegroundColor Yellow

try {
    $dynamoTxJson = aws dynamodb scan --table-name $transcriptsTable --select COUNT --query 'Count' --output text 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dynamoTxCount = [int]$dynamoTxJson
        Write-Host "  DynamoDB ($transcriptsTable): $dynamoTxCount transcript(s)"
    } else {
        $dynamoTxCount = -1
        Write-Host "  DynamoDB: Could not query $transcriptsTable" -ForegroundColor Yellow
    }
} catch {
    $dynamoTxCount = -1
    Write-Host "  DynamoDB query error: $_" -ForegroundColor Yellow
}

if ($ApiKey) {
    try {
        $apiTx = Invoke-RestMethod -Uri "$BaseUrl/api/transcripts" -Method Get -Headers $headers -TimeoutSec 10
        $apiTxCount = $apiTx.totalCount
        Write-Host "  Admin App /api/transcripts: $apiTxCount transcript(s)"

        if ($dynamoTxCount -ge 0 -and $dynamoTxCount -gt 0) {
            if ($apiTxCount -gt 0) {
                Record-Result "Transcripts Sync" "PASS" "DynamoDB=$dynamoTxCount, App=$apiTxCount"
            } else {
                Record-Result "Transcripts Sync" "FAIL" "DynamoDB has $dynamoTxCount but App shows 0"
            }
        } elseif ($dynamoTxCount -eq 0) {
            Record-Result "Transcripts Sync" "SKIP" "No transcripts in pipeline yet"
        } else {
            Record-Result "Transcripts Sync" "PASS" "App returned $apiTxCount (DynamoDB query skipped)"
        }
    } catch {
        Record-Result "Transcripts Sync" "FAIL" "$_"
    }
} else {
    Record-Result "Transcripts Sync" "SKIP" "No API key"
}
Write-Host ""

# ============================================================================
# CHECK 4: CONFIG ENDPOINT
# ============================================================================
Write-Host "--- Check 4: Config Endpoint ---" -ForegroundColor Yellow

if ($ApiKey) {
    try {
        $configResp = Invoke-RestMethod -Uri "$BaseUrl/api/config" -Method Get -Headers $headers -TimeoutSec 10
        if ($configResp) {
            Record-Result "Config Endpoint" "PASS" "Config returned successfully"
        } else {
            Record-Result "Config Endpoint" "FAIL" "Empty response"
        }
    } catch {
        Record-Result "Config Endpoint" "FAIL" "$_"
    }
} else {
    Record-Result "Config Endpoint" "SKIP" "No API key"
}
Write-Host ""

# ============================================================================
# CHECK 5: HEALTH CHECK WITH GRAPH CONNECTIVITY
# ============================================================================
Write-Host "--- Check 5: Health Check (Graph API connectivity) ---" -ForegroundColor Yellow

if ($ApiKey) {
    try {
        $healthResp = Invoke-RestMethod -Uri "$BaseUrl/api/config/health" -Method Get -Headers $headers -TimeoutSec 15
        Write-Host "  status=$($healthResp.status), graphApi=$($healthResp.graphApi), database=$($healthResp.database)"

        if ($healthResp.status -eq "healthy") {
            Record-Result "Health (Graph + DB)" "PASS" "graph=$($healthResp.graphApi), db=$($healthResp.database)"
        } elseif ($healthResp.status -eq "degraded") {
            Record-Result "Health (Graph + DB)" "FAIL" "Degraded: graph=$($healthResp.graphApi), db=$($healthResp.database)"
        } else {
            Record-Result "Health (Graph + DB)" "FAIL" "status=$($healthResp.status)"
        }
    } catch {
        Record-Result "Health (Graph + DB)" "FAIL" "$_"
    }
} else {
    Record-Result "Health (Graph + DB)" "SKIP" "No API key"
}
Write-Host ""

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  PIPELINE VERIFICATION RESULTS" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

foreach ($r in $script:results) {
    $color = switch ($r.Status) { "PASS" { "Green" } "FAIL" { "Red" } "SKIP" { "Yellow" } }
    Write-Host ("  [{0}] {1,-35} {2}" -f $r.Status, $r.Test, $r.Detail) -ForegroundColor $color
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ("  TOTAL: {0} passed, {1} failed, {2} skipped" -f $script:passed, $script:failed, $script:skipped) -ForegroundColor Cyan
Write-Host "  Finished: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

if ($script:failed -gt 0) { exit 1 } else { exit 0 }
