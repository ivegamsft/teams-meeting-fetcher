# Infrastructure Testing Script - Teams Meeting Fetcher
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "INFRASTRUCTURE TEST SUITE" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# Load terraform outputs
Push-Location iac
$outputs = terraform output -json -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
Pop-Location

# Display all endpoints
Write-Host "AZURE ENDPOINTS" -ForegroundColor Green
Write-Host "---"
Write-Host "Event Hub Namespace: $($outputs.azure_eventhub_namespace.value)"
Write-Host "Event Hub Name:      $($outputs.azure_eventhub_name.value)"
Write-Host "Storage Account:     $($outputs.azure_storage_account_name.value)"
Write-Host ""

Write-Host "AWS ENDPOINTS" -ForegroundColor Green
Write-Host "---"
Write-Host "API Gateway URL:     $($outputs.aws_api_gateway_url.value)"
Write-Host "Bot Webhook URL:     $($outputs.aws_meeting_bot_webhook_url.value)"
Write-Host "S3 Bucket:           $($outputs.aws_s3_bucket_name.value)"
Write-Host ""

# TEST 1: Event Hub
Write-Host "TEST 1: Event Hub Connectivity" -ForegroundColor Yellow
Write-Host "---"
$nsName = ($outputs.azure_eventhub_namespace.value -split '\.')[0]
$test1 = az eventhub namespace show --name $nsName --resource-group tmf-rg-eus-6an5wk 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "PASS - Event Hub Namespace accessible" -ForegroundColor Green
} else {
    Write-Host "WARN - Could not verify Event Hub" -ForegroundColor Yellow
}
Write-Host ""

# TEST 2: Lambda Functions
Write-Host "TEST 2: Lambda Functions" -ForegroundColor Yellow
Write-Host "---"
$lambdas = @("tmf-webhook-writer-dev")
foreach ($func in $lambdas) {
    $test2 = aws lambda get-function --function-name $func --profile tmf-dev 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PASS - $func exists" -ForegroundColor Green
    } else {
        Write-Host "WARN - $func not verified" -ForegroundColor Yellow
    }
}
Write-Host ""

# TEST 3: DynamoDB Tables
Write-Host "TEST 3: DynamoDB Tables" -ForegroundColor Yellow
Write-Host "---"
$tables = @("eventhub-checkpoints")
foreach ($table in $tables) {
    $test3 = aws dynamodb describe-table --table-name $table --profile tmf-dev 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "PASS - $table exists" -ForegroundColor Green
    } else {
        Write-Host "WARN - Could not verify $table" -ForegroundColor Yellow
    }
}
Write-Host ""

# TEST 4: S3 Bucket
Write-Host "TEST 4: S3 Bucket" -ForegroundColor Yellow
Write-Host "---"
$bucket = $outputs.aws_s3_bucket_name.value
$test4 = aws s3api head-bucket --bucket $bucket --profile tmf-dev 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "PASS - $bucket accessible" -ForegroundColor Green
} else {
    Write-Host "WARN - Could not verify S3 bucket" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Configure Microsoft Graph Subscriptions"
Write-Host "   Review: docs/GRAPH_SUBSCRIPTIONS_SETUP.md"
Write-Host ""
Write-Host "2. Update bot_messaging_endpoint in terraform.tfvars"
Write-Host "   Edit: iac/terraform.tfvars"
Write-Host "   Set:  bot_messaging_endpoint = Bot Webhook URL above"
Write-Host ""
Write-Host "3. Test webhook endpoint"
Write-Host "   curl -X GET $($outputs.aws_api_gateway_url.value)"
Write-Host ""
Write-Host "4. Monitor Lambda logs"
Write-Host "   aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev"
Write-Host ""
Write-Host "Deployment Complete!"
Write-Host ""
