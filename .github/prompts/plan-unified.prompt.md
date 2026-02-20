# Plan Infrastructure Changes (Unified)

Preview infrastructure changes before applying them.

## ⚠️ CRITICAL: Only Use `infra/`

**NEVER run `terraform plan` from `iac/aws/` or `iac/azure/` folders.**

These old folders are DEPRECATED and will create duplicate resources. Always use `infra/` as the single source of truth.

## Context

This prompt generates a Terraform plan for the unified deployment, showing what will be created, modified, or destroyed. Use this to review changes before applying them.

## Prerequisites

- ✅ `infra/terraform.tfvars` exists and is configured
- ✅ Terraform initialized (`terraform init`)
- ✅ Running from `infra/` directory (not `iac/aws/` or `iac/azure/`)

## Prompt

I need to review infrastructure changes before deploying.

**IMPORTANT: All commands below MUST run from `infra/` directory.**

**Steps:**

1. Navigate to `infra/` directory: `cd infra/`
2. Generate a detailed plan: `terraform plan -out=tfplan`
3. Review the plan summary

**What to check:**

For **initial deployment** (should show ~93 resources to add):

- ✅ 19 Azure resources (Event Hub, App Registrations, Storage, etc.)
- ✅ 74 AWS resources (Lambda, API Gateway, DynamoDB, etc.)
- ✅ No resources to change or destroy

For **updates** (if infrastructure already exists):

- What resources will be modified?
- Are any resources being destroyed and recreated?
- Are sensitive values (secrets, connection strings) being changed?

**Red flags to watch for:**

- ❌ Destroying DynamoDB tables (data loss)
- ❌ Destroying S3 buckets (data loss)
- ❌ Replacing Lambda functions (may cause downtime)
- ❌ Changing Event Hub namespace (breaks checkpoints)
- ❌ Modifying App Registration IDs (breaks permissions)

**Common changes to expect:**

- ✅ Lambda function code updates (new packages)
- ✅ Environment variable changes
- ✅ IAM policy updates
- ✅ EventBridge schedule modifications
- ✅ Tag updates

**Analyze the plan:**

1. Count total changes:

   ```
   Plan: X to add, Y to change, Z to destroy
   ```

2. Identify critical changes:
   - Are any stateful resources being replaced?
   - Will any existing data be lost?
   - Is there any unexpected resource destruction?

3. Check dependency order:
   - Azure resources should be created/updated before AWS
   - Event Hub must exist before Event Hub processor Lambda

4. Validate outputs:
   - Are all required outputs defined?
   - Do output references match actual resource attributes?

**If plan looks wrong:**

1. Check `terraform.tfvars` for typos or incorrect values
2. Verify Lambda packages exist at paths specified in tfvars
3. Ensure Azure Service Principal has required permissions
4. Check for Terraform state drift: `terraform refresh`

**After reviewing:**

If plan is acceptable:

- Save the plan: Already saved as `tfplan`
- Apply it: `terraform apply tfplan`

If plan needs changes:

- Update `terraform.tfvars`
- Re-run `terraform plan -out=tfplan`

Generate and analyze the plan, then summarize:

- Total resources affected
- Critical changes
- Any concerns or recommendations
- Whether it's safe to apply
