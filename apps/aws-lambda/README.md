# AWS Lambda Webhook Stub

This Lambda function receives Microsoft Graph webhook payloads and stores them in S3.

## Files

- `handler.js` - Lambda entry point
- `test-event.json` - API Gateway proxy event for local testing
- `sample-webhook.json` - Sample Graph webhook payload (body)
- `package.ps1` - PowerShell packaging helper
- `package.sh` - Bash packaging helper

## Environment Variables

- `BUCKET_NAME` - S3 bucket name where payloads are stored

## Packaging

Create a zip package for deployment:

```bash
# From repo root
cd apps/aws-lambda
./package.sh
```

```powershell
# From repo root
Set-Location apps/aws-lambda
./package.ps1
```

The Terraform in `iac/aws` references this zip file.

## Local Test

Use the test event file with AWS SAM or local Lambda runner:

```bash
node -e "const fn=require('./handler').handler; const fs=require('fs'); const evt=JSON.parse(fs.readFileSync('test-event.json','utf8')); fn(evt,{awsRequestId:'local'}).then(console.log).catch(console.error)"
```
