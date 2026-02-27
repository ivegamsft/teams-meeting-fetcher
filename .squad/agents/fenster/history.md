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
- **Webhook forwarding env vars** added: Lambda gets `ADMIN_APP_WEBHOOK_URL` and `WEBHOOK_AUTH_SECRET` (conditionally merged, won't break if empty). Admin app gets `WEBHOOK_AUTH_SECRET` via Secrets Manager and `WEBHOOK_CLIENT_STATE` as plain env var. The deploy-admin-app workflow dynamically updates the Lambda env var with the Fargate task IP after each deploy.
- **deploy-admin-app.yml now updates Lambda env vars** — after discovering the Fargate task IP, it calls `aws lambda update-function-configuration` to set `ADMIN_APP_WEBHOOK_URL` on the eventhub processor. This mirrors the Entra redirect URI update pattern.

## Team Updates

📌 Team update (2026-02-26T01:43:23Z): Cleaned up temp build folders and confirmed repo/scripts do not rely on temp-lambda/tasks — reported by Fenster — decided by Scribe

📌 Team update (2026-02-26T14:56Z): McManus implemented webhook notification forwarding: created `/api/webhooks/graph` endpoint, added webhook auth middleware, updated Lambda handler to forward Graph notifications to admin app, fixed Entra compatibility. Admin app deployed with webhook endpoint live. — decided by McManus

📌 Team update (2026-02-26T18:17:56Z): EventHub Lambda deployment gaps identified: deploy-unified.yml doesn't rebuild eventhub-processor after Terraform apply (gets overwritten with placeholder.js), admin app webhook URL must use HTTPS (self-signed certs), and Lambda needs WEBHOOK_AUTH_SECRET and NODE_TLS_REJECT_UNAUTHORIZED env vars wired in Terraform. Immediate fixes applied; Terraform module needs updates. — decided by McManus

- **Lambda webhook forwarding now has retry logic with exponential backoff** — added `forwardWithRetry()` wrapper function that retries up to 3 times (wait 0s, 2s, 4s) on timeouts, connection errors, and 5xx responses. Does NOT retry on 4xx client errors (permanent failures). On permanent failure after all retries, logs structured JSON with `FORWARD_PERMANENT_FAILURE` type, including S3 key for manual replay. Lambda response now includes `forwardRetries` and `forwardFailures` stats. Original `forwardNotification()` unchanged; only call site modified. This prevents notification loss during admin app redeployments.

## Cross-Agent Updates

📌 Team update (2026-02-27T02:23:00Z): Kobayashi completed Teams transcription configuration analysis. Critical blockers identified: (1) CsApplicationAccessPolicy missing (403 error on OnlineMeetings API), (2) Graph permissions missing (OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All, OnlineMeetingRecording.Read.All), (3) Isaac's account (a-ivega@ibuyspy.net) NOT licensed for Teams Premium — only test users (trustingboar, boldoriole) are licensed. Full configuration checklist created with Layer 1-4 breakdown and PowerShell commands. User directive: subscription created for a-ivega is unnecessary. — decided by Kobayashi

📌 Team update (20260227T023500Z): McManus audited Graph permissions and confirmed all 7 now granted on SPN. Fixed `scripts/grant-graph-permissions.ps1` with correct 7-permission set. Fenster fully synchronized IaC (Terraform, permissions.json, auto-bootstrap, consent.json) across all 7 permissions and verified correct Application GUIDs (corrected 2 wrong GUIDs in original task). Edie updated 5 doc files with complete prerequisites list. Session outcomes: IaC consistent, docs unified, Graph audit complete. CsApplicationAccessPolicy remains Isaac's blocker. — decided by Scribe

- **Graph Permissions IaC Alignment (2026-02-27):** Audited all IaC and bootstrap scripts to ensure the 7 confirmed TMF SPN Graph API permissions are fully declared. Verified Application permission GUIDs against graphpermissions.merill.net. Corrected two task-provided GUIDs that were wrong (OnlineMeetings.Read.All was `c1684f21-...-2dc8c296f8e7` in task vs correct `c1684f21-...-2dc8c296bb70`; OnlineMeetingRecording.Read.All was `190c2bb6-...` delegated ID vs correct application ID `a4a08342-...`). Changes: (1) `iac/azure/modules/azure-ad/main.tf` — replaced Calendars.ReadWrite with Calendars.Read, replaced OnlineMeetings.ReadWrite.All with OnlineMeetings.Read.All, added Subscription.ReadWrite.All to TMF app resource; (2) `scripts/grant-graph-permissions.ps1` — trimmed from 10 to 7 correct permissions; (3) `scripts/permissions.json` — expanded from 2 to all 7 entries; (4) `scripts/auto-bootstrap-azure.ps1` — replaced 4 stale/wrong entries with correct 7; (5) `scripts/consent.json` — expanded scope to all 7 permission names. Bot app Terraform resource left unchanged (uses separate permission set). `scripts/setup/bootstrap-azure-spn.ps1` and `.sh` not modified — they manage the Terraform deployment SPN, not the TMF SPN. No GitHub Actions workflows manage Graph permissions.
