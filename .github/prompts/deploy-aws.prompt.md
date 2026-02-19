# Deploy AWS — Infrastructure + Lambda Code

⚠️ **DEPRECATED — USE `deploy-unified.prompt.md` INSTEAD**

This prompt references the old separate `iac/aws/` folder which is **DEPRECATED** and will create duplicate resources.

## ⛔ DO NOT USE THIS PROMPT

**INSTEAD: Use [deploy-unified.prompt.md](deploy-unified.prompt.md) to deploy from the `infra/` directory.**

The old `iac/aws/` folder will cause:

- ❌ Duplicate Lambda functions
- ❌ Duplicate API Gateways
- ❌ Duplicate DynamoDB tables
- ❌ Conflicting Terraform state
- ❌ Unnecessary AWS costs

## Correct Approach

```bash
cd infra
terraform plan -out=tfplan
terraform apply tfplan
```

See [deploy-unified.prompt.md](deploy-unified.prompt.md) for complete instructions.

---

## Legacy Content (DO NOT USE)

For reference only. This section describes the old approach:

### Step 1: Verify AWS Identity

```bash
aws sts get-caller-identity --profile tmf-dev
```

Confirm the account and ARN look correct. If the credentials are expired or wrong, stop and ask me to re-authenticate.

### Step 2: Terraform Init & Plan

```bash
cd iac/aws
terraform init
terraform plan -out=tfplan
```

Display a summary of changes:

- Resources to **add** (new)
- Resources to **change** (update in-place)
- Resources to **destroy** (removed)

If there are any **destroys**, highlight them prominently and ask for explicit confirmation.

### Step 3: Apply Infrastructure

After I approve:

```bash
terraform apply tfplan
```

Capture and display the outputs:

- `api_webhook_url`
- `lambda_function_name`
- `s3_bucket_name`
- `authorizer_function_name`

### Step 4: Package & Deploy Lambda Code

1. Package the Lambda handler:
   ```powershell
   powershell -File apps/aws-lambda/package.ps1
   ```
2. Deploy the main Lambda:
   ```bash
   aws lambda update-function-code \
     --function-name <lambda_function_name from Step 3> \
     --zip-file fileb://apps/aws-lambda/lambda.zip \
     --profile tmf-dev
   ```
3. Wait for the update:
   ```bash
   aws lambda wait function-updated --function-name <name> --profile tmf-dev
   ```
4. If the authorizer Lambda also changed, deploy it similarly from `apps/aws-lambda-authorizer/`.

### Step 5: Update Local Environment

Run the env generator to sync `.env.local` with the latest Terraform outputs:

```powershell
powershell -File scripts/generate-aws-env.ps1
```

Show me the generated file (redacting any secrets) and confirm it looks correct.

### Step 6: Post-Deploy Validation

1. Test the webhook endpoint responds:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" <api_webhook_url>
   ```

   (Expect 401 or 403 since no auth token — confirms API Gateway is alive.)

2. Check Lambda function configuration is correct:

   ```bash
   aws lambda get-function-configuration --function-name <name> --profile tmf-dev --query "Runtime,Handler,MemorySize,Timeout"
   ```

3. Optionally run: `python scripts/graph/06-test-webhook.py`

### Step 7: Summary

Display a deployment summary:

- Terraform resources created/updated
- Lambda function version deployed
- API Gateway webhook URL
- S3 bucket name
- `.env.local` updated: yes/no
- Any warnings or follow-up actions

### Rules

- **Always** use `--profile tmf-dev` for all AWS CLI commands.
- **Never** deploy without showing the plan first.
- If `terraform plan` shows no changes, skip apply and just deploy Lambda code.
- The Lambda runtime is Node.js 18.
- Do not modify `terraform.tfvars` — only `terraform.tfvars.example` is committed.
