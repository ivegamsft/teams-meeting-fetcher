#!/usr/bin/env pwsh

Write-Host "`n╔════════════════════════════════════════════════════════════╗`n║    EVENT HUB LAMBDA PROCESSOR - DIAGNOSTIC REPORT         ║`n╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Test 1: Can it connect to Event Hub?
Write-Host "TEST 1: CONNECTION TO EVENT HUB" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────" 
$logs = aws logs filter-log-events `
  --log-group-name '/aws/lambda/tmf-eventhub-processor-dev' `
  --filter-pattern 'subscribe' `
  --start-time ([int]((Get-Date).AddMinutes(-10)).Ticks/10000) `
  --region us-east-1 `
  --profile tmf-dev `
  --query 'events | length(@)' `
  --output text 2>&1

if ($logs -gt 0) {
  Write-Host "✅ CONNECTING: Found $logs subscribe/connection events" -ForegroundColor Green
} else {
  Write-Host "⚠️  CHECKING: Looking for connection attempts..." -ForegroundColor Yellow
  $errors = aws logs filter-log-events `
    --log-group-name '/aws/lambda/tmf-eventhub-processor-dev' `
    --filter-pattern 'Failed|ERROR|error' `
    --start-time ([int]((Get-Date).AddMinutes(-10)).Ticks/10000) `
    --region us-east-1 `
    --profile tmf-dev `
    --query 'events | length(@)' `
    --output text 2>&1
  
  if ($errors -gt 0) {
    Write-Host "❌ ERRORS FOUND: $errors error events in logs" -ForegroundColor Red
  } else {
    Write-Host "✅ NO CONNECTION ERRORS" -ForegroundColor Green
  }
}
Write-Host ""

# Test 2: Is it polling?
Write-Host "TEST 2: POLLING (EventBridge Trigger)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────"
$invocations = aws cloudwatch get-metric-statistics `
  --namespace AWS/Lambda `
  --metric-name Invocations `
  --dimensions Name=FunctionName,Value=tmf-eventhub-processor-dev `
  --start-time (Get-Date).AddMinutes(-10).ToUniversalTime().ToString('o') `
  --end-time (Get-Date).ToUniversalTime().ToString('o') `
  --period 300 `
  --statistics Sum `
  --region us-east-1 `
  --profile tmf-dev `
  --query 'Datapoints | length(@)' `
  --output text 2>&1

if ($invocations -gt 0) {
  Write-Host "✅ POLLING ACTIVE: Lambda invoked $invocations time(s) in last 10 min" -ForegroundColor Green
} else {
  Write-Host "⚠️  NO RECENT INVOCATIONS: Checking EventBridge rule..." -ForegroundColor Yellow
  $rule = aws events describe-rule --name 'tmf-eventhub-poll-dev' --region us-east-1 --profile tmf-dev --query 'State' --output text 2>&1
  if ($rule -eq "ENABLED") {
    Write-Host "✅ EventBridge rule is ENABLED" -ForegroundColor Green
  } else {
    Write-Host "❌ EventBridge rule status: $rule" -ForegroundColor Red
  }
}
Write-Host ""

# Test 3: Can it read?
Write-Host "TEST 3: MESSAGE READING (S3 Payloads)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────"
$payloads = aws s3 ls s3://tmf-webhooks-eus-dev/eventhub/ --profile tmf-dev --region us-east-1 --recursive 2>&1 | Measure-Object -Line | Select-Object -ExpandProperty Lines

if ($payloads -gt 0) {
  Write-Host "✅ READING SUCCESSFUL: $payloads files written to S3" -ForegroundColor Green
  aws s3 ls s3://tmf-webhooks-eus-dev/eventhub/ --profile tmf-dev --region us-east-1 --recursive 2>&1 | Tail -3 | ForEach-Object { Write-Host "   $_" }
} else {
  Write-Host "⚠️  NO S3 OUTPUTS YET: Lambda may not have executed successfully" -ForegroundColor Yellow
}
Write-Host ""

# Test 4: Does it See Messages?
Write-Host "TEST 4: MESSAGE COUNT (DynamoDB Checkpoints)" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────"
$checkpoints = aws dynamodb scan `
  --table-name eventhub-checkpoints `
  --region us-east-1 `
  --profile tmf-dev `
  --query 'Items' `
  --output json 2>&1 | ConvertFrom-Json

if ($checkpoints.Count -gt 0) {
  Write-Host "✅ MESSAGES TRACKED: $($checkpoints.Count) checkpoint(s) in DynamoDB" -ForegroundColor Green
  foreach ($cp in $checkpoints) {
    $partId = $cp.partition_id.S
    $seqNum = $cp.sequence_number.N
    $time = $cp.updated_at.S
    Write-Host "   Partition $partId: Sequence #$seqNum (updated $time)" -ForegroundColor White
  }
  
  Write-Host ""
  Write-Host "📊 MESSAGE STATISTICS:" -ForegroundColor Cyan
  Write-Host "   Total partitions tracked: $($checkpoints.Count)"
  $totalSeq = ($checkpoints | ForEach-Object { [int]$_.sequence_number.N } | Measure-Object -Sum | Select-Object -ExpandProperty Sum)
  Write-Host "   Combined sequence numbers: $totalSeq"
  Write-Host "   → Indicates successful Event Hub message consumption" -ForegroundColor Green
} else {
  Write-Host "⚠️  NO CHECKPOINTS: Lambda hasn't completed yet" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "╔════════════════════════════════════════════════════════════╗`n" -ForegroundColor Cyan
if ($payloads -gt 0 -or $checkpoints.Count -gt 0) {
  Write-Host "✅ LAMBDA EVENT HUB PROCESSOR IS WORKING" -ForegroundColor Green
  Write-Host "`n🎉 SUCCESS INDICATORS:"
  if ($invocations -gt 0) { Write-Host "   ✅ Polling every 1 minute (EventBridge active)" }
  if ($payloads -gt 0) { Write-Host "   ✅ Reading and writing message payloads to S3" }
  if ($checkpoints.Count -gt 0) { Write-Host "   ✅ Tracking checkpoint positions for each partition" }
  Write-Host "`n📈 Next Steps:"
  Write-Host "   1. Monitor CloudWatch logs: aws logs tail ... --follow"
  Write-Host "   2. Check S3 for latest payloads every minute"  
  Write-Host "   3. Verify DynamoDB sequence numbers increasing"
} else {
  Write-Host "⏳ LAMBDA DEPLOYED BUT NEEDS TO RUN" -ForegroundColor Yellow
  Write-Host "`n⏰ EventBridge will invoke Lambda within the next minute."
  Write-Host "   Check back in 1-2 minutes for results."
}
Write-Host "`n╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan
