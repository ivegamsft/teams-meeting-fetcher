# EventHub E2E Testing Quick Start (PowerShell)
# Run this to execute the complete testing workflow

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "EventHub E2E Testing Quick Start" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Pre-flight checks
Write-Host "STEP 1: Running pre-flight checks..." -ForegroundColor Blue
Write-Host "Run this in your terminal:" -ForegroundColor Cyan
Write-Host "  python nobots-eventhub/scripts/list-subscriptions.py" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter after confirming subscription is active"

# Step 2: Setup monitoring terminals
Write-Host ""
Write-Host "STEP 2: Setup monitoring (3 terminals needed)" -ForegroundColor Blue
Write-Host ""
Write-Host "Terminal 1 - Event Hub Processor Logs:" -ForegroundColor Cyan
Write-Host "  aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --profile tmf-dev --region us-east-1" -ForegroundColor Yellow
Write-Host ""
Write-Host "Terminal 2 - Webhook Writer Logs:" -ForegroundColor Cyan
Write-Host "  aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev --region us-east-1" -ForegroundColor Yellow
Write-Host ""
Write-Host "Terminal 3 - DynamoDB Checkpoints:" -ForegroundColor Cyan
Write-Host "  # Run every 5 seconds:" -ForegroundColor Yellow
Write-Host "  aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1 --output table" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter once all 3 terminals are monitoring"

# Step 3: Create test meeting
Write-Host ""
Write-Host "STEP 3: Creating test meeting..." -ForegroundColor Blue
Push-Location nobots-eventhub/scripts
$timestamp = Get-Date -Format "HH:mm:ss"
python create-test-meeting.py --title "EventHub Test $timestamp" --minutes 60
Pop-Location

Write-Host ""
Write-Host "✓ Test meeting created!" -ForegroundColor Green
Write-Host ""
Write-Host "Watch the 3 terminal windows for:" -ForegroundColor Cyan
Write-Host "  • Processor logs: Should show 'Received X messages from partition Y'" -ForegroundColor Gray
Write-Host "  • Writer logs: Should show 'Uploading to S3...' and 'Updating checkpoint'" -ForegroundColor Gray
Write-Host "  • DynamoDB: Offset values should increase" -ForegroundColor Gray
Write-Host ""
Write-Host "Typical timeline:" -ForegroundColor Cyan
Write-Host "  0-30 sec:  Meeting created in Teams" -ForegroundColor Gray
Write-Host "  30-60 sec: EventBridge triggers Lambda" -ForegroundColor Gray
Write-Host "  60-90 sec: Lambda processes and stores data" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter once you see activity in the logs (usually 1-2 minutes)"

# Step 4: Verify S3
Write-Host ""
Write-Host "STEP 4: Verifying S3 payloads..." -ForegroundColor Blue
Write-Host "Run this command to see latest payload:" -ForegroundColor Cyan
Write-Host ""
Write-Host "`$latest = aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev `" -ForegroundColor Yellow
Write-Host "  --profile tmf-dev --region us-east-1 --prefix webhooks/ `" -ForegroundColor Yellow
Write-Host "  --query 'Contents | max_by(@, &LastModified).Key' --output text`n" -ForegroundColor Yellow
Write-Host "aws s3api get-object --bucket tmf-webhooks-eus-dev `" -ForegroundColor Yellow
Write-Host "  --key `$latest --profile tmf-dev --region us-east-1 payload.json`n" -ForegroundColor Yellow
Write-Host "cat payload.json | ConvertFrom-Json | ConvertTo-Json -Depth 5" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter after checking S3"

# Step 5: Verify DynamoDB
Write-Host ""
Write-Host "STEP 5: Final verification..." -ForegroundColor Blue
Write-Host "Run these commands to verify all data stored:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Checkpoints (offset should be > 0):" -ForegroundColor Yellow
Write-Host "  aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1 --output table" -ForegroundColor Gray
Write-Host ""
Write-Host "Graph Subscriptions (should show your subscription):" -ForegroundColor Yellow
Write-Host "  aws dynamodb scan --table-name graph_subscriptions --profile tmf-dev --region us-east-1 --output table" -ForegroundColor Gray
Write-Host ""

# Summary
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Testing Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Success indicators:" -ForegroundColor Cyan
Write-Host "  ✓ Processor logs show messages received" -ForegroundColor Green
Write-Host "  ✓ Writer logs show S3 upload & checkpoint update" -ForegroundColor Green
Write-Host "  ✓ DynamoDB checkpoints have data" -ForegroundColor Green
Write-Host "  ✓ S3 contains webhook payloads" -ForegroundColor Green
Write-Host ""
Write-Host "If all indicators are green, your EventHub scenario is working!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review MONITORING.md for operational guidance" -ForegroundColor Gray
Write-Host "  2. Set up CloudWatch alerts for production" -ForegroundColor Gray
Write-Host "  3. Deploy to production environment" -ForegroundColor Gray
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Cyan
Write-Host "  • README.md           - Overview and quick start" -ForegroundColor Gray
Write-Host "  • SETUP.md            - Prerequisites and configuration" -ForegroundColor Gray
Write-Host "  • TESTING.md          - Detailed testing procedures" -ForegroundColor Gray
Write-Host "  • MONITORING.md       - Operational monitoring and troubleshooting" -ForegroundColor Gray
Write-Host "  • DEPLOYMENT.md       - Infrastructure deployment guide" -ForegroundColor Gray
Write-Host ""
