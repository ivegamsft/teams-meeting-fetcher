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

## Recent Sessions (Feb 28 – Mar 02)

📌 Team update (2026-03-02T02:13:04Z): Subscription Pipeline Expansion Architecture merged. Fenster owns IaC updates for CallRecords.Read.All permission. DynamoDB GSI on onlineMeetingId added for dedup. — decided by Keaton

📌 Team update (2026-03-02T14:12:00Z): Post-deploy validation complete. Fenster committed 34 files (4178788) and pushed to origin/main. Redfoot ran full E2E suite: EventHub pipeline 4/4 pre-flight + 10/10 tests PASSED, 92/92 unit tests PASSED. Minor path bug in run-e2e-tests.ps1 flagged. No critical blockers. — decided by Scribe

**Key milestones:**
- Webhook pipeline fully restored (2026-02-28): Fixed subscription renewal Lambda by bundling Python deps, recreated Graph subscriptions (boldoriole, trustingboar expiring Mar 7), routing to EventHub.
- E2E validation all steps passed (2026-02-28): Graph → EventHub → Lambda → DynamoDB pipeline confirmed operational end-to-end.
- Repository cleanup (2026-03-02): Removed legacy speckit artifacts (18 files), unused templates (11 files). Dependabot reported 16 vulnerabilities (2 critical, 5 high, 3 moderate, 6 low).

## Team Updates

📌 Team update (2026-03-02T02:13:04Z): Subscription Pipeline Expansion Architecture decision merged. Fenster owns IaC updates: (1) add CallRecords.Read.All (appRole ID 45bbb07e-7321-4fd7-a8f6-3ff27e6a81c8) to iac/azure/modules/azure-ad/main.tf, graph_app_role_ids, tmf_consent_permissions, and required_resource_access; (2) add CallRecords.Read.All to scripts/grant-graph-permissions.ps1 and scripts/auto-bootstrap-azure.ps1 permission hashtables; (3) create DynamoDB GSI on onlineMeetingId for meeting dedup. — decided by Keaton

📌 Team update (2026-03-02T02:13:04Z): SPN Permission Matrix documented in ACCESS_AND_PERMISSIONS.md. All 5 SPNs now have authoritative reference with permission tables and least-privilege explanation. Fixed stale Calendars.Read → Calendars.ReadWrite, added CallRecords.Read.All, removed invalid Subscription.ReadWrite.All. Terraform modules (iac/azure/modules/azure-ad/main.tf) remain source of truth. — decided by Edie

- **Webhook Pipeline Full Restoration (2026-02-28):** Fixed subscription renewal Lambda by bundling `requests` + dependencies (certifi, charset-normalizer, idna, urllib3). Created `scenarios/lambda/requirements.txt` and `package.ps1` (mirrors eventhub pattern). Added `lifecycle { ignore_changes = [...] }` to Terraform. Recreated 2 Graph subscriptions (boldoriole, trustingboar), expiring March 7, routing to EventHub. Manually synced BlueLynx meeting to DynamoDB for verification. Subscription IDs: `58b331d8-...` (boldoriole), `cffc508a-...` (trustingboar). Pipeline fully operational.

- **Push, Build, Deploy (2026-02-28):** Pushed 4 commits. GitHub Push Protection caught 3 test scripts with hardcoded secrets. Soft-reset, unstaged secrets, added to .gitignore, recommitted. Build/Deploy succeeded. New admin app IP: 13.218.102.57. Updated Entra redirect URI (requires post-deploy verification) and Lambda webhook URL. Credential rotation needed for exposed secret.

## Learnings

- **Repository cleanup & commit (2026-03-02):** Removed legacy speckit artifacts (18 files) + unused templates (11 files). Commit: `4178788`. Dependabot: 16 vulnerabilities reported.
- **DynamoDB GSI for dedup (2026-03-02):** Added `onlineMeetingId-index` GSI (KEYS_ONLY projection) for O(1) meeting dedup. Pattern: attribute block + global_secondary_index block in Terraform.
- **Secret hygiene audit (2026-02-28):** Test scripts already using `os.getenv()` / `$env:`. Hardened `.gitignore` patterns (`*.env`, `*.local`, `*secret*`, `*credential*`). GitHub Push Protection is the real guardrail for already-tracked files.
- **E2E Pipeline Validation (2026-02-28T17:10-17:17Z): ALL 5 STEPS PASSED.** Graph → EventHub → Lambda → DynamoDB pipeline fully operational. Graph subscription delivers directly to EventHub (webhook-writer Lambda is legacy/alternative path). ~3 min end-to-end latency.
- **Renewal Lambda build workflow gap (2026-02-28):** Fixed missing Python `requests` module by creating `build-lambda-renewal.yml` + installing deps before packaging. All Lambda modules have `lifecycle { ignore_changes = [...] }` to prevent `terraform apply` from overwriting deployed code with placeholder zips.
- **Python Lambda packaging pattern:** Install deps with `pip install -r requirements.txt -t .` into package directory (unlike Node.js `node_modules/`, Python packages install as top-level directories and must be explicitly included in zip glob).
- **Push & Deploy cycle (2026-03-02):** Pushed 4 commits to origin/main. Deploy run 22561653991: Build (28s) → Infrastructure (12m8s) → Deploy Lambda (23s) — all green. Two workflow annotations: RESOURCE_GROUP_NAME and KEY_VAULT_NAME export steps failed (need manual `gh variable set`). No secrets exposed.

---

## 2026-02-28 Enrichment & Deployment Round

📌 Team update (20260228T164000Z): Enrichment fix deployed (McManus fixed onlineMeetingId GUID resolution), secrets hardened (Fenster added .gitignore patterns + cleaned probe-transcript files). Build #22524765254 & Deploy #22524783634 passed (16/16 steps green). New IP: 34.238.246.221. Entra URI manually fixed (workflow step unreliable, needs review). onlineMeetingId enrichment improved 40→41+ meetings. — decided by Scribe

**Action item:** Entra URI updates made via workflow (`deploy-unified.yml`) do not always stick; always verify post-deploy with `az ad app show --id <CLIENT_ID>`. The Graph onlineMeetings endpoint now resolves correctly with GUID-based queries; Phase 2 & 3 transcript enrichment unblocked.

## Learnings (Archived Details)

The following sessions (Feb 24-27) have been archived into Core Context above. Detailed entries remain in git history for reference.

- Graph permission IaC synchronization (2026-02-27)
- Admin consent grant Terraform resources (2026-02-27)  
- DynamoDB pagination fix deployment (2026-02-27)
- Transcript poller investigation (2026-02-28)
- Lambda retry backoff implementation
- Webhook forwarding deployment patterns

---

## Archived Team Updates (Feb 26-27)

The following updates have been consolidated. Detailed records remain in git history.

- **2026-02-26:** Temp build folder cleanup (Scribe), webhook forwarding endpoint created (McManus), EventHub Lambda deployment gaps identified and fixed (placeholder.js issue resolved)
- **2026-02-27:** Teams transcription configuration audit completed (Kobayashi identified CsApplicationAccessPolicy + licensing blockers), Graph permissions audit confirmed 7 permissions granted on SPN, IaC synchronized across all permissions (Fenster corrected 2 wrong GUIDs), documentation unified (Edie)


