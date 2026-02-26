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

## Team Updates

📌 Team update (2026-02-26T01:43:23Z): Cleaned up temp build folders and confirmed repo/scripts do not rely on temp-lambda/tasks — reported by Fenster — decided by Scribe
