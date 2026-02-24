# Deployment Pipeline Analysis: App Registration is Terraform-Managed

**By:** Fenster (DevOps/Infra)
**Date:** 2026-02-25

## Decision

The Azure AD app registrations (Teams Meeting Fetcher, Teams Meeting Fetcher Bot, Lambda EventHub Consumer) are **created by Terraform**, not manually. They are NOT deployment prerequisites.

## Evidence

1. `iac/azure/modules/azure-ad/main.tf` contains three `azuread_application` resources:
   - `azuread_application.tmf_app` — Main Graph API app (6 permissions: Calendars.ReadWrite, OnlineMeetingTranscript.Read.All, OnlineMeetingRecording.Read.All, OnlineMeetings.ReadWrite.All, Group.Read.All, User.Read.All)
   - `azuread_application.tmf_bot_app` — Bot app (multi-tenant, 5 Graph permissions)
   - `azuread_application.tmf_lambda_app` — Lambda EventHub Consumer (read-only)

2. Each app gets a `azuread_service_principal` and `azuread_application_password` created automatically.

3. Root `iac/main.tf` passes Azure module outputs (`app_client_id`, `app_client_secret`, `bot_app_client_id`, `lambda_client_id`, etc.) directly into the AWS module — no manual credential copying.

## Correct Prerequisites (Before `terraform apply`)

| Prerequisite | Type | Purpose |
|---|---|---|
| AWS OIDC Provider + IAM Role | Manual (one-time) | GitHub Actions OIDC auth to AWS |
| Terraform State Backend (S3 + DynamoDB) | Manual (one-time) | Remote state storage |
| Azure Deployment SPN | Manual (one-time) | Terraform executor identity (OIDC for CI/CD, client_secret for local) |
| Azure Deployment SPN Permissions | Manual (one-time) | Contributor on subscription + Azure AD permissions (Application.ReadWrite.OwnedBy, Group.ReadWrite.All) |
| GitHub Secrets/Variables | Manual (one-time) | Workflow configuration |
| Lambda Zip Packages | Build step | Lambda code artifacts |
| `terraform.tfvars` | Manual | Deployment configuration |

## Post-Deploy Manual Steps

1. **Grant admin consent** for Graph API permissions on the Terraform-created app registrations (admin consent URL or Azure Portal)
2. **Update `bot_messaging_endpoint`** in `terraform.tfvars` with the API Gateway URL from Terraform outputs (chicken-and-egg: first deploy creates the URL)
3. **Update `graph_notification_url`** with the webhook endpoint URL
4. **Add users to the admin security group** created by Terraform

## Documentation Impact

- `scenarios/nobots-eventhub/QUICKSTART.md` incorrectly lists "Azure AD app registration" as a prerequisite — should clarify this means the deployment SPN, not the application app registration
- `DEPLOYMENT_PREREQUISITES.md` section 3 is about the deployment SPN (correct) but could be clearer that this is distinct from the Terraform-created application app registrations
- All agents: When discussing "app registration", distinguish between the deployment SPN (prerequisite) and the application app registrations (Terraform-managed)

## Deployment Sequence (Correct)

1. Bootstrap AWS OIDC + IAM role
2. Bootstrap Terraform state backend
3. Create Azure deployment SPN with OIDC federated credentials
4. Configure GitHub secrets/variables
5. Build Lambda packages
6. `terraform init` (with backend config)
7. `terraform apply` from `iac/` root
   - Azure module runs first: creates Resource Group, 3 App Registrations + SPNs, Key Vault, Storage, EventHub, Bot Service, RBAC
   - AWS module runs second: creates S3, DynamoDB, Lambdas, API Gateways, EventBridge (using Azure outputs)
8. Grant admin consent for Graph API permissions
9. Update `terraform.tfvars` with API Gateway URLs from outputs, re-apply
