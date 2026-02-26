# Fenster — History

## Project Context

- **Owner:** ivegamsft
- **Project:** Teams Meeting Fetcher — webhook-driven service for Microsoft Teams meeting transcriptions via Graph API
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Created:** 2026-02-24

## Core Context

- Unified Terraform deployment from `iac/` root; `iac/aws/` and `iac/azure/` are modules only.
- Azure auth supports SPN or OIDC via `use_oidc`; Terraform variables passed via `TF_VAR_*` in workflows.
- Workflows must avoid root `npm ci`; use per-app installs and `cache-dependency-path`.
- Azure firewall model: RBAC-only, add/remove runner IPs in a single job, prefer `/24` CIDR, use `az` for firewall rules.
- Deploy-unified runs plan/apply on same runner, uses `-input=false`, and pins Terraform versions consistently.
- Cross-cloud wiring uses `module.azure` outputs (e.g., Event Hub consumer group) rather than manual defaults.
- Bootstrap/verify scripts and docs cover AWS OIDC, Terraform state backend, and deployment prerequisites.

## Learnings

- **NEVER add `keepers` to `random_string.suffix`** — the suffix is embedded in all Azure resource names (storage account, key vault, resource group). Adding keepers forces regeneration, which cascades to destroy/recreate ALL resources. The `prevent_destroy` lifecycle on storage account correctly blocks this but causes plan failure.
- **deploy-unified.yml push trigger runs plan-only, not apply** — only `workflow_dispatch` with `mode=apply` actually deploys infrastructure. Push triggers are CI validation only.
- **deploy-admin-app.yml deploys containers independently** — it reads the existing ECS task definition from Terraform state and updates only the container image. It does NOT update env vars — those come from Terraform apply.
- **GRAPH_TENANT_DOMAIN** is wired correctly: `azuread_domains` data source -> `local.default_domain` -> `module.azure.tenant_domain` -> `var.graph_tenant_domain` in admin-app ECS task definition.
- **EventHub consumer group** for Lambda processor is cross-cloud wired from `module.azure.eventhub_lambda_consumer_group` (not a hardcoded default).
- **Key file paths for meetings pipeline config**: `iac/aws/modules/admin-app/main.tf` (ECS task def, lines 370-391), `iac/aws/modules/eventhub-processor/main.tf` (Lambda env vars, lines 93-110), `iac/azure/outputs.tf` (tenant_domain output, line 135).
- **Azure Storage Account has `prevent_destroy = true`** in `iac/azure/modules/storage/main.tf` — any Terraform change that would recreate this resource will fail the plan.

## Team Updates

📌 Team update (2026-02-26T01:43:23Z): Cleaned up temp build folders and confirmed repo/scripts do not rely on temp-lambda/tasks — reported by Fenster — decided by Scribe
