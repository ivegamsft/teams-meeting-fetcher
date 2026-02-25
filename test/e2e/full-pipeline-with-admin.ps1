#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Full Pipeline E2E Validation including Admin App

.DESCRIPTION
    Validates every component of the Teams Meeting Fetcher pipeline:
      1. Lambda functions (EventHub processor)
      2. EventHub processor consumption (checkpoints)
      3. Admin App ECS service health
      4. Admin App reads pipeline data (meetings, subscriptions)
      5. Admin App detailed health (Graph API connectivity)
    Prints a final summary table showing all component statuses.

.PARAMETER ApiKey
    API key for admin app. Falls back to env:ADMIN_APP_API_KEY.

.PARAMETER AdminBaseUrl
    Override admin app URL (skip ECS discovery).

.PARAMETER AwsProfile
    AWS CLI profile. Defaults to "default".

.PARAMETER AwsRegion
    AWS region. Defaults to "us-east-1".

.EXAMPLE
    .\test\e2e\full-pipeline-with-admin.ps1
    .\test\e2e\full-pipeline-with-admin.ps1 -ApiKey "key" -AdminBaseUrl http://1.2.3.4:3000
#>

param(
    [string]$ApiKey       = $env:ADMIN_APP_API_KEY,
    [string]$AdminBaseUrl = "",
    [string]$AwsProfile   = "default",
    [string]$AwsRegion    = "us-east-1"
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
    param([string]$Component, [string]$Name, [string]$Status, [string]$Detail = "")
    switch ($Status) {
        "PASS" { $script:passed++; Write-Host "[PASS] $Name" -ForegroundColor Green }
        "FAIL" { $script:failed++; Write-Host "[FAIL] $Name - $Detail" -ForegroundColor Red }
        "SKIP" { $script:skipped++; Write-Host "[SKIP] $Name - $Detail" -ForegroundColor Yellow }
    }
    $script:results += [PSCustomObject]@{ Component = $Component; Test = $Name; Status = $Status; Detail = $Detail }
}

# ============================================================================
# CONSTANTS
# ============================================================================
$lambdaFunction     = "tmf-eventhub-processor-8akfpg"
$checkpointTable    = "eventhub-checkpoints"
$meetingsTable      = "tmf-meetings-8akfpg"
$transcriptsTable   = "tmf-transcripts-8akfpg"
$subscriptionsTable = "graph-subscriptions"
$ecsCluster         = "tmf-admin-app-8akfpg"
$ecsService         = "tmf-admin-app-8akfpg"

# ============================================================================
# HEADER
# ============================================================================
Write-Host "`n=====================================================================" -ForegroundColor Cyan
Write-Host "  FULL PIPELINE E2E VALIDATION (with Admin App)" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Region  : $AwsRegion"
Write-Host "  Started : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# 1. LAMBDA FUNCTIONS
# ============================================================================
Write-Host "=== Component 1: Lambda Functions ===" -ForegroundColor Yellow

try {
    $funcJson = aws lambda get-function --function-name $lambdaFunction --region $AwsRegion --output json 2>&1
    if ($LASTEXITCODE -eq 0) {
        $funcData = $funcJson | ConvertFrom-Json
        $state = $funcData.Configuration.State
        if ($state -eq "Active") {
            Record-Result "Lambda" "Lambda $lambdaFunction" "PASS" "State=Active"
        } else {
            Record-Result "Lambda" "Lambda $lambdaFunction" "FAIL" "State=$state"
        }
    } else {
        Record-Result "Lambda" "Lambda $lambdaFunction" "FAIL" "Function not found"
    }
} catch {
    Record-Result "Lambda" "Lambda $lambdaFunction" "FAIL" "$_"
}
Write-Host ""

# ============================================================================
# 2. EVENTHUB PROCESSOR (Checkpoints)
# ============================================================================
Write-Host "=== Component 2: EventHub Processor ===" -ForegroundColor Yellow

try {
    $cpJson = aws dynamodb scan --table-name $checkpointTable --select COUNT --query 'Count' --output text --region $AwsRegion 2>&1
    if ($LASTEXITCODE -eq 0) {
        $cpCount = [int]$cpJson
        if ($cpCount -gt 0) {
            Record-Result "EventHub" "EventHub Checkpoints" "PASS" "$cpCount checkpoint(s) in DynamoDB"
        } else {
            Record-Result "EventHub" "EventHub Checkpoints" "SKIP" "No checkpoints yet (processor may not have run)"
        }
    } else {
        Record-Result "EventHub" "EventHub Checkpoints" "FAIL" "Cannot query $checkpointTable"
    }
} catch {
    Record-Result "EventHub" "EventHub Checkpoints" "FAIL" "$_"
}
Write-Host ""

# ============================================================================
# 3. ADMIN APP ECS SERVICE
# ============================================================================
Write-Host "=== Component 3: Admin App ECS Service ===" -ForegroundColor Yellow

$adminAppAvailable = $false

if ($AdminBaseUrl) {
    Write-Host "  Using provided URL: $AdminBaseUrl"
    $adminAppAvailable = $true
    Record-Result "AdminApp" "ECS Discovery" "PASS" $AdminBaseUrl
} else {
    try {
        # Check service desired/running count
        $svcJson = aws ecs describe-services --cluster $ecsCluster --services $ecsService --query 'services[0]' --output json --region $AwsRegion 2>&1
        if ($LASTEXITCODE -eq 0) {
            $svcData = $svcJson | ConvertFrom-Json
            $desired = $svcData.desiredCount
            $running = $svcData.runningCount

            if ($running -gt 0) {
                Write-Host "  ECS Service: desired=$desired, running=$running"

                # Get task public IP
                $taskArn = (aws ecs list-tasks --cluster $ecsCluster --service-name $ecsService --query 'taskArns[0]' --output text --region $AwsRegion 2>&1)
                $taskDetailJson = aws ecs describe-tasks --cluster $ecsCluster --tasks $taskArn --query 'tasks[0].attachments[0].details' --output json --region $AwsRegion 2>&1
                $taskDetail = $taskDetailJson | ConvertFrom-Json
                $eniId = ($taskDetail | Where-Object { $_.name -eq 'networkInterfaceId' }).value

                if ($eniId) {
                    $publicIp = (aws ec2 describe-network-interfaces --network-interface-ids $eniId --query 'NetworkInterfaces[0].Association.PublicIp' --output text --region $AwsRegion 2>&1)
                    if ($publicIp -and $publicIp -ne "None" -and $publicIp -notlike "*error*") {
                        $AdminBaseUrl = "http://${publicIp}:3000"
                        $adminAppAvailable = $true
                        Record-Result "AdminApp" "ECS Service Running" "PASS" "IP=$publicIp, running=$running"
                    } else {
                        Record-Result "AdminApp" "ECS Service Running" "FAIL" "No public IP (running=$running)"
                    }
                } else {
                    Record-Result "AdminApp" "ECS Service Running" "FAIL" "No ENI found on task"
                }
            } else {
                Record-Result "AdminApp" "ECS Service Running" "FAIL" "desired=$desired, running=0"
            }
        } else {
            Record-Result "AdminApp" "ECS Service Running" "FAIL" "Service not found"
        }
    } catch {
        Record-Result "AdminApp" "ECS Service Running" "FAIL" "$_"
    }
}

# Health check
if ($adminAppAvailable) {
    try {
        $healthResp = Invoke-RestMethod -Uri "$AdminBaseUrl/health" -Method Get -TimeoutSec 10
        if ($healthResp.status -eq "healthy") {
            Record-Result "AdminApp" "Health Check (/health)" "PASS" "status=healthy, uptime=$([math]::Round($healthResp.uptime,1))s"
        } else {
            Record-Result "AdminApp" "Health Check (/health)" "FAIL" "status=$($healthResp.status)"
        }
    } catch {
        Record-Result "AdminApp" "Health Check (/health)" "FAIL" "$_"
    }
} else {
    Record-Result "AdminApp" "Health Check (/health)" "SKIP" "Admin app not reachable"
}
Write-Host ""

# ============================================================================
# 4. ADMIN APP READS PIPELINE DATA
# ============================================================================
Write-Host "=== Component 4: Admin App Pipeline Data ===" -ForegroundColor Yellow

if ($adminAppAvailable -and $ApiKey) {
    $headers = @{ "X-API-Key" = $ApiKey }

    # Meetings
    try {
        $apiMeet = Invoke-RestMethod -Uri "$AdminBaseUrl/api/meetings" -Method Get -Headers $headers -TimeoutSec 10
        if ($null -ne $apiMeet.meetings -and $apiMeet.meetings -is [array]) {
            Record-Result "Pipeline" "Meetings via Admin App" "PASS" "$($apiMeet.totalCount) meeting(s)"
        } else {
            Record-Result "Pipeline" "Meetings via Admin App" "FAIL" "Invalid response format"
        }
    } catch {
        Record-Result "Pipeline" "Meetings via Admin App" "FAIL" "$_"
    }

    # Subscriptions
    try {
        $apiSubs = Invoke-RestMethod -Uri "$AdminBaseUrl/api/subscriptions" -Method Get -Headers $headers -TimeoutSec 10
        if ($null -ne $apiSubs.subscriptions -and $apiSubs.subscriptions -is [array]) {
            Record-Result "Pipeline" "Subscriptions via Admin App" "PASS" "$($apiSubs.totalCount) subscription(s)"
        } else {
            Record-Result "Pipeline" "Subscriptions via Admin App" "FAIL" "Invalid response format"
        }
    } catch {
        Record-Result "Pipeline" "Subscriptions via Admin App" "FAIL" "$_"
    }

    # Transcripts
    try {
        $apiTx = Invoke-RestMethod -Uri "$AdminBaseUrl/api/transcripts" -Method Get -Headers $headers -TimeoutSec 10
        if ($null -ne $apiTx.transcripts -and $apiTx.transcripts -is [array]) {
            Record-Result "Pipeline" "Transcripts via Admin App" "PASS" "$($apiTx.totalCount) transcript(s)"
        } else {
            Record-Result "Pipeline" "Transcripts via Admin App" "FAIL" "Invalid response format"
        }
    } catch {
        Record-Result "Pipeline" "Transcripts via Admin App" "FAIL" "$_"
    }
} elseif ($adminAppAvailable -and -not $ApiKey) {
    Record-Result "Pipeline" "Meetings via Admin App" "SKIP" "No API key"
    Record-Result "Pipeline" "Subscriptions via Admin App" "SKIP" "No API key"
    Record-Result "Pipeline" "Transcripts via Admin App" "SKIP" "No API key"
} else {
    Record-Result "Pipeline" "Meetings via Admin App" "SKIP" "Admin app not reachable"
    Record-Result "Pipeline" "Subscriptions via Admin App" "SKIP" "Admin app not reachable"
    Record-Result "Pipeline" "Transcripts via Admin App" "SKIP" "Admin app not reachable"
}
Write-Host ""

# ============================================================================
# 5. ADMIN APP GRAPH CONNECTIVITY
# ============================================================================
Write-Host "=== Component 5: Graph API Connectivity ===" -ForegroundColor Yellow

if ($adminAppAvailable -and $ApiKey) {
    $headers = @{ "X-API-Key" = $ApiKey }
    try {
        $detailedHealth = Invoke-RestMethod -Uri "$AdminBaseUrl/api/config/health" -Method Get -Headers $headers -TimeoutSec 15
        Write-Host "  status=$($detailedHealth.status), graphApi=$($detailedHealth.graphApi), database=$($detailedHealth.database)"

        if ($detailedHealth.graphApi -eq "connected") {
            Record-Result "Graph" "Graph API Connection" "PASS" "graphApi=connected"
        } else {
            Record-Result "Graph" "Graph API Connection" "FAIL" "graphApi=$($detailedHealth.graphApi)"
        }

        if ($detailedHealth.database -eq "connected") {
            Record-Result "Graph" "Database Connection" "PASS" "database=connected"
        } else {
            Record-Result "Graph" "Database Connection" "FAIL" "database=$($detailedHealth.database)"
        }
    } catch {
        Record-Result "Graph" "Graph API Connection" "FAIL" "$_"
    }
} elseif ($adminAppAvailable) {
    Record-Result "Graph" "Graph API Connection" "SKIP" "No API key"
} else {
    Record-Result "Graph" "Graph API Connection" "SKIP" "Admin app not reachable"
}
Write-Host ""

# ============================================================================
# SUMMARY TABLE
# ============================================================================
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  FULL PIPELINE E2E SUMMARY" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host ("  {0,-12} {1,-35} {2,-6} {3}" -f "COMPONENT", "TEST", "STATUS", "DETAIL") -ForegroundColor White
Write-Host ("  {0,-12} {1,-35} {2,-6} {3}" -f "----------", "-----------------------------------", "------", "------")

foreach ($r in $script:results) {
    $color = switch ($r.Status) { "PASS" { "Green" } "FAIL" { "Red" } "SKIP" { "Yellow" } }
    Write-Host ("  {0,-12} {1,-35} [{2}] {3}" -f $r.Component, $r.Test, $r.Status, $r.Detail) -ForegroundColor $color
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan

# Component-level rollup
$components = $script:results | Group-Object Component
Write-Host ""
Write-Host "  Component Rollup:" -ForegroundColor White
foreach ($grp in $components) {
    $p = ($grp.Group | Where-Object { $_.Status -eq "PASS" }).Count
    $f = ($grp.Group | Where-Object { $_.Status -eq "FAIL" }).Count
    $s = ($grp.Group | Where-Object { $_.Status -eq "SKIP" }).Count
    $icon = if ($f -gt 0) { "[FAIL]" } elseif ($p -gt 0) { "[PASS]" } else { "[SKIP]" }
    $color = if ($f -gt 0) { "Red" } elseif ($p -gt 0) { "Green" } else { "Yellow" }
    Write-Host ("    {0,-8} {1}: {2}P/{3}F/{4}S" -f $icon, $grp.Name, $p, $f, $s) -ForegroundColor $color
}

Write-Host ""
Write-Host ("  TOTAL: {0} passed, {1} failed, {2} skipped" -f $script:passed, $script:failed, $script:skipped) -ForegroundColor Cyan
Write-Host "  Finished: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

if ($script:failed -gt 0) { exit 1 } else { exit 0 }
