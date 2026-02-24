---
description: Deploy unified infrastructure (Azure + AWS) and Lambda code with automated environment updates
---

## User Input

```text
$ARGUMENTS
```

You **MUST** acknowledge the user input before proceeding.

## Overview

This agent deploys the full AWS stack:

1. Verifies AWS credentials and account
2. Plans and applies Terraform infrastructure changes
3. Packages and uploads Lambda function code
4. Updates local `.env.local` from Terraform outputs
5. Validates the deployment with smoke tests

## Workflow

### Step 1: Pre-flight Verification

1. Verify AWS identity: `aws sts get-caller-identity --profile tmf-dev`
   - Confirm account ID and ARN match expected prod/dev
   - If credentials are wrong or expired, STOP and ask user to authenticate
2. Check Terraform state: `cd iac/aws && terraform state list` (or cloud state if remote)
   - If state is locked, ask user to resolve

### Step 2: Terraform Plan

1. Run `cd iac/aws && terraform init`
2. Run `terraform plan -out=tfplan`
3. Display a summary of:
   - Resources to **add** (new)
   - Resources to **change** (update in-place)
   - Resources to **destroy** (removed)
4. **If any destroys are planned, highlight prominently and ask for explicit confirmation**

### Step 3: Get User Approval

Show the plan summary and ask: "Do you want to apply this plan? (yes/no)"

**If user says no, stop here.**

### Step 4: Apply Terraform

1. Run `terraform apply tfplan`
2. Capture all outputs:
   - `api_webhook_url`
   - `lambda_function_name`
   - `bucket_name`
   - `authorizer_function_name`
   - [Any others]
3. Display outputs clearly

### Step 5: Package & Deploy Lambda

1. Package the main Lambda:

   ```powershell
   powershell -File apps/aws-lambda/package.ps1
   ```

2. Deploy the main Lambda:

   ```bash
   aws lambda update-function-code \
     --function-name <lambda_function_name from outputs> \
     --zip-file fileb://apps/aws-lambda/lambda.zip \
     --profile tmf-dev
   ```

3. Wait for update: `aws lambda wait function-updated --function-name <name> --profile tmf-dev`

4. If authorizer changed, deploy similarly from `apps/aws-lambda-authorizer/`

### Step 6: Update Local Environment

1. Run `powershell -File scripts/config/generate-aws-env.ps1`
2. Show the generated `.env.local` (with secrets redacted)
3. Confirm it looks correct

### Step 7: Validation Tests

1. Test webhook endpoint: `curl -s -o /dev/null -w "%{http_code}" <api_webhook_url>`
   - Expect 401/403 (no auth) — confirms API Gateway is alive

2. Check Lambda config:

   ```bash
   aws lambda get-function-configuration --function-name <name> --profile tmf-dev \
     --query "Runtime,Handler,MemorySize,Timeout"
   ```

3. Optional: Run `python scripts/graph/06-test-webhook.py`

### Step 8: Summary Report

Display a deployment summary:

```
✅ DEPLOYMENT COMPLETE

📦 Infrastructure:
  - 3 resources created
  - 2 resources updated
  - 0 resources destroyed

🔧 Lambda:
  - Function: <name>
  - Version: <latest>
  - Code deployed: Yes

📍 Outputs:
  - Webhook URL: <api_webhook_url>
  - S3 Bucket: <bucket_name>

✅ Validation: All tests passed
✅ Env file updated: .env.local
📝 Next steps: ...
```

## Rules

- **Always use `--profile tmf-dev`** for AWS CLI commands
- **Never apply without showing the plan first**
- **If plan shows no changes, skip apply** and just deploy Lambda code
- **Highlight resource destroys** — require explicit approval
- The Lambda runtime is **Node.js 18**
- Do not modify `terraform.tfvars` — only `terraform.tfvars.example` can be committed
