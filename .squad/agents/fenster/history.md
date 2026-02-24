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

<!-- Append new learnings below. Each entry is something lasting about the project. -->
