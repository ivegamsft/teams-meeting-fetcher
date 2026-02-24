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
