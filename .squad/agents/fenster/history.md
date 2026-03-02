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

## Team Updates

📌 Team update (2026-03-02T02:13:04Z): Subscription Pipeline Expansion Architecture decision merged. Fenster owns IaC updates: (1) add CallRecords.Read.All (appRole ID 45bbb07e-7321-4fd7-a8f6-3ff27e6a81c8) to iac/azure/modules/azure-ad/main.tf, graph_app_role_ids, tmf_consent_permissions, and required_resource_access; (2) add CallRecords.Read.All to scripts/grant-graph-permissions.ps1 and scripts/auto-bootstrap-azure.ps1 permission hashtables; (3) create DynamoDB GSI on onlineMeetingId for meeting dedup. — decided by Keaton

📌 Team update (2026-03-02T02:13:04Z): SPN Permission Matrix documented in ACCESS_AND_PERMISSIONS.md. All 5 SPNs now have authoritative reference with permission tables and least-privilege explanation. Fixed stale Calendars.Read → Calendars.ReadWrite, added CallRecords.Read.All, removed invalid Subscription.ReadWrite.All. Terraform modules (iac/azure/modules/azure-ad/main.tf) remain source of truth. — decided by Edie

- **Webhook Pipeline Full Restoration (2026-02-28):** Fixed subscription renewal Lambda by bundling `requests` + dependencies (certifi, charset-normalizer, idna, urllib3). Created `scenarios/lambda/requirements.txt` and `package.ps1` (mirrors eventhub pattern). Added `lifecycle { ignore_changes = [...] }` to Terraform. Recreated 2 Graph subscriptions (boldoriole, trustingboar), expiring March 7, routing to EventHub. Manually synced BlueLynx meeting to DynamoDB for verification. Subscription IDs: `58b331d8-...` (boldoriole), `cffc508a-...` (trustingboar). Pipeline fully operational.

- **Push, Build, Deploy (2026-02-28):** Pushed 4 commits. GitHub Push Protection caught 3 test scripts with hardcoded secrets. Soft-reset, unstaged secrets, added to .gitignore, recommitted. Build/Deploy succeeded. New admin app IP: 13.218.102.57. Updated Entra redirect URI (requires post-deploy verification) and Lambda webhook URL. Credential rotation needed for exposed secret.

## Learnings

- **Secret hygiene audit (2026-02-28):** The 5 tracked test-scripts (create-graph-subscription.py, create-meetings.ps1, test-complete-flow.ps1, test-eventhub-flow.py, verify-end-to-end.py) were already using `os.getenv()` / `$env:` with validation — no hardcoded secrets found in committed code. The actual secrets were in 3 UNTRACKED `probe-transcript*.py` files (already gitignored). Cleaned those locally to use `os.environ.get()` + validation. Hardened `.gitignore` with broader patterns (`*.env`, `*.local`, `*secret*`, `*credential*`, `nobots*/`) for test-scripts directory. The `**/*secret*` global gitignore pattern already existed but test-scripts-specific patterns add defense-in-depth.
- **Push Protection is the real guardrail:** GitHub Push Protection caught the original secret leak before it reached the remote. `.gitignore` prevents accidental staging of new files, but for already-tracked files, Push Protection + code review are the true defenses.
- **E2E Pipeline Validation (2026-02-28T17:10-17:17Z): ALL 5 STEPS PASSED.**
  - Step 1: Created Teams meeting "E2E Test: Pipeline Validation - Feb 28" for user2@<YOUR_TENANT_DOMAIN> via Graph API (client_credentials). Required granting `Calendars.ReadWrite` application permission (was only `Calendars.Read`). Admin consent granted via `az rest` against `/servicePrincipals/{id}/appRoleAssignments`.
  - Step 2: Graph subscription `58b331d8-...` delivered notification directly to EventHub (not through webhook-writer Lambda). Subscription uses `EventHub:https://...` URL pattern — webhook-writer Lambda is bypassed entirely in this architecture.
  - Step 3: EventHub processor Lambda logged `Wrote 3 meeting notifications to DynamoDB (0 errors)` at 17:11:15 and `Wrote 1 meeting notifications to DynamoDB (0 errors)` at 17:13:15. Total ~3 min from event creation to DynamoDB write.
  - Step 4: DynamoDB scan confirmed meeting record with full rawEventData, joinWebUrl, and onlineMeetingId already present (enriched inline by processor).
  - Step 5: Manual poller call (`POST /api/meetings/poll-transcripts` with `x-api-key` header) returned `{"success":true,"enriched":1,"transcriptsFound":0}`. Meeting fully enriched with onlineMeetingId.
  - Key finding: The `Calendars.ReadWrite` permission was missing from the app's configured permissions — only `Calendars.Read` was present. Added and consented during test. This should be synced to `scripts/permissions.json` and Terraform.
  - Key finding: The tmf-webhook-writer-dev Lambda is NOT in the current pipeline flow; Graph delivers directly to EventHub via subscription notificationUrl. The webhook-writer Lambda is a legacy/alternative path.
- **Renewal Lambda build workflow gap (2026-02-28):** The subscription-renewal Lambda was the only Lambda without a build workflow. Deploy workflow (`deploy-lambda-renewal.yml`) was zipping ONLY `renewal-function.py` without `pip install -r requirements.txt -t .`, causing the `requests` module to be missing at runtime. Fix: created `build-lambda-renewal.yml` (CI for develop/PRs) and updated `deploy-lambda-renewal.yml` to install Python deps before packaging. All 5 Lambda Terraform modules have `lifecycle { ignore_changes = [filename, source_code_hash] }` so `terraform apply` won't clobber deployed code with placeholder zips.
- **Python Lambda packaging pattern:** For Python Lambdas, dependencies must be installed into the package directory with `pip install -r requirements.txt -t .` and included in the zip alongside the handler. Unlike Node.js Lambdas (which include `node_modules/`), Python packages install as top-level directories (requests/, certifi/, etc.) that must be explicitly included in the zip glob.

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

## Team Updates

📌 Team update (2026-02-26T01:43:23Z): Cleaned up temp build folders and confirmed repo/scripts do not rely on temp-lambda/tasks — reported by Fenster — decided by Scribe

📌 Team update (2026-02-26T14:56Z): McManus implemented webhook notification forwarding: created `/api/webhooks/graph` endpoint, added webhook auth middleware, updated Lambda handler to forward Graph notifications to admin app, fixed Entra compatibility. Admin app deployed with webhook endpoint live. — decided by McManus

📌 Team update (2026-02-26T18:17:56Z): EventHub Lambda deployment gaps identified: deploy-unified.yml doesn't rebuild eventhub-processor after Terraform apply (gets overwritten with placeholder.js), admin app webhook URL must use HTTPS (self-signed certs), and Lambda needs WEBHOOK_AUTH_SECRET and NODE_TLS_REJECT_UNAUTHORIZED env vars wired in Terraform. Immediate fixes applied; Terraform module needs updates. — decided by McManus

## Cross-Agent Updates

📌 Team update (2026-02-27T02:23:00Z): Kobayashi completed Teams transcription configuration analysis. Critical blockers identified: (1) CsApplicationAccessPolicy missing (403 error on OnlineMeetings API), (2) Graph permissions missing (OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All, OnlineMeetingRecording.Read.All), (3) Isaac's account (user1@<YOUR_TENANT_DOMAIN>) NOT licensed for Teams Premium — only test users (trustingboar, boldoriole) are licensed. Full configuration checklist created with Layer 1-4 breakdown and PowerShell commands. User directive: subscription created for a-ivega is unnecessary. — decided by Kobayashi

📌 Team update (20260227T023500Z): McManus audited Graph permissions and confirmed all 7 now granted on SPN. Fixed `scripts/grant-graph-permissions.ps1` with correct 7-permission set. Fenster fully synchronized IaC (Terraform, permissions.json, auto-bootstrap, consent.json) across all 7 permissions and verified correct Application GUIDs (corrected 2 wrong GUIDs in original task). Edie updated 5 doc files with complete prerequisites list. Session outcomes: IaC consistent, docs unified, Graph audit complete. CsApplicationAccessPolicy remains Isaac's blocker. — decided by Scribe


