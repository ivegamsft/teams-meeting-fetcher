#!/usr/bin/env pwsh

$ErrorActionPreference = "Continue"
$OutputFile = "lambda-diagnostics-output.txt"

"Lambda EventHub Processor Diagnostics - $(Get-Date)" | Out-File $OutputFile

"" | Out-File $OutputFile -Append
"=== TEST 1: S3 Bucket Check ===" | Out-File $OutputFile -Append
aws s3 ls s3://tmf-webhooks-eus-dev/eventhub/ --profile tmf-dev --region us-east-1 --recursive 2>&1 | Out-File $OutputFile -Append

"" | Out-File $OutputFile -Append
"=== TEST 2: DynamoDB Checkpoints ===" | Out-File $OutputFile -Append
aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1 2>&1 | Out-File $OutputFile -Append

"" | Out-File $OutputFile -Append
"=== TEST 3: Lambda Direct Invoke ===" | Out-File $OutputFile -Append
aws lambda invoke --function-name tmf-eventhub-processor-dev --profile tmf-dev --region us-east-1 response.json 2>&1 | Out-File $OutputFile -Append
"Response:" | Out-File $OutputFile -Append
Get-Content response.json 2>&1 | Out-File $OutputFile -Append

Write-Host "Diagnostics complete! Results in: $OutputFile"
Write-Host "Opening file..."
code $OutputFile
