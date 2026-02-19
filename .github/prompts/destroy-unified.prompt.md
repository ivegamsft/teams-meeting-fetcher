# Destroy Infrastructure (Unified)

Safely tear down all Azure and AWS infrastructure.

## Context

This prompt destroys all resources created by the unified deployment. Use this for cleanup, cost management, or before redeploying from scratch.

## ⚠️ WARNING

This is a **destructive operation** that will:

- Delete ALL Azure resources (Event Hub, Storage, Key Vault, App Registrations)
- Delete ALL AWS resources (Lambda, S3, DynamoDB, API Gateway)
- Remove all data stored in S3 buckets and DynamoDB tables
- Revoke all service principals and permissions

**Data loss is permanent and cannot be undone.**

## Prerequisites

- ✅ Terraform state exists in `infra/`
- ✅ You have confirmed you want to destroy everything
- ✅ You have backed up any important data

## Prompt

I need to destroy all infrastructure for Teams Meeting Fetcher.

**Before destruction:**

1. Backup any critical data:
   - DynamoDB tables (subscriptions, meetings, checkpoints)
   - S3 webhook payloads
   - CloudWatch logs

2. Export Terraform outputs for reference:
   ```powershell
   cd infra
   terraform output > pre-destroy-outputs.txt
   ```

**Destruction steps:**

1. Navigate to `infra/` directory
2. Review what will be destroyed: `terraform plan -destroy`
3. Confirm the resource count matches what was deployed (~93 resources)
4. Destroy all resources: `terraform destroy`
5. Review the destruction log for any errors

**Expected behavior:**

- AWS resources will be destroyed first (due to dependency on Azure outputs)
- Azure resources will be destroyed second
- Some resources may take time to delete (Key Vault soft delete, etc.)

**If destruction fails:**

1. Note which resource failed
2. Manually delete the blocking resource in Azure Portal or AWS Console
3. Re-run `terraform destroy`

**After destruction:**

1. Verify all resources are gone:
   - Check Azure Portal for resource group
   - Check AWS Console for Lambda functions, S3 buckets, DynamoDB tables

2. Clean up Terraform state:

   ```powershell
   rm -r .terraform
   rm .terraform.lock.hcl
   rm terraform.tfstate*
   ```

3. Optionally delete service principal (manual step):
   ```powershell
   az ad sp delete --id <service_principal_id>
   ```

**What will remain (manual cleanup needed):**

- Azure Service Principal used by Terraform
- AWS IAM user/role used by Terraform
- Local Lambda package files
- Terraform state backup files

Proceed with infrastructure destruction and confirm when complete.
