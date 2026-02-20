#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Monitor E2E test progress in real-time
    
.DESCRIPTION
    Continuously monitors the flow:
    1. EventHub incoming messages
    2. Lambda invocations
    3. DynamoDB checkpoint updates
    4. Lambda logs
#>

$ErrorActionPreference = "SilentlyContinue"

# Configuration
$awsProfile = "tmf-dev"
$awsRegion = "us-east-1"
$lambdaFunction = "tmf-eventhub-processor-dev"
$checkpointTable = "eventhub-checkpoints"
$resourceGroup = "tmf-resource-group"
$eventhubNamespace = "tmf-ehns-eus-6an5wk"
$eventhubName = "tmf-eh-eus-6an5wk"

$refreshInterval = 10  # seconds

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         E2E TEST PROGRESS MONITOR - REAL-TIME                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$iteration = 0
while ($true) {
    $iteration++
    $timestamp = Get-Date -Format "HH:mm:ss"
    
    Write-Host "[REFRESH #$iteration @ $timestamp] ────────────────────────────────" -ForegroundColor Yellow
    
    # ========================================================================
    # 1. EventHub Incoming Messages
    # ========================================================================
    Write-Host "`n1️⃣  EventHub Incoming Messages:" -ForegroundColor Cyan
    
    try {
        $endTimeMetric = Get-Date
        $startTimeMetric = $endTimeMetric.AddMinutes(-5)
        
        $metricsCmd = "az monitor metrics list " +
                      "--resource /subscriptions/$(az account show --query id -o tsv 2>/dev/null)/resourceGroups/$resourceGroup/providers/Microsoft.EventHub/namespaces/$eventhubNamespace " +
                      "--metric IncomingMessages " +
                      "--start-time $($startTimeMetric.ToString('yyyy-MM-ddTHH:mm:ssZ')) " +
                      "--end-time $($endTimeMetric.ToString('yyyy-MM-ddTHH:mm:ssZ')) " +
                      "--interval PT1M --output json"
        
        $metrics = Invoke-Expression $metricsCmd | ConvertFrom-Json
        
        if ($metrics.value -and $metrics.value[0].timeseries) {
            $totalMessages = ($metrics.value[0].timeseries[0].data | Measure-Object -Property total -Sum).Sum
            Write-Host "   ✅ Total messages (5 min): $totalMessages" -ForegroundColor Green
        } else {
            Write-Host "   ⏳ No messages detected in EventHub" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ Error checking EventHub metrics" -ForegroundColor Red
    }
    
    # ========================================================================
    # 2. Lambda Invocations
    # ========================================================================
    Write-Host "`n2️⃣  Lambda Function Invocations:" -ForegroundColor Cyan
    
    try {
        $invocations = aws cloudwatch get-metric-statistics `
            --namespace AWS/Lambda `
            --metric-name Invocations `
            --dimensions Name=FunctionName,Value=$lambdaFunction `
            --start-time (Get-Date).AddMinutes(-5).ToUniversalTime().ToString('o') `
            --end-time (Get-Date).ToUniversalTime().ToString('o') `
            --period 60 `
            --statistics Sum `
            --region $awsRegion `
            --profile $awsProfile `
            --output json 2>/dev/null | ConvertFrom-Json
        
        $invocationCount = ($invocations.Datapoints | Measure-Object -Property Sum -Sum).Sum
        Write-Host "   ✅ Invocations (5 min): $invocationCount" -ForegroundColor Green
        
        # Lambda Duration
        $durations = aws cloudwatch get-metric-statistics `
            --namespace AWS/Lambda `
            --metric-name Duration `
            --dimensions Name=FunctionName,Value=$lambdaFunction `
            --start-time (Get-Date).AddMinutes(-5).ToUniversalTime().ToString('o') `
            --end-time (Get-Date).ToUniversalTime().ToString('o') `
            --period 60 `
            --statistics Average `
            --region $awsRegion `
            --profile $awsProfile `
            --output json 2>/dev/null | ConvertFrom-Json
        
        if ($durations.Datapoints) {
            $avgDuration = ($durations.Datapoints | Measure-Object -Property Average -Average).Average
            Write-Host "   ⏱️  Average duration: $([Math]::Round($avgDuration, 0)) ms" -ForegroundColor Gray
        }
    } catch {
        Write-Host "   ⏳ No invocations yet" -ForegroundColor Yellow
    }
    
    # ========================================================================
    # 3. DynamoDB Checkpoints
    # ========================================================================
    Write-Host "`n3️⃣  DynamoDB Checkpoints:" -ForegroundColor Cyan
    
    try {
        $checkpointJson = aws dynamodb scan `
            --table-name $checkpointTable `
            --region $awsRegion `
            --profile $awsProfile `
            --output json 2>/dev/null
        
        $checkpoints = ($checkpointJson | ConvertFrom-Json).Items
        
        if ($checkpoints -and $checkpoints.Count -gt 0) {
            Write-Host "   ✅ Checkpoints found: $($checkpoints.Count)" -ForegroundColor Green
            
            foreach ($cp in $checkpoints) {
                $partId = $cp.partitionId.S
                $seq = $cp.sequenceNumber.N
                $offset = $cp.offset.S
                Write-Host "      📍 Partition: $partId | Seq: $seq | Offset: $offset" -ForegroundColor Gray
            }
        } else {
            Write-Host "   ⏳ No checkpoints created yet" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ❌ Error querying DynamoDB" -ForegroundColor Red
    }
    
    # ========================================================================
    # 4. Lambda Recent Logs (Last 3)
    # ========================================================================
    Write-Host "`n4️⃣  Lambda Recent Activity:" -ForegroundColor Cyan
    
    try {
        $logsJson = aws logs filter-log-events `
            --log-group-name "/aws/lambda/$lambdaFunction" `
            --region $awsRegion `
            --profile $awsProfile `
            --max-items 3 `
            --output json 2>/dev/null
        
        $events = ($logsJson | ConvertFrom-Json).events
        
        if ($events -and $events.Count -gt 0) {
            Write-Host "   📋 Latest log entries:" -ForegroundColor Gray
            foreach ($event in $events) {
                $msg = $event.message
                if ($msg -like "*ERROR*" -or $msg -like "*Error*" -or $msg -like "*error*") {
                    Write-Host "      ❌ $($msg.Substring(0, [Math]::Min(80, $msg.Length)))" -ForegroundColor Red
                } elseif ($msg -like "*Processing*" -or $msg -like "*processing*") {
                    Write-Host "      📨 $($msg.Substring(0, [Math]::Min(80, $msg.Length)))" -ForegroundColor Cyan
                } elseif ($msg -like "*Successfully*" -or $msg -like "*Success*" -or $msg -like "*Completed*") {
                    Write-Host "      ✅ $($msg.Substring(0, [Math]::Min(80, $msg.Length)))" -ForegroundColor Green
                } else {
                    Write-Host "      ℹ️  $($msg.Substring(0, [Math]::Min(80, $msg.Length)))" -ForegroundColor Gray
                }
            }
        } else {
            Write-Host "   ⏳ No log entries yet" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ℹ️  Logs not available yet" -ForegroundColor Gray
    }
    
    # ========================================================================
    # Summary Status
    # ========================================================================
    Write-Host "`n┌────────────────────────────────────────────────────────────┐" -ForegroundColor Gray
    Write-Host "│ Press Ctrl+C to stop monitoring                            │" -ForegroundColor Gray
    Write-Host "│ Refreshing every $refreshInterval seconds...                    │" -ForegroundColor Gray
    Write-Host "└────────────────────────────────────────────────────────────┘" -ForegroundColor Gray
    
    Write-Host "`n⏳ Next refresh in $refreshInterval seconds...`n" -ForegroundColor Gray
    Start-Sleep -Seconds $refreshInterval
    Clear-Host
}
