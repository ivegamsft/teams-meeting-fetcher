# Deploy Event Hub Processor Lambda
# This script applies terraform changes to create the Event Hub processor Lambda function

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Event Hub Processor Lambda Deployment" -ForegroundColor Cyan  
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Change to iac directory
Set-Location $PSScriptRoot

# Run terraform plan
Write-Host "[1/4] Running terraform plan..." -ForegroundColor Yellow
terraform plan -out=tfplan-deploy > plan-output.txt 2>&1
$planExitCode = $LASTEXITCODE

if ($planExitCode -ne 0) {
    Write-Host "ERROR: Terraform plan failed!" -ForegroundColor Red
    Get-Content plan-output.txt | Select-String "Error" -Context 2,2
    exit 1
}

# Check if Lambda is in plan
$lambdaInPlan = Select-String -Path plan-output.txt -Pattern "eventhub_processor.aws_lambda_function.eventhub"
if ($lambdaInPlan) {
    Write-Host "✓ Lambda function found in plan" -ForegroundColor Green
} else {
    Write-Host "WARNING: Lambda function not found in plan!" -ForegroundColor Yellow
    Write-Host "Plan summary:"
    Select-String -Path plan-output.txt -Pattern "Plan:"
}

Write-Host ""

# Run terraform apply
Write-Host "[2/4] Running terraform apply..." -ForegroundColor Yellow
terraform apply tfplan-deploy > apply-output.txt 2>&1
$applyExitCode = $LASTEXITCODE

if ($applyExitCode -ne 0) {
    Write-Host "ERROR: Terraform apply failed!" -ForegroundColor Red
    Get-Content apply-output.txt | Select-String "Error" -Context 2,2
    exit 1
}

Write-Host  "✓ Terraform apply completed" -ForegroundColor Green
Write-Host ""

# Check if Lambda was created
Write-Host "[3/4] Checking terraform state..." -ForegroundColor Yellow
$stateResources = terraform state list | Select-String "eventhub_processor"

if ($stateResources) {
    Write-Host "✓ Event Hub processor resources in state:" -ForegroundColor Green
    $stateResources | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
} else {
    Write-Host "WARNING: No eventhub_processor resources found in state!" -ForegroundColor Yellow
}

Write-Host ""

# Verify Lambda in AWS
Write-Host "[4/4] Verifying Lambda in AWS..." -ForegroundColor Yellow
$lambdaCheck = aws lambda get-function `
    --function-name tmf-eventhub-processor-dev `
    --profile tmf-dev `
    --region us-east-1 `
    --query "Configuration.{Name:FunctionName,Runtime:Runtime,Handler:Handler}" `
    --output json 2>&1 | ConvertFrom-Json

if ($lambdaCheck.Name) {
    Write-Host "✓ Lambda function exists in AWS!" -ForegroundColor Green
    Write-Host "  Name:    $($lambdaCheck.Name)" -ForegroundColor Gray
    Write-Host "  Runtime: $($lambdaCheck.Runtime)" -ForegroundColor Gray
    Write-Host "  Handler: $($lambdaCheck.Handler)" -ForegroundColor Gray
} else {
    Write-Host "ERROR: Lambda function not found in AWS!" -ForegroundColor Red
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Deployment Complete" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
