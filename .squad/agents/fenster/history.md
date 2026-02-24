# Project Context

- **Owner:** ivegamsft
- **Project:** Teams Meeting Fetcher — webhook-driven service for Microsoft Teams meeting transcriptions via Graph API
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Created:** 2026-02-24

## Learnings

### 2026-02-24: CI/CD Infrastructure Fixes

- **Terraform Structure**: Root `iac/` contains unified deployment (Azure → AWS dependency chain). Subdirs `iac/aws/` and `iac/azure/` contain modular configs. Deploy workflows target `iac/` (root unified) or `iac/azure/` (standalone).
- **OIDC Auth Pattern**: Azure providers now support both local SPN (`client_secret`) and CI/CD OIDC (`use_oidc=true`). Variable `use_oidc` defaults to `false` for local dev, set via `TF_VAR_use_oidc=true` in workflows.
- **Workflow Variable Passing**: All Terraform variables must be passed via `TF_VAR_*` environment variables in GitHub Actions. Azure ARM provider also needs `ARM_USE_OIDC=true` alongside `ARM_CLIENT_ID/TENANT_ID/SUBSCRIPTION_ID`.
- **Node.js Project Structure**: No root `package.json` — apps are in subdirectories. Test/lint workflows must `cd apps/aws-lambda` before `npm ci`. Cache path must specify `apps/aws-lambda/package-lock.json`.
- **Lock File Cleanup**: Stale `.terraform.tfstate.lock.info` files in `iac/aws/` block Terraform operations. Safe to delete if no active Terraform process.
- **Squad Workflow Token Fallback**: Use `${{ secrets.COPILOT_ASSIGN_TOKEN || secrets.GITHUB_TOKEN }}` pattern for graceful degradation when PAT not configured.

### 2026-02-25: Build Workflow Fixes (Round 2)

- **Root npm ci is fatal**: 10 workflow files still had `npm ci` at root or `cache: "npm"` without `cache-dependency-path`. Since no root `package.json` exists, this causes every build/deploy/security/release workflow to fail at the install step.
- **Affected workflows fixed**: `build-lambda-handler.yml`, `build-lambda-authorizer.yml`, `build-lambda-eventhub.yml`, `build-lambda-meeting-bot.yml`, `deploy-lambda-handler.yml`, `deploy-lambda-authorizer.yml`, `deploy-lambda-eventhub.yml`, `deploy-lambda-meeting-bot.yml`, `deploy-aws.yml`, `security-scan.yml`, `release.yml`.
- **Fix pattern**: Remove `Install root dependencies: npm ci` step, add `cache-dependency-path` pointing to the specific app's `package-lock.json`. Each workflow installs deps only in its target app directory.
- **release.yml restructured**: Replaced root `npm ci` + `npm run build` with per-app install pattern matching `squad-release.yml` (which was already correct).
- **security-scan.yml dependency-check**: Changed to `cd apps/aws-lambda` before `npm ci` and `npm audit`.
- **App directories with package.json**: `apps/aws-lambda/`, `apps/aws-lambda-authorizer/`, `apps/aws-lambda-eventhub/`, `scenarios/lambda/meeting-bot/`. All verified to `npm ci` + syntax check cleanly.
- **Pre-existing test failure**: `apps/aws-lambda` has 1 failing test in `handler.test.js:147` — not workflow-related.

### 2026-02-25: Workflow Audit & Deployment Prerequisites (Round 3)

- **squad-promote.yml fix**: Four locations used `require('./package.json').version` without try/catch. Since no root `package.json` exists, these crash. Fixed to use the same `try { ... } catch(e) { console.log('0.0.0') }` pattern as `squad-release.yml` and `squad-insider-release.yml`.
- **Full 29-workflow audit**: All 29 workflow files reviewed. Build, deploy, security, release, squad, and test workflows all verified correct after prior rounds of fixes. No other issues found.
- **DEPLOYMENT_PREREQUISITES.md created**: Comprehensive document covering AWS OIDC setup, Azure App Registration, GitHub secrets/variables, Terraform state backend, local dev setup, pipeline-generated values (Terraform outputs), and Squad/CI notes.
- **AWS OIDC is a manual prereq**: The `deploy-lambda-*.yml` and `deploy-aws.yml` failures are NOT code bugs -- they require the user to register the GitHub Actions OIDC provider in their AWS account and create an IAM role with trust policy. Documented in DEPLOYMENT_PREREQUISITES.md section 1.
- **squad-main-guard.yml is working as designed**: Fails when `.squad/` files are pushed to main. This is intentional enforcement. Documented in DEPLOYMENT_PREREQUISITES.md section 8.1.

### 2026-02-25: Workflow Consolidation Audit (Round 4)

- **Deleted `squad-docs.yml`**: Named "Build & Deploy" but only checked if 4 docs existed and listed files. No build, no deploy, no link checking — pure placeholder with zero value.
- **Deleted `squad-preview.yml`**: Two checks, both redundant. Terraform fmt check used `command -v terraform` which fails on stock ubuntu runners (no terraform installed) — a no-op. Manifest JSON check duplicated by `package-teams-app.yml` which does full schema validation.
- **Kept `squad-promote.yml`**: Unique branch promotion workflow (dev -> preview -> main) with forbidden-path stripping and CHANGELOG validation. No original equivalent.
- **Kept all 6 squad orchestration workflows**: heartbeat, triage, sync-labels, issue-assign, main-guard, label-enforce — all unique to squad system.
- **No fragile `cd && ... && cd ../..` patterns found**: All `cd` commands are within isolated `run:` blocks (each step is its own shell). Already clean from prior fix rounds.
- **All `cache-dependency-path` entries correct**: Every `setup-node` with `cache: "npm"` has proper path. Fixed in Round 2.
- **Final workflow count**: 25 files (down from 29 originally: deleted squad-ci.yml, squad-release.yml, squad-insider-release.yml in prior step, plus squad-docs.yml and squad-preview.yml in this round).

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-02-25: Azure Firewall IP Management Pattern

- **RBAC-only auth**: Key Vault (`rbac_authorization_enabled = true`), Storage Account (`shared_access_key_enabled = false`), Event Hub (`local_auth_enabled = false`). Never use key-based access.
- **Firewall pattern**: Both Key Vault and Storage Account use `default_action = "Deny"`. CI/CD runners must add their IP before accessing resources, then remove it (with `if: always()`) after work completes.
- **Single-job constraint**: Runner IP changes between GitHub Actions jobs/runners. All firewall add/remove operations plus the actual work MUST happen in the same job.
- **Check before modify**: Always check `defaultAction` before adding/removing firewall rules. Skip modification if the resource is not set to `Deny`.
- **az CLI, not Terraform**: Firewall rule changes for runner IPs use `az keyvault network-rule` and `az storage account network-rule`, not Terraform — avoids state conflicts.
- **Reusable artifacts created**: Composite action at `.github/actions/azure-firewall-access/action.yml` and reusable workflow at `.github/workflows/azure-resource-access.yml` for other workflows needing firewalled access.
- **deploy-azure.yml updated**: Deploy job now gets runner IP, adds to KV/Storage firewalls (from Terraform outputs), runs apply, then cleans up with `if: always()`.
- **Required SPN roles for firewall management**: Key Vault Contributor (network rules) and Storage Account Contributor (network rules), in addition to existing data-plane roles.

📌 Team update (2026-02-25T1552): Workflow consolidation complete — deleted 2 duplicate workflows (squad-docs.yml, squad-preview.yml), consolidated 29 workflows → 25, all squad orchestration workflows are unique — decided by Fenster

### 2026-02-25: AWS OIDC Bootstrap Audit

- **Existing bootstrap scripts**: `scripts/setup/bootstrap-github-oidc.ps1` and `.sh` already automate the full OIDC setup (OIDC provider, IAM role, trust policy, policy attachment) for both AWS and Azure. They are idempotent — check-before-create on every resource. The user's manual steps exactly match what the script automates.
- **Script vs manual mismatch**: User created role `GitHubActionsTeamsMeetingFetcher` with 4 scoped policies; script creates `github-actions-oidc-role` with `AdministratorAccess`. The 4-policy approach is better (least privilege), but the script's role name differs from what the user deployed. Script also includes Azure OIDC setup and optional Terraform state backend bootstrapping.
- **Legacy scripts still present**: `setup-github-aws-iam.ps1/.sh` create IAM users with long-lived credentials and `AdministratorAccess` — marked deprecated in README but still in repo. `verify-github-secrets.ps1/.sh` check for legacy secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AZURE_CLIENT_SECRET`) that are no longer used with OIDC.
- **Terraform does NOT manage OIDC**: No `aws_iam_openid_connect_provider` or OIDC IAM role resource exists in `iac/aws/`. This is intentional (chicken-and-egg: OIDC must exist before Terraform can run via CI/CD). The `use_oidc` variable in Terraform is for Azure provider auth mode, not AWS OIDC resource management.
- **Verification gap**: No verification script or CI step validates that the OIDC provider, IAM role, trust policy, or attached policies are correctly configured. The `verify-github-secrets.ps1/.sh` scripts only check GitHub secret names (not values or AWS-side resources).
- **Security concern**: Both the bootstrap script (`AdministratorAccess`) and the `setup-github-aws-iam` scripts grant overly broad permissions. The user's manual approach with 4 specific policies (S3FullAccess, Lambda_FullAccess, DynamoDBFullAccess, APIGatewayAdministrator) is better but still uses `*FullAccess` managed policies rather than custom least-privilege policies scoped to project resources.

### Bootstrap and Verify Scripts Updated for OIDC

- **Bootstrap scripts updated**: `scripts/setup/bootstrap-github-oidc.ps1` and `.sh` now use 9 scoped AWS managed policies instead of `AdministratorAccess`. Default role name changed from `github-actions-oidc-role` to `GitHubActionsTeamsMeetingFetcher` (configurable via parameter). Added `-SetSecrets`/`--set-secrets` flag to optionally run `gh secret set` after creating the role.
- **9 scoped policies**: AmazonS3FullAccess, AWSLambda_FullAccess, AmazonDynamoDBFullAccess, AmazonAPIGatewayAdministrator, IAMFullAccess, AmazonEventBridgeFullAccess, AmazonSNSFullAccess, CloudWatchLogsFullAccess, CloudWatchFullAccessV2. These match the production `GitHubActionsTeamsMeetingFetcher` role exactly.
- **Verify scripts rewritten**: `scripts/verify/verify-github-secrets.ps1` and `.sh` now check OIDC-era secrets (AWS_ROLE_ARN, AWS_REGION), verify AWS-side resources (OIDC provider, IAM role, trust policy, all 9 attached policies), warn about stale IAM-user-era secrets, and report pass/fail with exit codes.
- **DEPLOYMENT_PREREQUISITES.md updated**: Section 1.2 now lists all 9 policies instead of only 4.
- **Emojis removed**: All output uses `[PASS]`, `[FAIL]`, `[WARN]`, `[ERROR]`, `[SKIP]` prefixes per project conventions.

### 2026-02-25: Terraform State Backend Provisioned

- **AWS resources created**: S3 bucket `tmf-terraform-state-833337371676` (versioning, AES-256 encryption, all public access blocked) and DynamoDB table `tmf-terraform-state-lock` (LockID partition key, PAY_PER_REQUEST) in us-east-1.
- **Naming convention**: `tmf-terraform-state-{account_id}` for bucket (globally unique), `tmf-terraform-state-lock` for lock table. State key: `teams-meeting-fetcher/terraform.tfstate`.
- **GitHub variables set**: `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_STATE_REGION`, `TF_STATE_LOCK_TABLE` on `ivegamsft/teams-meeting-fetcher`. These are variables (not secrets) since they contain non-sensitive values.
- **Bootstrap script**: `scripts/setup/bootstrap-terraform-backend.ps1` and `.sh` — idempotent, auto-detects account ID, creates bucket/table, sets GitHub vars. Standalone from `bootstrap-github-oidc.ps1` (that script's `-SetupTerraformState` flag requires an IP CIDR and applies a bucket policy; the new script is simpler and doesn't require IP allowlisting).
- **Verify script**: `scripts/verify/verify-terraform-backend.ps1` and `.sh` — checks bucket (exists, versioning, encryption, public access), table (exists, ACTIVE, key schema, billing), and GitHub vars (set + match expected values). 12 checks total, exit 1 on any failure.
- **Azure Terraform does NOT use S3 backend**: `deploy-azure.yml` runs `terraform init` in `iac/azure/` without backend-config flags — uses local backend. No additional state backend vars needed for Azure.
- **DEPLOYMENT_PREREQUISITES.md updated**: Section 2.3 examples updated to use actual naming convention (`tmf-terraform-state-<ACCOUNT_ID>`, `tmf-terraform-state-lock`). Section 2.4 updated with actual script usage and removed TODO comments.

### Verify Bootstrap CI Workflow

- **Created `.github/workflows/verify-bootstrap.yml`**: Post-bootstrap verification workflow, triggered manually via `workflow_dispatch`. Four jobs: `config-verify` (GitHub secrets/variables), `aws-verify` (OIDC provider, IAM role, trust policy, 9 policies, S3 bucket, DynamoDB table), `azure-verify` (OIDC auth, tenant match, subscription state, SP lookup), `summary` (PASS/FAIL rollup with troubleshooting pointers).
- **OIDC-only auth**: AWS uses `aws-actions/configure-aws-credentials@v4` with `role-to-assume`; Azure uses `azure/login@v2` with federated identity. No static keys.
- **Conditional job execution**: `aws-verify` only runs if `AWS_ROLE_ARN` is set; `azure-verify` only runs if all 4 Azure secrets are set. Prevents noisy failures when only one cloud is bootstrapped.
- **Matches existing conventions**: Same `[PASS]/[FAIL]/[WARN]/[SKIP]` output format as `verify-github-secrets.ps1` and `verify-terraform-backend.ps1`. Same bordered header style as `deploy-aws.yml` and `deploy-azure.yml`.
- **DEPLOYMENT_PREREQUISITES.md updated**: Added CI verification workflow reference to section 1.3, added `verify-bootstrap.yml` to workflow trigger summary table (section 8.2), added workflow step to setup checklist.

### 2026-02-25: Deployment Pipeline Deep Analysis

- **Terraform CREATES Azure AD app registrations**: The `iac/azure/modules/azure-ad/main.tf` creates 3 Azure AD app registrations (`azuread_application`), their service principals, and client secrets via Terraform. These are: (1) "Teams Meeting Fetcher" (main Graph API app with 6 permissions), (2) "Teams Meeting Fetcher Bot" (bot app, multi-tenant sign-in audience, 5 Graph permissions), (3) "Teams Meeting Fetcher Lambda EventHub Consumer" (read-only EventHub access). App registrations are NOT a manual prerequisite.
- **Two distinct Azure AD identities**: The deployment SPN (used by GitHub Actions or local dev to run Terraform) is a manual prerequisite. The application app registrations (used by the app to call Graph API, run bot, read EventHub) are created by Terraform. DEPLOYMENT_PREREQUISITES.md section 3.1 is about the deployment SPN, not the application app registrations.
- **Graph API admin consent is a post-deploy manual step**: The `azuread_app_role_assignment` resources are commented out in the azure-ad module because they require `Directory.Read.All` permission to look up the Graph service principal object ID. After Terraform creates the app registrations, an admin must manually grant consent for the declared Graph API permissions.
- **Unified vs standalone deployment**: `deploy-aws.yml` runs from `iac/` root (unified, creates both Azure+AWS). `deploy-azure.yml` runs from `iac/azure/` (standalone, Azure only). The unified deployment chains Azure outputs (app client IDs, secrets, EventHub names) into AWS module inputs.
- **Azure outputs feed AWS inputs**: The root `iac/main.tf` passes `module.azure.app_client_id`, `module.azure.app_client_secret`, `module.azure.bot_app_client_id`, `module.azure.lambda_client_id`, etc. directly into `module.aws` — no manual copy/paste of credentials needed between clouds.
- **Actual prerequisites (what must exist BEFORE terraform apply)**: (1) AWS OIDC provider + IAM role, (2) Terraform state backend (S3 + DynamoDB), (3) Azure deployment SPN with OIDC federated credentials (for CI/CD) or client secret (for local), (4) Azure deployment SPN needs: Contributor on subscription, plus Azure AD permissions (Application.ReadWrite.OwnedBy or Application.ReadWrite.All, Group.ReadWrite.All, User.ReadWrite.All for test user creation), (5) GitHub secrets/variables configured, (6) Lambda zip packages built, (7) `terraform.tfvars` populated.
- **Correct deployment sequence**: Bootstrap AWS OIDC -> Bootstrap TF state backend -> Create Azure deployment SPN -> Set GitHub secrets/vars -> Build Lambda packages -> `terraform init` -> `terraform plan` -> `terraform apply` (Azure first, then AWS) -> Grant admin consent on Terraform-created app registrations -> Update `bot_messaging_endpoint` and `graph_notification_url` with API Gateway URLs from TF outputs.
- **scenarios/nobots-eventhub/QUICKSTART.md has incorrect prereq**: Lists "Azure AD app registration" as a prerequisite, but Terraform creates it. The actual prereq is the deployment SPN (a different app registration used for authentication to run Terraform).

### 2026-02-25: Unified Workflow Rename (deploy-aws.yml -> deploy-unified.yml)

- **Rename rationale**: `deploy-aws.yml` was misleading — it runs `iac/main.tf` which deploys BOTH Azure resources (Event Hub, Key Vault, app registrations via azure module) AND AWS resources (Lambda, DynamoDB, S3 via aws module). Renamed to `deploy-unified.yml` with workflow name "Deploy Unified Infrastructure".
- **Paths trigger expanded**: Added `iac/*.tf` (entry point `main.tf`) and `iac/azure/**` (Azure module) to `on.push.paths`. Previously only triggered on `apps/aws-lambda/**`, `iac/aws/**`, `scenarios/lambda/**`.
- **workflow_dispatch preserved**: Manual trigger with dev/staging/prod environment selector unchanged.
- **deploy-azure.yml NOT touched**: That workflow is the standalone Azure-only deployment running from `iac/azure/` directory — completely separate concern.
- **References updated**: All non-historical docs, prompts, and agent files updated (14 files by Edie in prior session). Historical `.squad/` logs and decisions left as-is (they record what happened at that time).

📌 Team update (2026-02-24T21:09): Unified workflow rename complete — Orchestration logs, session log, and decision merges finalized — decided by Scribe
