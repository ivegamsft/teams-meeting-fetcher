# Deployment Prerequisites

This document covers every prerequisite needed to deploy Teams Meeting Fetcher via GitHub Actions CI/CD. Each value is tagged with its source:

| Tag | Meaning |
|-----|---------|
| **Manual** | You create/configure this by hand |
| **Pipeline-generated** | A GitHub Actions workflow produces this |
| **Terraform output** | Value emitted by `terraform output` after a successful apply |
| **Auto-created** | Created automatically during first deploy |

---

## 1. AWS Account Setup

### 1.1 OIDC Identity Provider for GitHub Actions

GitHub Actions authenticates to AWS via OpenID Connect (OIDC). You must register the OIDC provider **once per AWS account**.

This is a one-time setup per AWS account. If you have multiple repositories in the same AWS account, they can all share the same OIDC provider—just add repository-specific conditions to the trust policy (see section 1.2). If you need to deploy to a different AWS account, repeat sections 1.1 and 1.2 for that account with its own OIDC provider and IAM role.

**Source:** Manual

```bash
# Create the OIDC identity provider
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"
```

> **Why this matters:** Without this provider, every workflow that uses `aws-actions/configure-aws-credentials@v4` will fail with:
> `Could not assume role with OIDC: No OpenIDConnect provider found in your account for https://token.actions.githubusercontent.com`

### 1.2 IAM Role for GitHub Actions

Create an IAM role that GitHub Actions can assume via OIDC. The trust policy must reference your specific repository.

**Source:** Manual

```bash
# Create the trust policy document
cat > github-actions-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:*"
        }
      }
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --assume-role-policy-document file://github-actions-trust-policy.json

# Attach permissions (adjust to your needs)
aws iam attach-role-policy \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

aws iam attach-role-policy \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess

aws iam attach-role-policy \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

aws iam attach-role-policy \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --policy-arn arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator

aws iam attach-role-policy \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --policy-arn arn:aws:iam::aws:policy/IAMFullAccess

aws iam attach-role-policy \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --policy-arn arn:aws:iam::aws:policy/AmazonEventBridgeFullAccess

aws iam attach-role-policy \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --policy-arn arn:aws:iam::aws:policy/AmazonSNSFullAccess

aws iam attach-role-policy \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess

aws iam attach-role-policy \
  --role-name GitHubActionsTeamsMeetingFetcher \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchFullAccessV2
```

The resulting role ARN (e.g., `arn:aws:iam::<ACCOUNT_ID>:role/GitHubActionsTeamsMeetingFetcher`) is stored as the `AWS_ROLE_ARN` GitHub secret.

After completing this section, save the role ARN and proceed to section 3 to set the GitHub secret with `gh secret set AWS_ROLE_ARN --body "arn:aws:iam::<ACCOUNT_ID>:role/GitHubActionsTeamsMeetingFetcher"`.

### 1.3 Verify the Bootstrap

After setting up the OIDC provider, IAM role, and GitHub secret, verify the bootstrap is complete with the following commands:

**Verify OIDC provider exists:**

```bash
aws iam list-open-id-connect-providers
```

**Expected output:** You should see the provider ARN `arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com` listed.

**Verify IAM role and trust policy:**

```bash
aws iam get-role --role-name GitHubActionsTeamsMeetingFetcher
aws iam get-role-policy --role-name GitHubActionsTeamsMeetingFetcher --policy-name AssumeRolePolicy
```

**Expected output:** The role exists and the trust policy includes:
- Federated principal: `arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com`
- Audience condition: `sts.amazonaws.com`
- Subject condition: Your repository in the format `repo:<OWNER>/<REPO>:*`

**Verify attached policies:**

```bash
aws iam list-attached-role-policies --role-name GitHubActionsTeamsMeetingFetcher
```

**Expected output:** All 9 policies attached (or whatever count matches your bootstrap):
- AmazonS3FullAccess
- AWSLambda_FullAccess
- AmazonDynamoDBFullAccess
- AmazonAPIGatewayAdministrator
- IAMFullAccess
- EventBridgeFullAccess
- SNSFullAccess
- CloudWatchLogsFullAccess
- CloudWatchFullAccessV2

**Verify GitHub secret is set:**

```bash
gh secret list
```

**Expected output:** `AWS_ROLE_ARN` appears in the list with a masked value.

**Verification Script:**

A standalone verification script is available at `scripts/verify/verify-github-secrets.ps1` (PowerShell) or `.sh` (Bash) that automates these checks and provides a pass/fail summary.

**CI Verification Workflow:**

After completing all bootstrap steps (AWS OIDC, Azure OIDC, Terraform backend, GitHub secrets/variables), run the `Verify Bootstrap` workflow from the Actions tab to confirm everything is correctly configured:

```bash
gh workflow run verify-bootstrap.yml -R ivegamsft/teams-meeting-fetcher
```

This workflow authenticates via OIDC to both AWS and Azure, verifies all cloud-side resources, and reports a PASS/FAIL summary. See `.github/workflows/verify-bootstrap.yml` for details.

---

## 2. Terraform State Backend Setup

Terraform state must be stored in a remote backend (S3 + DynamoDB for AWS) instead of locally. This enables:
- **Team collaboration** — multiple engineers can deploy simultaneously with state locking
- **CI/CD integration** — GitHub Actions workflows access shared state
- **Disaster recovery** — versioned backups prevent state loss
- **Audit trail** — all state changes are logged

This is a **one-time setup per AWS account**, performed before the first `terraform init`.

### 2.1 S3 Bucket for Terraform State

Create an S3 bucket to store the Terraform state file.

**Source:** Manual

```bash
# Create the S3 bucket
aws s3api create-bucket \
  --bucket <your-tf-state-bucket> \
  --region us-east-1

# Enable versioning (allows rollback if state is corrupted)
aws s3api put-bucket-versioning \
  --bucket <your-tf-state-bucket> \
  --versioning-configuration Status=Enabled

# Enable encryption at rest (protects sensitive data like secrets)
aws s3api put-bucket-encryption \
  --bucket <your-tf-state-bucket> \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]
  }'

# Block public access (critical for security — state contains secrets)
aws s3api put-public-access-block \
  --bucket <your-tf-state-bucket> \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 2.2 DynamoDB Table for State Locking

Create a DynamoDB table to manage concurrent state access. When multiple engineers or CI/CD pipelines run `terraform apply` simultaneously, DynamoDB prevents race conditions by holding a lock.

**Source:** Manual

```bash
aws dynamodb create-table \
  --table-name <your-tf-lock-table> \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### 2.3 GitHub Repository Variables for Terraform Backend

Configure GitHub repository variables (not secrets) that point to your S3 bucket and DynamoDB table. These are referenced by all deploy workflows.

**Source:** Manual — set via `gh variable set` in the GitHub CLI (or use the bootstrap script in section 2.4)

| Variable | Value | Example |
|----------|-------|---------|
| `TF_STATE_BUCKET` | Name of the S3 bucket from section 2.1 | `tmf-terraform-state-<ACCOUNT_ID>` |
| `TF_STATE_KEY` | S3 object key (path) where state file is stored | `teams-meeting-fetcher/terraform.tfstate` |
| `TF_STATE_REGION` | AWS region where the S3 bucket exists | `us-east-1` |
| `TF_STATE_LOCK_TABLE` | Name of the DynamoDB table from section 2.2 | `tmf-terraform-state-lock` |

**Quick setup commands:**

```bash
gh variable set TF_STATE_BUCKET --body "tmf-terraform-state-<ACCOUNT_ID>"
gh variable set TF_STATE_KEY --body "teams-meeting-fetcher/terraform.tfstate"
gh variable set TF_STATE_REGION --body "us-east-1"
gh variable set TF_STATE_LOCK_TABLE --body "tmf-terraform-state-lock"
```

> **Important:** These are **GitHub Variables** (public), not **GitHub Secrets** (encrypted). The distinction matters:
> - Use `gh variable set` for bucket/table names, region (non-sensitive values)
> - Use `gh secret set` for AWS credentials, passwords, tokens (sensitive values)

### 2.4 Bootstrap and Verify Scripts

Two helper scripts automate the setup and verification:

**Bootstrap script** — Creates S3 bucket and DynamoDB table, sets GitHub variables
- **Path:** `scripts/setup/bootstrap-terraform-backend.ps1` (PowerShell) or `.sh` (Bash)
- **Usage:** `./bootstrap-terraform-backend.ps1` (uses sensible defaults) or `./bootstrap-terraform-backend.sh`
- **Defaults:** Bucket `tmf-terraform-state-<ACCOUNT_ID>`, table `tmf-terraform-state-lock`, key `teams-meeting-fetcher/terraform.tfstate`, region `us-east-1`
- **Idempotent:** Safe to re-run; skips resources that already exist
- **What it does:**
  1. Creates S3 bucket with versioning, AES-256 encryption, and all public access blocked
  2. Creates DynamoDB table with `LockID` partition key and PAY_PER_REQUEST billing
  3. Sets GitHub variables (`TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_STATE_REGION`, `TF_STATE_LOCK_TABLE`) automatically

**Verify script** — Validates that S3 and DynamoDB are correctly configured
- **Path:** `scripts/verify/verify-terraform-backend.ps1` (PowerShell) or `.sh` (Bash)
- **Usage:** `./verify-terraform-backend.ps1` or `./verify-terraform-backend.sh`
- **What it does:**
  1. Checks S3 bucket exists with versioning, encryption, and public access blocked
  2. Checks DynamoDB table exists, is ACTIVE, has correct key schema and billing
  3. Verifies GitHub variables are set and match expected values
  4. Reports pass/fail/warn counts with exit code 1 on any failure

### 2.5 State Migration (if starting from local backend)

If you initially deployed with a local Terraform backend and want to migrate to S3:

```bash
cd iac

# Initialize with the new S3 backend
terraform init \
  -backend-config="bucket=<your-tf-state-bucket>" \
  -backend-config="key=teams-meeting-fetcher/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=<your-tf-lock-table>" \
  -backend-config="encrypt=true" \
  -migrate-state

# Terraform will prompt: "Do you want to copy existing state to the new backend?"
# Answer: yes
```

After migration, you can safely delete the local state files:

```bash
rm -f iac/aws/terraform.tfstate*
rm -f iac/azure/terraform.tfstate*
rm -f iac/.terraform.tfstate.lock.info
```

---

## 3. Azure Account Setup

### 3.1 App Registration

Create an Azure AD App Registration for GitHub Actions OIDC authentication.

**Source:** Manual

```bash
# Create the app registration
az ad app create --display-name "GitHub-Actions-TeamsMeetingFetcher"

# Note the appId (client ID) from the output
APP_ID=$(az ad app list --display-name "GitHub-Actions-TeamsMeetingFetcher" --query "[0].appId" -o tsv)

# Create a service principal
az ad sp create --id $APP_ID

# Assign Contributor role on your subscription
az role assignment create \
  --assignee $APP_ID \
  --role Contributor \
  --scope /subscriptions/<SUBSCRIPTION_ID>
```

### 3.2 Federated Credentials for GitHub OIDC

**Source:** Manual

```bash
APP_OBJECT_ID=$(az ad app list --display-name "GitHub-Actions-TeamsMeetingFetcher" --query "[0].id" -o tsv)

# For pushes to main branch
az ad app federated-credential create --id $APP_OBJECT_ID --parameters '{
  "name": "github-actions-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<OWNER>/<REPO>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

# For pull requests
az ad app federated-credential create --id $APP_OBJECT_ID --parameters '{
  "name": "github-actions-pr",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<OWNER>/<REPO>:pull_request",
  "audiences": ["api://AzureADTokenExchange"]
}'

# For the develop branch
az ad app federated-credential create --id $APP_OBJECT_ID --parameters '{
  "name": "github-actions-develop",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<OWNER>/<REPO>:ref:refs/heads/develop",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

### 3.3 Values to Collect

| Value | Where to Find | Source |
|-------|---------------|--------|
| Client ID (App ID) | Azure Portal > App Registrations > Overview | **Manual** |
| Tenant ID | Azure Portal > Azure Active Directory > Overview | **Manual** |
| Subscription ID | Azure Portal > Subscriptions | **Manual** |

### 3.4 RBAC-Only Auth and Firewall IP Management

All Azure resources in this project use **RBAC-only authentication** — no key-based access is permitted. Key Vault has `rbac_authorization_enabled = true`, Storage has `shared_access_key_enabled = false`, and Event Hub has `local_auth_enabled = false`.

Both Key Vault and Storage Account firewalls default to `Deny`, allowing only approved IPs and Azure Services to connect. When the CI/CD runner needs to access these resources (e.g., to read secrets or upload blobs), the workflow must temporarily add the runner's IP to the firewall.

**Pattern used in `deploy-azure.yml`:**

1. Azure Login (OIDC) and tenant verification
2. Get the runner's public IP via `curl -s https://api.ipify.org`
3. Add the runner IP to Key Vault and Storage Account firewalls (only if `defaultAction` is `Deny`)
4. Wait for firewall rule propagation (~15s)
5. Perform Terraform apply, secret reads, or blob operations
6. **Always** remove the runner IP from all firewalls (using `if: always()`)

**Critical:** Steps 1-6 must run in a **single job**. GitHub Actions assigns different IPs to different runners, so splitting across jobs would cause the remove step to target a different IP than the add step.

**Required RBAC roles for the OIDC service principal:**

| Role | Scope | Purpose |
|------|-------|---------|
| **Key Vault Contributor** | Key Vault resource | Manage firewall/network rules |
| **Key Vault Secrets Officer** | Key Vault resource | Read/write secrets (already assigned by Terraform) |
| **Storage Account Contributor** | Storage Account resource | Manage network rules |
| **Storage Blob Data Contributor** | Storage Account resource | Read/write blobs (already assigned by Terraform) |
| **Network Contributor** | Resource Group | Required only if using VNet-based rules |

```bash
# Assign firewall management roles to the GitHub Actions SPN
APP_ID="<your-azure-client-id>"
KV_ID="/subscriptions/<SUB_ID>/resourceGroups/<RG>/providers/Microsoft.KeyVault/vaults/<KV_NAME>"
STORAGE_ID="/subscriptions/<SUB_ID>/resourceGroups/<RG>/providers/Microsoft.Storage/storageAccounts/<STORAGE_NAME>"

az role assignment create --assignee "$APP_ID" --role "Key Vault Contributor" --scope "$KV_ID"
az role assignment create --assignee "$APP_ID" --role "Storage Account Contributor" --scope "$STORAGE_ID"
```

A reusable composite action (`.github/actions/azure-firewall-access/`) and a reusable workflow (`.github/workflows/azure-resource-access.yml`) are available for other workflows that need firewall access.

---

## 4. GitHub Repository Secrets

All secrets are configured manually in **Settings > Secrets and variables > Actions > Secrets**.

| Secret | Description | Source |
|--------|-------------|--------|
| `AWS_ROLE_ARN` | IAM role ARN for GitHub Actions OIDC (from section 1.2) | **Manual** |
| `AZURE_CLIENT_ID` | Azure App Registration client ID (from section 2.1) | **Manual** |
| `AZURE_TENANT_ID` | Azure AD tenant ID | **Manual** |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID | **Manual** |
| `EXPECTED_TENANT_ID` | Expected Azure tenant ID for deploy-azure safety check (same as `AZURE_TENANT_ID`) | **Manual** |
| `GRAPH_TENANT_ID` | Microsoft Graph API tenant ID (may differ from infra tenant) | **Manual** |
| `GRAPH_CLIENT_ID` | Microsoft Graph API app client ID | **Manual** |
| `GRAPH_CLIENT_SECRET` | Microsoft Graph API app client secret | **Manual** |
| `BOT_APP_ID` | Teams Bot app ID from Azure Bot registration | **Manual** / **Terraform output** (`azure_bot_app_id`) |
| `COPILOT_ASSIGN_TOKEN` | GitHub PAT with `issues:write` scope for assigning @copilot to issues. Only needed if using Squad's Copilot auto-assign feature. Falls back to `GITHUB_TOKEN` if not set. | **Manual** (optional) |

### Quick Setup Commands

```bash
# AWS
gh secret set AWS_ROLE_ARN --body "arn:aws:iam::<ACCOUNT_ID>:role/GitHubActionsTeamsMeetingFetcher"

# Azure Infrastructure
gh secret set AZURE_CLIENT_ID --body "<app-client-id>"
gh secret set AZURE_TENANT_ID --body "<tenant-id>"
gh secret set AZURE_SUBSCRIPTION_ID --body "<subscription-id>"
gh secret set EXPECTED_TENANT_ID --body "<tenant-id>"

# Microsoft Graph API
gh secret set GRAPH_TENANT_ID --body "<graph-tenant-id>"
gh secret set GRAPH_CLIENT_ID --body "<graph-client-id>"
gh secret set GRAPH_CLIENT_SECRET --body "<graph-client-secret>"

# Teams Bot
gh secret set BOT_APP_ID --body "<bot-app-id>"

# Squad Copilot (optional)
gh secret set COPILOT_ASSIGN_TOKEN --body "ghp_..."
```

---

## 5. GitHub Repository Variables

All variables are configured manually in **Settings > Secrets and variables > Actions > Variables**.

| Variable | Description | Example | Source |
|----------|-------------|---------|--------|
| `AWS_REGION` | AWS deployment region | `us-east-1` | **Manual** |

### Quick Setup Commands

```bash
gh variable set AWS_REGION --body "us-east-1"
```

---

## 6. Local Development Prerequisites

### 6.1 Required Tools

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18.x | [nodejs.org](https://nodejs.org) |
| Terraform | >= 1.5.0 | [terraform.io](https://www.terraform.io/downloads) |
| AWS CLI | v2 | [aws.amazon.com/cli](https://aws.amazon.com/cli/) |
| Azure CLI | latest | [learn.microsoft.com](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) |
| Docker | latest | [docker.com](https://www.docker.com/get-started/) |
| Python | 3.10+ | [python.org](https://www.python.org/downloads/) |

### 6.2 Service Principal for Local Terraform

For local Terraform runs, create a Service Principal with a client secret:

```bash
az ad sp create-for-rbac \
  --name "TeamsMeetingFetcher-Local" \
  --role Contributor \
  --scopes /subscriptions/<SUBSCRIPTION_ID>
```

This outputs `appId`, `password`, and `tenant`. Use these in your `.env` or `terraform.tfvars`.

### 6.3 `.env` File Configuration

Create a `.env` file at the repo root (gitignored) for local development:

```bash
# Azure
AZURE_SUBSCRIPTION_ID=<subscription-id>
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_ID=<service-principal-app-id>
AZURE_CLIENT_SECRET=<service-principal-password>

# AWS
AWS_PROFILE=default
AWS_REGION=us-east-1

# Microsoft Graph
GRAPH_TENANT_ID=<graph-tenant-id>
GRAPH_CLIENT_ID=<graph-client-id>
GRAPH_CLIENT_SECRET=<graph-client-secret>
```

### 6.4 Local Terraform Runs

For local Terraform (uses SPN auth, not OIDC):

```bash
cd iac

# Export Azure credentials
export ARM_CLIENT_ID="<service-principal-app-id>"
export ARM_CLIENT_SECRET="<service-principal-password>"
export ARM_TENANT_ID="<tenant-id>"
export ARM_SUBSCRIPTION_ID="<subscription-id>"

# Initialize (local backend for dev)
terraform init

# Or initialize with S3 backend
terraform init \
  -backend-config="bucket=<your-tf-state-bucket>" \
  -backend-config="key=teams-meeting-fetcher/terraform.tfstate" \
  -backend-config="region=us-east-1" \
  -backend-config="dynamodb_table=<your-tf-lock-table>" \
  -backend-config="encrypt=true"

# Plan and apply (use_oidc defaults to false for local)
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

---

## 7. Pipeline-Generated Values (Terraform Outputs)

After a successful `terraform apply`, these outputs are available and may feed into other workflows or configuration steps.

### AWS Outputs

| Output | Description | Source | Used By |
|--------|-------------|--------|---------|
| `aws_lambda_function_name` | Main webhook handler Lambda | **Terraform output** | `deploy-lambda-handler.yml` |
| `aws_authorizer_function_name` | API Gateway authorizer Lambda | **Terraform output** | `deploy-lambda-authorizer.yml` |
| `aws_eventhub_processor_name` | Event Hub processor Lambda | **Terraform output** | `deploy-lambda-eventhub.yml` |
| `aws_meeting_bot_function_name` | Teams bot Lambda | **Terraform output** | `deploy-lambda-meeting-bot.yml` |
| `aws_renewal_function_name` | Subscription renewal Lambda | **Terraform output** | `deploy-lambda-renewal.yml` |
| `aws_api_gateway_url` | API Gateway webhook endpoint | **Terraform output** | Graph subscription config |
| `aws_meeting_bot_webhook_url` | Bot messaging endpoint | **Terraform output** | Teams Bot registration |
| `aws_buckets` | S3 bucket names (webhooks, transcripts, checkpoints) | **Terraform output** | Lambda env vars |
| `aws_checkpoint_table_name` | DynamoDB checkpoint table | **Terraform output** | Event Hub processor |

### Azure Outputs

| Output | Description | Source | Used By |
|--------|-------------|--------|---------|
| `azure_resource_group_name` | Resource group name | **Terraform output** | Azure management |
| `azure_app_client_id` | Graph API app client ID | **Terraform output** | `GRAPH_CLIENT_ID` secret |
| `azure_app_client_secret` | Graph API app client secret (sensitive) | **Terraform output** | `GRAPH_CLIENT_SECRET` secret |
| `azure_bot_app_id` | Bot registration app ID | **Terraform output** | `BOT_APP_ID` secret |
| `azure_eventhub_namespace` | Event Hub namespace | **Terraform output** | Event Hub processor config |
| `azure_eventhub_name` | Event Hub name | **Terraform output** | Event Hub processor config |
| `azure_eventhub_connection_string` | Event Hub connection string (sensitive) | **Terraform output** | Event Hub processor env |
| `azure_key_vault_name` | Key Vault name | **Terraform output** | Secret management |
| `azure_storage_account_name` | Storage account name | **Terraform output** | Azure storage operations |

### Retrieving Outputs

```bash
cd iac
terraform output                              # Show all outputs
terraform output -raw aws_api_gateway_url     # Get a specific value
terraform output -json deployment_summary     # Full deployment summary
```

---

## 8. Squad/CI Notes

### 8.1 Squad Protected Branch Guard

The `squad-main-guard.yml` workflow **intentionally fails** when `.squad/`, `.ai-team/`, `.ai-team-templates/`, `team-docs/`, or `docs/proposals/` files are pushed to protected branches (`main`, `preview`, `insider`).

**This is by design.** These directories contain AI team runtime state and belong only on `dev` and feature branches.

**If you see this failure:**
- It means `.squad/` files were included in a push or PR to `main` -- this is expected behavior
- Use the `squad-promote.yml` workflow (manual dispatch) to promote `dev` to `preview` to `main` -- it automatically strips forbidden paths
- Or manually remove them: `git rm --cached -r .squad/ && git commit && git push`

### 8.2 Workflow Trigger Summary

| Workflow | Push | PR | Manual | Schedule |
|----------|------|----|--------|----------|
| **Build Workflows** | | | | |
| `build-lambda-handler.yml` | `develop` | `main`, `develop` | Yes | |
| `build-lambda-authorizer.yml` | `develop` | `main`, `develop` | Yes | |
| `build-lambda-eventhub.yml` | `develop` | `main`, `develop` | Yes | |
| `build-lambda-meeting-bot.yml` | `develop` | `main`, `develop` | Yes | |
| **Deploy Workflows** | | | | |
| `deploy-unified.yml` | `main` | | Yes | |
| `deploy-azure.yml` | `main` | | Yes | |
| `deploy-lambda-handler.yml` | `main` | | Yes | |
| `deploy-lambda-authorizer.yml` | `main` | | Yes | |
| `deploy-lambda-eventhub.yml` | `main` | | Yes | |
| `deploy-lambda-meeting-bot.yml` | `main` | | Yes | |
| `deploy-lambda-renewal.yml` | `main` | | Yes | |
| **Quality & Security** | | | | |
| `test-and-lint.yml` | `develop` | `main`, `develop` | | |
| `e2e-integration-tests.yml` | `develop` | `main`, `develop` | Yes | |
| `security-scan.yml` | `develop`, `main` | `main`, `develop` | Yes | |
| `terraform-validate.yml` | | `main`, `develop` | Yes | |
| `verify-bootstrap.yml` | | | Yes | |
| **Release** | | | | |
| `release.yml` | `main` (+ tags) | | Yes | |
| `package-teams-app.yml` | `main`, `develop` | `main`, `develop` | Yes | |
| **Squad Workflows** | | | | |
| `squad-ci.yml` | `dev`, `insider` | `dev`, `preview`, `main`, `insider` | | |
| `squad-release.yml` | `main` | | | |
| `squad-insider-release.yml` | `insider` | | | |
| `squad-preview.yml` | `preview` | | | |
| `squad-promote.yml` | | | Yes | |
| `squad-main-guard.yml` | `main`, `preview`, `insider` | `main`, `preview`, `insider` | | |
| `squad-heartbeat.yml` | | | Yes | Every 30 min |
| `squad-triage.yml` | On issue labeled `squad` | | | |
| `squad-issue-assign.yml` | On issue labeled `squad:*` | | | |
| `squad-label-enforce.yml` | On issue labeled | | | |
| `squad-docs.yml` | `preview` | | Yes | |
| `sync-squad-labels.yml` | On `.squad/team.md` change | | Yes | |

### 8.3 No Root package.json

This project is a multi-app monorepo with **no root `package.json`**. App code lives in subdirectories:

| App Directory | Description |
|---------------|-------------|
| `apps/aws-lambda/` | Main webhook handler Lambda |
| `apps/aws-lambda-authorizer/` | API Gateway custom authorizer |
| `apps/aws-lambda-eventhub/` | Event Hub processor Lambda |
| `scenarios/lambda/meeting-bot/` | Teams Bot Lambda |
| `apps/teams-app/` | Teams app manifest (no npm) |

All workflows install dependencies per-app (`cd apps/aws-lambda && npm ci`), never at the root.

---

## Checklist

Use this checklist to verify your setup is complete:

- [ ] AWS OIDC Identity Provider created (section 1.1)
- [ ] AWS IAM Role created with trust policy (section 1.2)
- [ ] Terraform state backend setup complete (section 2)
  - [ ] S3 bucket for state created (section 2.1)
  - [ ] DynamoDB table for locking created (section 2.2)
  - [ ] GitHub variables set: TF_STATE_BUCKET, TF_STATE_KEY, TF_STATE_REGION, TF_STATE_LOCK_TABLE (section 2.3)
- [ ] Azure App Registration created (section 3.1)
- [ ] Azure federated credentials configured (section 3.2)
- [ ] All GitHub secrets set (section 4)
- [ ] All GitHub variables set (section 5)
- [ ] First `terraform init` succeeded with backend config (section 6.4)
- [ ] First `terraform apply` succeeded (section 7)
- [ ] Bootstrap verification workflow passed (`gh workflow run verify-bootstrap.yml`)
- [ ] Lambda function names from Terraform outputs noted
- [ ] API Gateway URL from Terraform output configured in Graph subscriptions
