# Fenster — History

## Project Context

- **Owner:** ivegamsft
- **Project:** Teams Meeting Fetcher — webhook-driven service for Microsoft Teams meeting transcriptions via Graph API
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Created:** 2026-02-24

## Core Context (Summarized Learnings)

**Terraform & IaC:**
- Unified deployment from `iac/` root; `iac/aws/` and `iac/azure/` are modules only.
- Azure auth: SPN or OIDC via `use_oidc` variable; Terraform variables passed via `TF_VAR_*` in workflows.
- NEVER add `keepers` to `random_string.suffix` — causes cascade destroy/recreate of all Azure resources.
- `deploy-unified.yml` push trigger runs plan-only; only `workflow_dispatch` with `mode=apply` actually deploys.
- Azure Storage Account has `prevent_destroy = true`; any terraform change that would recreate it fails the plan.
- Cross-cloud wiring: Use `module.azure` outputs (e.g., EventHub consumer group) rather than hardcoded defaults.
- Terraform is the canonical source for Graph permissions (admin consent grants via `azuread_app_role_assignment`).

**CI/CD & Deployments:**
- Workflows must avoid root `npm ci`; use per-app installs with explicit `cache-dependency-path`.
- `deploy-admin-app.yml` deploys containers independently — reads ECS task def from Terraform state, updates only container image.
- Admin app deploy workflow dynamically updates Lambda `ADMIN_APP_WEBHOOK_URL` env var with Fargate task IP after each deploy.
- Entra updates made by workflow's OIDC context may not always stick — always verify post-deploy with `az ad app show`.
- Docker Desktop may need manual restart during container builds in CI/CD environments.

**Meetings Pipeline & Graph API:**
- `GRAPH_TENANT_DOMAIN`: `azuread_domains` → `local.default_domain` → `module.azure.tenant_domain` → ECS task definition.
- CsApplicationAccessPolicy IS configured for TMF SPN (confirmed via Phase 3 poller logs — zero OnlineMeetings API errors).
- Calendar event API (created via Graph API) cannot return onlineMeetingId; must use JoinWebUrl resolution instead.
- Graph subscriptions: user-scoped `/users/{id}/events`, created via app token (client_credentials), renewed every 7 days.
- Lambda webhook forwarding has 3-retry exponential backoff (0s, 2s, 4s) for 5xx/timeout/connection errors; no retry on 4xx.

**Webhook & Subscription Management:**
- Subscription renewal Lambda deployment: bundle Python dependencies in zip via `requirements.txt` + `package.ps1`; use `lifecycle { ignore_changes = [...] }` for manual code deploy.
- Dead webhook subscriptions root cause (2026-02-28): renewal Lambda missing `requests` module — all subscriptions expired, zero webhooks fired, zero new meetings in DynamoDB.
- EventHub consumer group for Lambda processor is wired from `module.azure.eventhub_lambda_consumer_group` in Terraform outputs.

## Recent Sessions (Feb 27-28)

📌 Team update (20260227T023500Z): Fenster synchronized IaC (Terraform, permissions.json, auto-bootstrap, consent.json) across 7 confirmed Graph permissions, corrected 2 wrong GUIDs, added `azuread_app_role_assignment` resources for admin consent grants. Terraform now canonical source for permissions. — decided by Scribe

📌 Team update (2026-02-27T18:28:00Z): Pagination vulnerability fixed — 6 unpaginated Scan operations across meetingStore, transcriptStore, subscriptionStore apply ExclusiveStartKey pagination. Prevents data loss at 1MB limit. — Keaton & McManus

📌 Team update (20260228T063050Z): Fenster found 81 meetings with stale Exchange event IDs causing retry storm. McManus added enrichmentStatus/enrichmentError fields and markEnrichmentFailed() method. — McManus

📌 Team update (2026-02-28T06:52:45Z): Deployed admin app revision 55 with retry storm fix. 81 stale events marked permanent_failure, zero wasted Graph API calls. Sales blitz scripts reduced 260→5. IP: 3.88.0.51. — Fenster

- **End-to-End Trace: BlueLynx Meeting (2026-02-28):** Pipeline deep-dive revealed root cause of intake failure: subscription renewal Lambda broken (missing Python `requests` module), all Graph subscriptions expired, zero webhook notifications, zero new meetings in DynamoDB. Poller (rev 55) is healthy but has no new data. Confirmed CsApplicationAccessPolicy IS working for TMF SPN (Phase 3 successfully resolved 20+ onlineMeetingIds with zero errors).

- **Webhook Pipeline Full Restoration (2026-02-28):** Fixed subscription renewal Lambda by bundling `requests` + dependencies (certifi, charset-normalizer, idna, urllib3). Created `scenarios/lambda/requirements.txt` and `package.ps1` (mirrors eventhub pattern). Added `lifecycle { ignore_changes = [...] }` to Terraform. Recreated 2 Graph subscriptions (boldoriole, trustingboar), expiring March 7, routing to EventHub. Manually synced BlueLynx meeting to DynamoDB for verification. Subscription IDs: `58b331d8-...` (boldoriole), `cffc508a-...` (trustingboar). Pipeline fully operational.

- **Push, Build, Deploy (2026-02-28):** Pushed 4 commits. GitHub Push Protection caught 3 test scripts with hardcoded secrets. Soft-reset, unstaged secrets, added to .gitignore, recommitted. Build/Deploy succeeded. New admin app IP: 13.218.102.57. Updated Entra redirect URI (requires post-deploy verification) and Lambda webhook URL. Credential rotation needed for exposed secret.

## Learnings (Archived Details)

The following sessions (Feb 24-27) have been archived into Core Context above. Detailed entries remain in git history for reference.

- Graph permission IaC synchronization (2026-02-27)
- Admin consent grant Terraform resources (2026-02-27)  
- DynamoDB pagination fix deployment (2026-02-27)
- Transcript poller investigation (2026-02-28)
- Lambda retry backoff implementation
- Webhook forwarding deployment patterns

---

## Team Updates

📌 Team update (2026-02-26T01:43:23Z): Cleaned up temp build folders and confirmed repo/scripts do not rely on temp-lambda/tasks — reported by Fenster — decided by Scribe

📌 Team update (2026-02-26T14:56Z): McManus implemented webhook notification forwarding: created `/api/webhooks/graph` endpoint, added webhook auth middleware, updated Lambda handler to forward Graph notifications to admin app, fixed Entra compatibility. Admin app deployed with webhook endpoint live. — decided by McManus

📌 Team update (2026-02-26T18:17:56Z): EventHub Lambda deployment gaps identified: deploy-unified.yml doesn't rebuild eventhub-processor after Terraform apply (gets overwritten with placeholder.js), admin app webhook URL must use HTTPS (self-signed certs), and Lambda needs WEBHOOK_AUTH_SECRET and NODE_TLS_REJECT_UNAUTHORIZED env vars wired in Terraform. Immediate fixes applied; Terraform module needs updates. — decided by McManus

## Cross-Agent Updates

📌 Team update (2026-02-27T02:23:00Z): Kobayashi completed Teams transcription configuration analysis. Critical blockers identified: (1) CsApplicationAccessPolicy missing (403 error on OnlineMeetings API), (2) Graph permissions missing (OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All, OnlineMeetingRecording.Read.All), (3) Isaac's account (a-ivega@ibuyspy.net) NOT licensed for Teams Premium — only test users (trustingboar, boldoriole) are licensed. Full configuration checklist created with Layer 1-4 breakdown and PowerShell commands. User directive: subscription created for a-ivega is unnecessary. — decided by Kobayashi

📌 Team update (20260227T023500Z): McManus audited Graph permissions and confirmed all 7 now granted on SPN. Fixed `scripts/grant-graph-permissions.ps1` with correct 7-permission set. Fenster fully synchronized IaC (Terraform, permissions.json, auto-bootstrap, consent.json) across all 7 permissions and verified correct Application GUIDs (corrected 2 wrong GUIDs in original task). Edie updated 5 doc files with complete prerequisites list. Session outcomes: IaC consistent, docs unified, Graph audit complete. CsApplicationAccessPolicy remains Isaac's blocker. — decided by Scribe


