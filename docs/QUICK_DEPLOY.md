# Quick Deployment Guide — Unified Deployment Only

## ⚠️ CRITICAL: Read DEPLOYMENT_RULES.md First

**[📖 MANDATORY: Read DEPLOYMENT_RULES.md](./DEPLOYMENT_RULES.md)**

**ONLY DEPLOY FROM `iac/` FOLDER**

```
✅ CORRECT:   cd iac && terraform apply
❌ WRONG:     cd iac/azure && terraform apply
❌ WRONG:     cd iac/aws && terraform apply
```

Everything is in a single `iac/` folder. `iac/azure/` and `iac/aws/` are just **module subdirectories**, not separate deployments.

## Prerequisites

- Azure CLI logged in to correct tenant
- AWS CLI configured with `tmf-dev` profile
- `.env` files configured with application IDs
- Terraform initialized in `iac/` directory

## Deploy Unified Infrastructure (Azure + AWS Together)

### 1. Verify Tenant & Identity

```bash
# Verify Azure tenant
az account show --query "tenantId" --output tsv
# Should be: 62837751-4e48-4d06-8bcb-57be1a669b78

# Verify AWS account
aws sts get-caller-identity --profile tmf-dev
```

### 2. Configure Terraform

Edit `iac/terraform.tfvars` with your credentials:

```hcl
# Azure Graph API credentials
azure_graph_tenant_id     = "62837751-4e48-4d06-8bcb-57be1a669b78"
azure_graph_client_id     = "1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8"
azure_graph_client_secret = "<PASTE_CLIENT_SECRET_HERE>"

# AWS Lambda renewal schedule
renewal_schedule_expression = "cron(0 2 * * ? *)"  # 2 AM UTC daily
```

### 3. Plan Infrastructure

```bash
cd infra

# Initialize Terraform (one time)
terraform init

# Preview changes
terraform plan -out=tfplan
```

**Expected output:**

- 19 Azure resources to add (Event Hub, Bot Service, Storage, etc.)
- 74 AWS resources to add (Lambda, API Gateway, DynamoDB, etc.)

### 4. Deploy Infrastructure

```bash
# Deploy both Azure + AWS together
terraform apply tfplan
```

**This creates:**

**Azure:**

- Event Hub (webhook ingestion)
- Azure AD apps (Microsoft Graph authentication)
- Storage Account (payload archival)
- Key Vault (secrets storage)
- Application Insights (monitoring)
- Bot Service (Teams integration)

**AWS:**

- Lambda functions (webhook handler, subscription renewal)
- API Gateway (webhook endpoint)
- DynamoDB tables (subscriptions, checkpoints)
- S3 bucket (payload archival)
- EventBridge rules (scheduling)
- SNS topics (alerts)

### 5. Verify Deployment

```bash
# Show outputs
terraform output

# Key outputs to verify:
# - Azure Graph API app registered
# - Event Hub created
# - Lambda functions deployed
# - API Gateway webhook URL created
# - DynamoDB tables created
```

### 6. Test Webhook Endpoint

```powershell
# Get the API Gateway URL from Terraform output
$WEBHOOK_URL = terraform output -raw meeting_bot_webhook_url

# Test with curl
curl -X POST $WEBHOOK_URL `
  -H "Content-Type: application/json" `
  -d '{"text": "test"}'
```

### 7. Configure Teams Admin Policies (Post-Terraform)

```powershell
# Install PowerShell module (if needed)
Install-Module -Name MicrosoftTeams -Force

# Run setup script
.\scripts\setup-teams-policies.ps1 `
  -GroupId "5e7708f8-b0d2-467d-97f9-d9da4818084a" `
  -CatalogAppId "1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8"
```

Policies take 4-24 hours to propagate.

## ⛔ DO NOT Use These Commands

**NEVER run:**

- ❌ `cd iac/aws && terraform apply`
- ❌ `cd iac/azure && terraform apply`
- ❌ `cd iac/aws && terraform plan`
- ❌ `cd iac/azure && terraform plan`

These DEPRECATED folders create duplicate resources. If you did use them:

1. Delete duplicates from Azure Portal and AWS Console
2. Delete old state files: `rm -Force iac/aws/terraform.tfstate*`
3. Delete Terraform cache: `rm -Force iac/aws/.terraform`
4. Deploy correctly from `infra/` instead

## Testing

**Phase 1: Verify Infrastructure**

- Check Terraform outputs
- Verify resources in Azure Portal
- Verify Lambda in AWS Console

**Phase 2: Test Webhook**

- Send test event to API Gateway
- Check Lambda logs in CloudWatch
- Verify Event Hub receives messages

**Phase 3: Full Integration**

- Install Teams app
- Configure Teams policies
- Test subscription renewal
- Monitor DynamoDB tables

3. Update AWS infrastructure
4. Test Event Hub flow:
   - Create calendar event
   - Check Event Hub receives notification
   - Verify Lambda processes event
   - Confirm transcript saved to S3

##Files Already Built

- ✅ apps/aws-lambda/lambda.zip
- ✅ apps/aws-lambda-authorizer/authorizer.zip
- ✅ apps/aws-lambda-eventhub/lambda.zip

## Next Steps

1. Deploy unified infrastructure (Azure + AWS): `cd iac && terraform apply`
2. Test bot functionality
3. Wait for Azure AD permissions to propagate (~30 min)
4. Deploy Azure infrastructure
5. Test full Event Hub pipeline
