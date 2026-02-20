# Deployment Guide — UNIFIED

## ⚠️ CRITICAL: Use Unified `infra/` Directory Only

**ALWAYS deploy from the `infra/` folder.** Do NOT use `iac/aws/` or `iac/azure/` (deprecated).

See `.github/copilot-instructions.md` for detailed unified deployment rules.

## Prerequisites

- Azure app registration with Graph API permissions
- AWS CLI configured with `tmf-dev` profile
- Terraform >= 1.0
- Python 3.11+

## 1. Set Credentials in Terraform

Update `infra/terraform.tfvars` with your Azure credentials:

```hcl
# Azure Graph API credentials (from Azure IaC outputs)
azure_graph_tenant_id     = "<terraform output app_tenant_id>"
azure_graph_client_id     = "<terraform output app_client_id>"
azure_graph_client_secret = "<terraform output app_client_secret>"
renewal_schedule_expression = "cron(0 2 * * ? *)"  # 2 AM UTC daily
```

## 2. Deploy Infrastructure (Unified)

```bash
# ALWAYS use the infra/ folder — NEVER use iac/aws/ or iac/azure/
cd infra

# Initialize Terraform
terraform init

# Preview changes
terraform plan -out=tfplan

# Deploy both Azure + AWS together
terraform apply tfplan
```

This creates:

**Azure (19 resources):**

- Event Hub (webhook ingestion)
- Azure AD apps (Microsoft Graph authentication)
- Storage Account (webhook payload archival)
- Key Vault (secrets storage)
- Application Insights (monitoring)
- Bot Service (Teams integration)

**AWS (74 resources):**

- **DynamoDB table**: `graph-subscriptions` (stores subscription metadata and renewal tracking)
- **Lambda function**: Renewal handler (runs daily at 2 AM UTC to renew expiring subscriptions)
- **EventBridge rule**: Triggers Lambda on schedule
- **CloudWatch logs**: Lambda execution logs (14-day retention)
- **CloudWatch alarm**: Alerts on renewal failures
- **API Gateway**: Webhook endpoint for Teams bot
- **S3 bucket**: Webhook payload archival

## 3. Configure Teams Admin Policies (post-Terraform)

Teams admin policies cannot be managed via Terraform — they require the MicrosoftTeams
PowerShell module. Run this **once** after `terraform apply`:

```powershell
# Install the module (if needed)
Install-Module -Name MicrosoftTeams -Force -Scope CurrentUser

# Run the setup script
.\scripts\setup\setup-teams-policies.ps1 `
  -GroupId "<SECURITY-GROUP-OBJECT-ID>" `
  -CatalogAppId "<TEAMS-CATALOG-APP-ID>" `
  -BotAppId "<BOT-APP-ID>"
```

This configures three policies:

| Policy                                                | Purpose                                               | Scope          |
| ----------------------------------------------------- | ----------------------------------------------------- | -------------- |
| **App Setup Policy** "Recorded Line"                  | Auto-installs Meeting Fetcher for group members       | Security group |
| **Meeting Policy** "Recorded Line"                    | Enforces auto-recording + transcription               | Security group |
| **Application Access Policy** "MeetingFetcher-Policy" | Grants bot Graph API access to users' online meetings | Global         |

> **⏱️ Propagation:** App Setup and Meeting policies take 4–24 hours. Application Access Policy takes up to 30 minutes.

See [docs/TEAMS-ADMIN-POLICIES.md](docs/TEAMS-ADMIN-POLICIES.md) for manual steps and troubleshooting.

## 4. Save Current Subscriptions to DynamoDB

After Terraform deployment, record your existing Graph API subscriptions:

```bash
python scripts/aws/subscription-tracker.py save \
  --id "<CALENDAR_SUBSCRIPTION_ID>" \
  --resource "users/<YOUR_EMAIL>/events" \
  --expiry "<EXPIRY_DATETIME>" \
  --type "calendar"

python scripts/aws/subscription-tracker.py save \
  --id "<TRANSCRIPT_SUBSCRIPTION_ID>" \
  --resource "users/<YOUR_EMAIL>/onlineMeetings/getAllTranscripts(...)" \
  --expiry "<EXPIRY_DATETIME>" \
  --type "transcript"
```

## 5. Verify Deployment

```bash
# List subscriptions in DynamoDB
python scripts/aws/subscription-tracker.py list

# Monitor Lambda logs
aws logs tail /aws/lambda/tmf-subscription-renewal-dev --follow --profile tmf-dev
```

## ⛔ DO NOT Use These (Deprecated)

**NEVER run these commands:**

- ❌ `cd iac/aws && terraform apply`
- ❌ `cd iac/azure && terraform apply`

These will create duplicate resources and break the deployment. If you did use them, immediately:

1. Delete duplicate resources from Azure Portal and AWS Console
2. Run `rm -Force terraform.tfstate*` and `rm -Force .terraform` in those folders
3. Deploy correctly from `infra/` instead

## 6. Monitor Renewals

Lambda runs automatically daily at 2 AM UTC:

- Queries DynamoDB for subscriptions expiring within 2 days
- Calls Graph API PATCH to each subscription
- Updates DynamoDB with new expiry dates
- Logs results to CloudWatch

Check renewal status:

```bash
aws logs tail /aws/lambda/tmf-subscription-renewal-dev --since 5m --profile tmf-dev
```

## Troubleshooting

**Lambda not running?**

- Check EventBridge rule exists: `terraform output renewal_eventbridge_rule_name`
- Check Lambda permissions: Look for `AllowEventBridgeInvoke` in IAM

**Credentials not working?**

- Verify client secret in Secrets Manager: `aws secretsmanager get-secret-value --secret-id graph-client-secret --profile tmf-dev`
- Check Graph API token generation with: `python scripts/graph/01-verify-setup.py`

**Subscriptions not renewing?**

- Check Lambda logs: `aws logs tail /aws/lambda/tmf-subscription-renewal-dev --profile tmf-dev`
- Verify DynamoDB table created: `aws dynamodb list-tables --profile tmf-dev | grep graph-subscriptions`

## Rollback

To remove all infrastructure:

```bash
cd iac/aws
terraform destroy
```
