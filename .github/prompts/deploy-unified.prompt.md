# Deploy Infrastructure (Unified)

Deploy both Azure and AWS infrastructure in a single command.

## ⚠️ CRITICAL WARNINGS

**ONLY deploy from `iac/` directory (root). DO NOT use `iac/aws/` or `iac/azure/` subdirectories.**

Those subdirectories are **module libraries only**, not deployment targets. Deploying from them causes:

- ❌ Separate, conflicting Terraform states
- ❌ Deployments that fail mid-way
- ❌ Resources that can't be managed together

All deployment files are now consolidated in the `iac/` root directory.

## Context

This prompt deploys the complete Teams Meeting Fetcher infrastructure using the unified Terraform configuration in `iac/`. It handles all dependencies automatically - Azure resources are created first, then their outputs are used to configure AWS resources.

**This is the ONLY supported deployment method.**

## Prerequisites

- ✅ Azure Service Principal created (run `bootstrap-azure-spn.prompt.md` first)
- ✅ AWS credentials configured (run `bootstrap-aws-iam.prompt.md` first)
- ✅ Lambda packages built:
  - `apps/aws-lambda/lambda.zip`
  - `apps/aws-lambda-authorizer/authorizer.zip`
  - `apps/aws-lambda-eventhub/lambda.zip`
- ✅ `iac/terraform.tfvars` configured with correct values
- ✅ Verified correct tenant ID: `62837751-4e48-4d06-8bcb-57be1a669b78`

## Quick Build Lambda Packages

If packages don't exist:

```powershell
# Main Lambda
cd apps/aws-lambda
npm install
.\package.ps1

# Authorizer
cd ../aws-lambda-authorizer
npm install
.\package.ps1

# Event Hub processor
cd ../aws-lambda-eventhub
npm install
.\package.ps1
```

## Prompt

I need to deploy the complete Teams Meeting Fetcher infrastructure using the unified Terraform configuration.

**IMPORTANT: All commands below MUST run from `iac/` root directory. `iac/aws/` and `iac/azure/` are modules only.**

**Steps:**

1. Navigate to `iac/` directory: `cd iac/`
2. Remove any stale plans: `rm -Force tfplan tfplan*` (PowerShell) or `rm tfplan* 2>/dev/null` (Bash)
3. Initialize Terraform: `terraform init`
4. Create deployment plan: `terraform plan -out=tfplan`
5. Review the plan (should show ~93 resources: 19 Azure + 74 AWS)
6. Apply the plan: `terraform apply tfplan`
7. Save all outputs for reference

**What will be deployed:**

**Azure Resources (19):**

- App Registrations (Graph API + Bot) with service principals
- Admin Security Group
- Event Hub namespace + hub with authorization rules
- Event Grid topic
- Azure Key Vault with RBAC
- Storage Account with blob container
- Application Insights + Log Analytics Workspace

**AWS Resources (74):**

- S3 bucket for webhook payloads
- DynamoDB tables (subscriptions, checkpoints, meetings)
- Lambda functions:
  - Webhook processor
  - API Gateway authorizer
  - Event Hub processor (polls Azure Event Hub)
  - Meeting bot
  - Subscription renewal
- API Gateway (REST APIs for webhooks and bot)
- EventBridge schedules (meeting poll, Event Hub poll, renewal)
- SNS topic for notifications
- IAM roles and policies
- CloudWatch log groups

**After deployment:**

1. Get the bot webhook URL:

   ```powershell
   terraform output aws_meeting_bot_webhook_url
   ```

2. Update Azure bot messaging endpoint if needed:
   - Edit `iac/terraform.tfvars`
   - Set `bot_messaging_endpoint` to the webhook URL
   - Re-run `terraform apply`

3. Verify Event Hub integration:

   ```powershell
   terraform output azure_eventhub_connection_string
   ```

4. Get deployment summary:
   ```powershell
   terraform output deployment_summary
   ```

**Troubleshooting:**

If you see Azure AD permission errors:

1. Run `.\scripts\grant-terraform-ad-permissions.ps1`
2. Wait 15-30 minutes for permission propagation
3. Retry deployment

If Lambda package is missing:

1. Build the package (see commands above)
2. Verify path in `terraform.tfvars` matches actual file location

**Expected Outcomes:**

- ✅ Azure Event Hub created and accessible
- ✅ AWS Lambda can authenticate with Azure Event Hub
- ✅ Bot webhook URL ready for Teams configuration
- ✅ All monitoring and logging configured
- ✅ Subscription renewal scheduled
- ✅ Event Hub checkpointing enabled

Deploy the infrastructure and provide a summary of what was created.
