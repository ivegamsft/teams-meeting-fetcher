# Copilot Instructions for Teams Meeting Fetcher

## ⚠️ CRITICAL: Unified Deployment Only

**ALWAYS use `iac/` folder for Terraform deployments.** This is the ONLY source of truth for infrastructure.

### DO NOT USE:

- ❌ `iac/aws/` subfolder - MODULES ONLY (use iac/ root for deployment)
- ❌ `iac/azure/` subfolder - MODULES ONLY (use iac/ root for deployment)

The `iac/azure` and `iac/aws` subfolders are **module libraries only**. The root `iac/` folder contains the unified deployment orchestration.

**SEE: [../DEPLOYMENT_RULES.md](../DEPLOYMENT_RULES.md) for mandatory rules**

## Unified Deployment Structure

```
iac/                          ← DEPLOY FROM HERE (orchestration + all modules)
├── main.tf                     Calls: ./azure + ./aws
├── terraform.tfvars            Single configuration file
├── terraform.tfstate           Unified state for all resources
│
├── azure/                      Module subdirectory
│   ├── main.tf
│   └── modules/
│
└── aws/                        Module subdirectory
    ├── main.tf
    └── modules/
```

## Tenant Validation Rule

**Before running ANY Azure CLI (`az`), Azure PowerShell, or Terraform command that modifies Azure resources, ALWAYS verify the active tenant:**

```bash
az account show --query "tenantId" --output tsv
```

The expected tenant ID is `62837751-4e48-4d06-8bcb-57be1a669b78` (GRAPH_TENANT_ID in .env).

- If the tenant does NOT match, **STOP** and ask the user to log in to the correct tenant.
- Do NOT proceed with any Azure modifications on the wrong tenant.
- The AWS profile for this project is `tmf-dev` (us-east-1).

## Graph Subscriptions Setup

**CRITICAL:** Before creating Graph subscriptions, read: [docs/GRAPH_SUBSCRIPTIONS_SETUP.md](../docs/GRAPH_SUBSCRIPTIONS_SETUP.md)

**Key rules:**

- ✅ Subscriptions MUST target GROUP resource: `/groups/5e7708f8-b0d2-467d-97f9-d9da4818084a`
- ❌ Never use individual user paths: `/users/user@domain.com/events`
- ✅ Event Hub URL format MUST include `/eventhubname/` path segment and `?tenantId=<domain>`
- ❌ Missing `/eventhubname/` or `tenantId` will cause 400 ValidationError from Graph API
- Graph Change Tracking SPN must have:
  - "Azure Event Hubs Data Sender" role on Event Hub namespace
  - "Storage Blob Data Contributor" role on storage account (for rich notifications)

**If creating subscriptions, always:**

1. Verify tenant is correct
2. Ensure resource is a group path, not user path
3. Use exact Event Hub URL format (see GRAPH_SUBSCRIPTIONS_SETUP.md)
4. Restart processor after subscription created: `npm run process`

## Deployment Checklist

Always deploy from the root `iac/` folder:

```bash
# ✅ CORRECT ALWAYS
cd iac
terraform plan
terraform apply

# ❌ WRONG - These are just modules
cd iac/azure
terraform apply

# ❌ WRONG - These are just modules
cd iac/aws
terraform apply
```

## Key Resource IDs (from iac/ deployment)

- **Graph API App ID**: `1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8`
- **Tenant ID**: `62837751-4e48-4d06-8bcb-57be1a669b78`
- **Allowed Group ID**: `5e7708f8-b0d2-467d-97f9-d9da4818084a`
- **Event Hub Namespace**: `tmf-ehns-eus-6an5wk`
- **Event Hub Name**: `tmf-eh-eus-6an5wk`

## Architecture

- **Runtime**: AWS Lambda (Node.js 18) behind API Gateway (REST) + Azure Bot Service
- **Orchestration**: Single Terraform deployment in `iac/` manages both clouds
- **Infrastructure**: 19 Azure resources + 74 AWS resources (unified deployment)
- **State**: Single `iac/terraform.tfstate` for all resources

## Preventing Duplicate Deployments

✅ **Always**: `cd iac` before running terraform commands (root folder, not subfolders)
✅ **Always**: Run `terraform plan` before `terraform apply`
✅ **Always**: Check the output matches your deployment goals
❌ **Never**: `cd iac/aws`, `cd iac/azure`, or deploy from module subdirectories
❌ **Never**: Deploy Azure or AWS separately

See [../DEPLOYMENT_RULES.md](../DEPLOYMENT_RULES.md) for complete rules.
