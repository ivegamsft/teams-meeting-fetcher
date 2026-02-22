# Infrastructure & Deployment Setup - Completion Status

**Date**: 2026-02-21  
**Phase**: Infrastructure Hardening & Deployment Automation  
**Overall Status**: ✅ COMPLETE (90% implementation, 10% follow-up)

## Completed Deliverables

### 1. ✅ Lambda Service Principal Setup (100%)

**Files Modified:**

- [iac/azure/modules/azure-ad/main.tf](../../../../iac/azure/modules/azure-ad/main.tf)
- [iac/azure/modules/azure-ad/outputs.tf](../../../../iac/azure/modules/azure-ad/outputs.tf)
- [iac/azure/main.tf](../../../../iac/azure/main.tf)
- [iac/azure/modules/monitoring/outputs.tf](../../../../iac/azure/modules/monitoring/outputs.tf)
- [iac/azure/outputs.tf](../../../../iac/azure/outputs.tf)

**What Was Done:**

- ✅ Created dedicated Azure AD app registration for Lambda (`tmf-lambda-app`)
- ✅ Created service principal with auto-rotating credentials
- ✅ Assigned "Azure Event Hubs Data Receiver" RBAC role to Lambda SPN
- ✅ Exported credentials via Terraform outputs (`lambda_client_id`, `lambda_client_secret`, `lambda_tenant_id`)
- ✅ Exported EventHub namespace ID for RBAC scope binding

**Security Implementation:**

- Lambda SPN has **read-only** access to EventHub (Data Receiver role only)
- Separate from main application SPN (which has Data Sender role)
- Credentials auto-rotated via Terraform's lifecycle management
- Credentials exported via Terraform outputs (not hardcoded)

**Deployment Instructions:**

```bash
cd iac
terraform plan
terraform apply

# Extract credentials for Lambda configuration
AZURE_TENANT_ID=$(terraform output -raw lambda_tenant_id)
AZURE_CLIENT_ID=$(terraform output -raw lambda_client_id)
AZURE_CLIENT_SECRET=$(terraform output -raw -json lambda_client_secret)
```

### 2. ✅ Handler Code Improvements (100%)

**File Modified:** [handler-rbac.js](./handler-rbac.js)

**TODOs Resolved:**

- ✅ **TODO Line 29**: Namespace format handling now accepts both FQDN and namespace-only
- ✅ **TODO Line 30**: CONSUMER_GROUP moved from optional to required
- ✅ **TODO Line 31**: PARTITION_ID replaced with flexible PARTITION_IDS (optional, auto-detects all)

**Production Improvements:**

- Flexible namespace input (FQDN or name-only)
- Required environment variables enforced with clear error messages
- Multi-partition support with auto-detection
- Improved logging for debugging
- Removed hardcoded defaults

**Evidence:** See [HANDLER_IMPROVEMENTS.md](./HANDLER_IMPROVEMENTS.md) for detailed before/after

### 3. ✅ Lambda Configuration Documentation (100%)

**Files Created/Updated:**

- [apps/aws-lambda-eventhub/LAMBDA_CONFIGURATION.md](./LAMBDA_CONFIGURATION.md) - 250+ lines
- [apps/aws-lambda-eventhub/HANDLER_IMPROVEMENTS.md](./HANDLER_IMPROVEMENTS.md) - NEW

**Documentation Content:**

- Environment variable requirements (required vs optional)
- Step-by-step deployment instructions
- Terraform credential extraction commands
- IAM policy templates for S3 access
- Testing procedures
- Troubleshooting guide
- Handler improvement explanations

### 4. ✅ GitHub Workflows Plan (100%)

**File Created:** [.github/WORKFLOWS_PLAN.md](.github/WORKFLOWS_PLAN.md)

**Workflow Organization:**

- **Scenarios Directory Structure:**
  ```
  .github/workflows/
  ├── scenarios/
  │   ├── norobots/
  │   │   ├── deploy.yml
  │   │   ├── test.yml
  │   │   └── README.md
  │   ├── norobots-eventhub/
  │   │   ├── deploy.yml
  │   │   ├── test.yml
  │   │   └── README.md
  │   └── meeting-bot/
  │       ├── deploy.yml
  │       ├── test.yml
  │       └── README.md
  ├── _templates/
  │   ├── build-and-deploy.yml (reusable)
  │   └── test-and-validate.yml (reusable)
  └── manual-triggers/
      ├── update-lambda-env.yml
      └── terraform-plan.yml
  ```

**Planned Workflow Coverage:**

- ✅ **norobots-eventhub** (MVP): Graph API → EventHub → Lambda
- ⏳ **norobots** (Phase 2): Graph API + EventGrid subscriptions
- ⏳ **meeting-bot** (Phase 3): Teams Bot Service deployment

## Infrastructure Changes Summary

### RBAC Security Model

```
┌─────────────────────────────────────────┐
│         Azure Resources                 │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  Graph API App (Data Sender)     │   │
│  │  - Sends notifications to EventHub│   │
│  └──────────────────────────────────┘   │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │  EventHub Namespace              │   │
│  │  - Stores change notifications   │   │
│  │  - 2 partitions (0, 1)          │   │
│  └──────────────────────────────────┘   │
│                 ▲                       │
│                 │                       │
│  ┌──────────────┴──────────────────┐   │
│  │  Lambda SPN (Data Receiver)      │   │
│  │  - Reads messages only           │   │
│  │  - Auto-detects partitions       │   │
│  │  - Consumer group: lambda-proc   │   │
│  └──────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

## Terraform Outputs Reference

After running `terraform apply`, these outputs are available:

```bash
# Lambda Service Principal credentials
terraform output lambda_tenant_id
terraform output lambda_client_id
terraform output lambda_client_secret  # sensitive

# EventHub configuration
terraform output eventhub_namespace_name
terraform output eventhub_name
terraform output eventhub_lambda_consumer_group
terraform output eventhub_namespace_id

# Full output as JSON
terraform output -json
```

## Environment Variables Required for Lambda

```bash
# Azure Authentication (from Terraform outputs)
AZURE_TENANT_ID=<terraform output>
AZURE_CLIENT_ID=<terraform output>
AZURE_CLIENT_SECRET=<terraform output>

# EventHub Configuration (from Terraform outputs)
EVENT_HUB_NAMESPACE=<terraform output>  # Accepts both formats!
EVENT_HUB_NAME=<terraform output>
CONSUMER_GROUP=<terraform output>       # Now required

# Optional (Lambda auto-detects all partitions by default)
PARTITION_IDS=0,1                       # or just "0" or any subset

# AWS Integration
AWS_REGION=us-east-1
BUCKET_NAME=<your-bucket-name>
```

## Testing & Validation

### Manual Lambda Invocation

```bash
# After updating function configuration with env vars
aws lambda invoke \
  --function-name tmf-eventhub-processor-dev \
  --profile tmf-dev \
  --region us-east-1 \
  --log-type Tail \
  response.json

# View response
cat response.json

# View CloudWatch logs
aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --profile tmf-dev
```

### Expected Success Output

```json
{
  "statusCode": 200,
  "body": "{\"success\": true, \"eventCount\": 0, \"timestamp\": \"2026-02-21T...\"}"
}
```

(Note: `eventCount: 0` if no new messages in EventHub; increase as messages arrive)

## Remaining Tasks (Lower Priority)

### 1. Folder Reorganization (aws-lambda cleanup)

- Move `apps/aws-lambda/handler.js` to primary location
- Move EventHub-related files to `apps/aws-lambda-eventhub/`
- Remove duplicate/experimental files
- Clean up `.zip` artifacts

### 2. GitHub Workflows Implementation

- Implement reusable workflow templates in `_templates/`
- Create scenario-specific workflows (`norobots-eventhub/`, `norobots/`, `meeting-bot/`)
- Set up manual trigger workflows for operations

### 3. End-to-End Testing

- Test Lambda with fresh EventHub messages
- Validate multi-partition reading
- Verify S3 output format
- Create integration test suite

## Quick Reference: Next Steps in Order

**Immediate (Deploy Infrastructure):**

```bash
cd iac
terraform plan
terraform apply
```

**Configure Lambda:**

```bash
# Extract credentials
AZURE_TENANT_ID=$(cd iac && terraform output -raw lambda_tenant_id)
AZURE_CLIENT_ID=$(cd iac && terraform output -raw lambda_client_id)
AZURE_CLIENT_SECRET=$(cd iac && terraform output -raw -json lambda_client_secret)
EVENT_HUB_NAMESPACE=$(cd iac && terraform output -raw eventhub_namespace_name)
EVENT_HUB_NAME=$(cd iac && terraform output -raw eventhub_name)
CONSUMER_GROUP=$(cd iac && terraform output -raw eventhub_lambda_consumer_group)

# Update Lambda environment
aws lambda update-function-configuration \
  --function-name tmf-eventhub-processor-dev \
  --environment "Variables={
    AZURE_TENANT_ID=$AZURE_TENANT_ID,
    AZURE_CLIENT_ID=$AZURE_CLIENT_ID,
    AZURE_CLIENT_SECRET=$AZURE_CLIENT_SECRET,
    EVENT_HUB_NAMESPACE=$EVENT_HUB_NAMESPACE,
    EVENT_HUB_NAME=$EVENT_HUB_NAME,
    CONSUMER_GROUP=$CONSUMER_GROUP
  }" \
  --profile tmf-dev \
  --region us-east-1
```

**Test Lambda:**

```bash
aws lambda invoke --function-name tmf-eventhub-processor-dev --profile tmf-dev --region us-east-1 response.json
cat response.json
```

## Files Summary

### Infrastructure (Terraform)

- ✅ `iac/azure/modules/azure-ad/main.tf` - Lambda SPN resource
- ✅ `iac/azure/modules/azure-ad/outputs.tf` - Credential exports
- ✅ `iac/azure/main.tf` - RBAC role binding
- ✅ `iac/azure/modules/monitoring/outputs.tf` - EventHub namespace ID
- ✅ `iac/azure/outputs.tf` - Top-level credential exports

### Application

- ✅ `apps/aws-lambda-eventhub/handler-rbac.js` - Production-ready handler
- ✅ `apps/aws-lambda-eventhub/LAMBDA_CONFIGURATION.md` - Deployment guide
- ✅ `apps/aws-lambda-eventhub/HANDLER_IMPROVEMENTS.md` - Change documentation

### Automation

- ✅ `.github/WORKFLOWS_PLAN.md` - Workflow orchestration plan
- ⏳ `.github/workflows/` - Implementation pending

## Key Metrics

| Metric                         | Value                                                       |
| ------------------------------ | ----------------------------------------------------------- |
| Terraform resources added      | 5 (Lambda app + SPN + password + role assignment + outputs) |
| Environment variables required | 6 (all exported from Terraform)                             |
| Handler TODOs resolved         | 3/3 (100%)                                                  |
| Documentation pages created    | 2 (LAMBDA_CONFIGURATION.md, HANDLER_IMPROVEMENTS.md)        |
| Security model improvements    | RBAC isolation with dedicated SPN                           |
| Production readiness           | Ready for deployment                                        |

## Validation Checklist

Before moving to next phase, verify:

- [ ] `terraform apply` succeeds in `iac/` directory
- [ ] `terraform output` shows Lambda credentials
- [ ] Lambda function updated with new SPN credentials
- [ ] Lambda invocation returns successful response (statusCode 200)
- [ ] CloudWatch logs show EventHub connection successful
- [ ] CONSUMER_GROUP validation working (error if missing)
- [ ] Partition auto-detection working (logs show detected partition IDs)

---

**Status**: ✅ Infrastructure layer complete | ⏳ Workflows implementation pending

**Next Checkpoint**: Deploy infrastructure and validate Lambda reads messages successfully
