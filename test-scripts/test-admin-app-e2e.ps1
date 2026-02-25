#!/usr/bin/env pwsh
<#
.SYNOPSIS
    E2E Smoke Test for the Admin App (ECS Fargate)

.DESCRIPTION
    Discovers the admin app via ECS, then validates:
      1. Health check
      2. Auth status (unauthenticated)
      3. API key auth
      4. Subscriptions, meetings, transcripts endpoints
      5. Webhook validation token echo
      6. Pipeline data cross-check with DynamoDB

.PARAMETER ApiKey
    API key for authenticated endpoints. Falls back to env:ADMIN_APP_API_KEY.

.PARAMETER BaseUrl
    Override automatic ECS discovery with a known base URL.

.PARAMETER Cluster
    ECS cluster name. Defaults to tmf-admin-app-8akfpg.

.PARAMETER Service
    ECS service name. Defaults to tmf-admin-app-8akfpg.

.EXAMPLE
    .\test-scripts\test-admin-app-e2e.ps1
    .\test-scripts\test-admin-app-e2e.ps1 -BaseUrl http://1.2.3.4:3000
    .\test-scripts\test-admin-app-e2e.ps1 -ApiKey "my-secret-key"
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
Write-Host "  ADMIN APP - E2E SMOKE TEST" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Cluster : $Cluster"
Write-Host "  Service : $Service"
Write-Host "  Started : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# STEP 0: DISCOVER ADMIN APP URL
# ============================================================================
Write-Host "--- Step 0: Discover Admin App URL ---" -ForegroundColor Yellow

if ($BaseUrl) {
    Write-Host "  Using provided BaseUrl: $BaseUrl"
} else {
    try {
        $taskArn = (aws ecs list-tasks --cluster $Cluster --service-name $Service --query 'taskArns[0]' --output text 2>&1)
        if (-not $taskArn -or $taskArn -eq "None" -or $taskArn -like "*error*" -or $taskArn -like "*Exception*") {
            Write-Host "[FAIL] No running tasks found for service $Service in cluster $Cluster" -ForegroundColor Red
            Write-Host "  The ECS service may have desired_count=0 or is not deployed."
            $script:failed++
            $script:results += [PSCustomObject]@{ Test = "ECS Task Discovery"; Status = "FAIL"; Detail = "No running tasks" }
            # Print summary and exit
            Write-Host "`n=====================================================================" -ForegroundColor Cyan
            Write-Host "  SUMMARY: Passed=$script:passed  Failed=$script:failed  Skipped=$script:skipped" -ForegroundColor Cyan
            Write-Host "=====================================================================" -ForegroundColor Cyan
            exit 1
        }

        Write-Host "  Task ARN: $taskArn"

        $taskDetailJson = aws ecs describe-tasks --cluster $Cluster --tasks $taskArn --query 'tasks[0].attachments[0].details' --output json 2>&1
        $taskDetail = $taskDetailJson | ConvertFrom-Json
        $eniId = ($taskDetail | Where-Object { $_.name -eq 'networkInterfaceId' }).value

        if (-not $eniId) {
            Write-Host "[FAIL] Could not find ENI for task $taskArn" -ForegroundColor Red
            $script:failed++
            $script:results += [PSCustomObject]@{ Test = "ENI Discovery"; Status = "FAIL"; Detail = "No ENI found" }
            exit 1
        }
        Write-Host "  ENI: $eniId"

        $publicIp = (aws ec2 describe-network-interfaces --network-interface-ids $eniId --query 'NetworkInterfaces[0].Association.PublicIp' --output text 2>&1)
        if (-not $publicIp -or $publicIp -eq "None" -or $publicIp -like "*error*") {
            Write-Host "[FAIL] No public IP assigned to ENI $eniId" -ForegroundColor Red
            Write-Host "  The task may be in a private subnet or not yet assigned an IP."
            $script:failed++
            $script:results += [PSCustomObject]@{ Test = "Public IP Discovery"; Status = "FAIL"; Detail = "No public IP" }
            exit 1
        }

        $BaseUrl = "http://${publicIp}:3000"
        Write-Host "  Public IP: $publicIp"
    } catch {
        Write-Host "[FAIL] ECS discovery failed: $_" -ForegroundColor Red
        $script:failed++
        $script:results += [PSCustomObject]@{ Test = "ECS Discovery"; Status = "FAIL"; Detail = "$_" }
        exit 1
    }
}

Write-Host "  Base URL: $BaseUrl"
Record-Result "ECS Discovery" "PASS" $BaseUrl
Write-Host ""

# ============================================================================
# STEP 1: HEALTH CHECK - GET /health
# ============================================================================
Write-Host "--- Step 1: Health Check (GET /health) ---" -ForegroundColor Yellow
try {
    $healthResp = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -TimeoutSec 10
    if ($healthResp.status -eq "healthy") {
        Record-Result "Health Check" "PASS" "status=$($healthResp.status), uptime=$([math]::Round($healthResp.uptime, 1))s"
    } else {
        Record-Result "Health Check" "FAIL" "Unexpected status: $($healthResp.status)"
    }
} catch {
    Record-Result "Health Check" "FAIL" "$_"
}
Write-Host ""

# ============================================================================
# STEP 2: AUTH STATUS (UNAUTHENTICATED) - GET /auth/status
# ============================================================================
Write-Host "--- Step 2: Auth Status (GET /auth/status) ---" -ForegroundColor Yellow
try {
    $authResp = Invoke-RestMethod -Uri "$BaseUrl/auth/status" -Method Get -TimeoutSec 10
    if ($authResp.authenticated -eq $false) {
        Record-Result "Auth Status (unauthenticated)" "PASS" "authenticated=false"
    } else {
        Record-Result "Auth Status (unauthenticated)" "FAIL" "Expected authenticated=false, got $($authResp.authenticated)"
    }
} catch {
    Record-Result "Auth Status (unauthenticated)" "FAIL" "$_"
}
Write-Host ""

# ============================================================================
# STEP 3: API KEY AUTH - GET /api/config
# ============================================================================
Write-Host "--- Step 3: API Key Auth (GET /api/config) ---" -ForegroundColor Yellow
if ($ApiKey) {
    try {
        $headers = @{ "X-API-Key" = $ApiKey }
        $configResp = Invoke-RestMethod -Uri "$BaseUrl/api/config" -Method Get -Headers $headers -TimeoutSec 10
        Record-Result "API Key Auth (config)" "PASS" "Config retrieved successfully"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Record-Result "API Key Auth (config)" "FAIL" "HTTP $statusCode - $_"
    }
} else {
    # Without API key, expect 401
    try {
        $null = Invoke-WebRequest -Uri "$BaseUrl/api/config" -Method Get -TimeoutSec 10 -ErrorAction Stop
        Record-Result "API Key Auth (no key -> 401)" "FAIL" "Expected 401 but got 200"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401) {
            Record-Result "API Key Auth (no key -> 401)" "PASS" "Correctly returned 401"
        } else {
            Record-Result "API Key Auth (no key -> 401)" "FAIL" "Expected 401, got $statusCode"
        }
    }
}
Write-Host ""

# ============================================================================
# STEP 4: SUBSCRIPTIONS - GET /api/subscriptions
# ============================================================================
Write-Host "--- Step 4: Subscriptions (GET /api/subscriptions) ---" -ForegroundColor Yellow
if ($ApiKey) {
    try {
        $headers = @{ "X-API-Key" = $ApiKey }
        $subsResp = Invoke-RestMethod -Uri "$BaseUrl/api/subscriptions" -Method Get -Headers $headers -TimeoutSec 10
        if ($null -ne $subsResp.subscriptions -and $subsResp.subscriptions -is [array]) {
            Record-Result "Subscriptions Endpoint" "PASS" "Returned $($subsResp.totalCount) subscription(s)"
        } else {
            Record-Result "Subscriptions Endpoint" "FAIL" "Response did not contain subscriptions array"
        }
    } catch {
        Record-Result "Subscriptions Endpoint" "FAIL" "$_"
    }
} else {
    Record-Result "Subscriptions Endpoint" "SKIP" "No API key provided"
}
Write-Host ""

# ============================================================================
# STEP 5: MEETINGS - GET /api/meetings
# ============================================================================
Write-Host "--- Step 5: Meetings (GET /api/meetings) ---" -ForegroundColor Yellow
if ($ApiKey) {
    try {
        $headers = @{ "X-API-Key" = $ApiKey }
        $meetResp = Invoke-RestMethod -Uri "$BaseUrl/api/meetings" -Method Get -Headers $headers -TimeoutSec 10
        if ($null -ne $meetResp.meetings -and $meetResp.meetings -is [array]) {
            Record-Result "Meetings Endpoint" "PASS" "Returned $($meetResp.totalCount) meeting(s)"
        } else {
            Record-Result "Meetings Endpoint" "FAIL" "Response did not contain meetings array"
        }
    } catch {
        Record-Result "Meetings Endpoint" "FAIL" "$_"
    }
} else {
    Record-Result "Meetings Endpoint" "SKIP" "No API key provided"
}
Write-Host ""

# ============================================================================
# STEP 6: TRANSCRIPTS - GET /api/transcripts
# ============================================================================
Write-Host "--- Step 6: Transcripts (GET /api/transcripts) ---" -ForegroundColor Yellow
if ($ApiKey) {
    try {
        $headers = @{ "X-API-Key" = $ApiKey }
        $txResp = Invoke-RestMethod -Uri "$BaseUrl/api/transcripts" -Method Get -Headers $headers -TimeoutSec 10
        if ($null -ne $txResp.transcripts -and $txResp.transcripts -is [array]) {
            Record-Result "Transcripts Endpoint" "PASS" "Returned $($txResp.totalCount) transcript(s)"
        } else {
            Record-Result "Transcripts Endpoint" "FAIL" "Response did not contain transcripts array"
        }
    } catch {
        Record-Result "Transcripts Endpoint" "FAIL" "$_"
    }
} else {
    Record-Result "Transcripts Endpoint" "SKIP" "No API key provided"
}
Write-Host ""

# ============================================================================
# STEP 7: WEBHOOK VALIDATION - POST /api/webhooks/graph?validationToken=test123
# ============================================================================
Write-Host "--- Step 7: Webhook Validation Token ---" -ForegroundColor Yellow
try {
    $whResp = Invoke-WebRequest -Uri "$BaseUrl/api/webhooks/graph?validationToken=test123" -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 10
    $whBody = $whResp.Content
    if ($whResp.StatusCode -eq 200 -and $whBody -like "*test123*") {
        Record-Result "Webhook Validation Token" "PASS" "Echoed 'test123'"
    } else {
        Record-Result "Webhook Validation Token" "FAIL" "Status=$($whResp.StatusCode), Body=$whBody"
    }
} catch {
    Record-Result "Webhook Validation Token" "FAIL" "$_"
}
Write-Host ""

# ============================================================================
# STEP 8: PIPELINE DATA VERIFICATION (DynamoDB cross-check)
# ============================================================================
Write-Host "--- Step 8: Pipeline Data Verification ---" -ForegroundColor Yellow

$meetingsTable = "tmf-meetings-8akfpg"

if ($ApiKey) {
    try {
        $dynamoJson = aws dynamodb scan --table-name $meetingsTable --max-items 5 --query 'Items' --output json 2>&1
        if ($LASTEXITCODE -eq 0) {
            $dynamoItems = $dynamoJson | ConvertFrom-Json
            if ($dynamoItems -and $dynamoItems.Count -gt 0) {
                Write-Host "  DynamoDB has $($dynamoItems.Count) meeting(s) in $meetingsTable"

                # Now check admin app sees them
                $headers = @{ "X-API-Key" = $ApiKey }
                $apiMeetings = Invoke-RestMethod -Uri "$BaseUrl/api/meetings" -Method Get -Headers $headers -TimeoutSec 10
                if ($apiMeetings.totalCount -gt 0) {
                    Record-Result "Pipeline Data (DynamoDB -> Admin)" "PASS" "DynamoDB=$($dynamoItems.Count), AdminApp=$($apiMeetings.totalCount)"
                } else {
                    Record-Result "Pipeline Data (DynamoDB -> Admin)" "FAIL" "DynamoDB has meetings but admin app returned 0"
                }
            } else {
                Record-Result "Pipeline Data (DynamoDB -> Admin)" "SKIP" "No meetings in DynamoDB yet (pipeline may not have run)"
            }
        } else {
            Record-Result "Pipeline Data (DynamoDB -> Admin)" "SKIP" "Could not query DynamoDB table $meetingsTable"
        }
    } catch {
        Record-Result "Pipeline Data (DynamoDB -> Admin)" "FAIL" "$_"
    }
} else {
    Record-Result "Pipeline Data (DynamoDB -> Admin)" "SKIP" "No API key provided"
}
Write-Host ""

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  RESULTS" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

foreach ($r in $script:results) {
    $color = switch ($r.Status) { "PASS" { "Green" } "FAIL" { "Red" } "SKIP" { "Yellow" } }
    Write-Host ("  [{0}] {1,-40} {2}" -f $r.Status, $r.Test, $r.Detail) -ForegroundColor $color
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ("  TOTAL: {0} passed, {1} failed, {2} skipped" -f $script:passed, $script:failed, $script:skipped) -ForegroundColor Cyan
Write-Host "  Finished: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

if ($script:failed -gt 0) { exit 1 } else { exit 0 }
