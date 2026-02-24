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

<!-- Append new learnings below. Each entry is something lasting about the project. -->
