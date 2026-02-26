# Edie — History

## Project Context

- **Project:** Teams Meeting Fetcher
- **Owner:** ivegamsft
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Description:** Webhook-driven service that fetches Microsoft Teams meeting transcriptions via Graph API, with multi-cloud infrastructure and a management UI.
- **Key docs:** README.md, CONFIGURATION.md, DEPLOYMENT.md, DEPLOYMENT_RULES.md, QUICK_REFERENCE.md
- **Doc locations:** `docs/`, `specs/`, `scenarios/`

## Learnings

### 2026-02-25: temp-lambda and tasks Folder References (Edie)

- `temp-lambda/` and `tasks/` are gitignored and currently absent in the repo (no directories at root).
- Only doc-like references found: `.github/copilot-instructions.md` lists `temp-lambda/` as a gitignored temp build folder, and `.github/prompts/clean-up-docs.prompt.md` references `tasks/TODO.md` as a doc category.
- If those folders are removed/kept absent, the only doc update needed would be removing `tasks/TODO.md` from the clean-up-docs prompt (optional); `temp-lambda/` mention in copilot instructions can remain as a gitignore note.

### 2026-02-25: Unified Terraform Deployment Workflow Documentation (Edie)

**Work completed:**
- Updated 14 documentation and prompt files to reflect workflow rename: `deploy-aws.yml` → `deploy-unified.yml`
- Updated README.md to clarify "Deploy unified infrastructure (Azure + AWS)"
- Added comprehensive "GitHub Actions Deployment Workflows" section to DEPLOYMENT.md with:
  - Clear workflow dependency chain table showing all 6 workflows and their purposes
  - Critical callout emphasizing `deploy-unified.yml` must run first (creates infrastructure)
  - Instructions for running workflows via GitHub Actions UI
  - Explanation of when to use `deploy-lambda-*.yml` (code redeployment only, requires unified to exist first)
- Reorganized DEPLOYMENT.md structure: Moved workflows section before manual deployment steps
- Updated all workflow references:
  - DEPLOYMENT_PREREQUISITES.md (table)
  - .github/GITHUB_WORKFLOWS_SETUP.md (3 references)
  - .github/agents/run-e2e.agent.md
  - .github/agents/deploy-aws.agent.md (description updated)
  - .github/prompts/*.md (7 bootstrap and deploy prompts)
  - docs/QUICK_DEPLOY.md
  - docs/TEAMS_BOT_SPEC.md

**Key patterns documented:**
- **Unified deployment** (deploy-unified.yml): Orchestrates `iac/main.tf`, creates both Azure + AWS from single Terraform run
- **Standalone Azure** (deploy-azure.yml): Optional alternative, runs `iac/azure/` only, does not create AWS resources
- **Lambda redeployment** (deploy-lambda-*.yml): 4 workflows for code updates to existing functions, requires infrastructure to exist first
- Clarified that unified Terraform deploys from `iac/` root (not `iac/aws/` or `iac/azure/`)

**Important technical notes:**
- Unified deployment chains Azure outputs (app client IDs, secrets, EventHub names) into AWS Terraform module inputs
- All `deploy-lambda-*.yml` workflows depend on unified deployment having created the Lambda functions first
- GitHub Actions deployment is alternative to manual `terraform apply` — choose one pattern per environment

**Files modified:**
1. DEPLOYMENT_PREREQUISITES.md (1 table cell)
2. DEPLOYMENT.md (added new section, reorganized structure)
3. README.md (1 line)
4. .github/GITHUB_WORKFLOWS_SETUP.md (3 references)
5. .github/agents/run-e2e.agent.md (2 references)
6. .github/agents/deploy-aws.agent.md (description)
7. .github/prompts/bootstrap-aws-iam.prompt.md
8. .github/prompts/bootstrap-dev-env.prompt.md
9. .github/prompts/bootstrap-gh-workflow-creds.prompt.md
10. .github/prompts/bootstrap-teams-config.prompt.md
11. .github/prompts/deploy-aws.prompt.md (title updated)
12. docs/QUICK_DEPLOY.md
13. docs/TEAMS_BOT_SPEC.md

**Notes for team:**
- Historical decision logs (.squad/decisions.md, agent history files, orchestration logs) were not modified as they are immutable session records
- Session plan file contains one reference to deploy-aws.yml but was not modified per instructions (session artifacts)
- Fenster's unified Terraform structure (iac/main.tf orchestrating iac/azure/ + iac/aws/) is now clearly documented as the deployment model
- Pre-existing folder name discrepancy noted: DEPLOYMENT.md and DEPLOYMENT_RULES.md still reference `infra/` instead of `iac/` (separate issue, not in scope for this task)

---

### 2026-02-25: Terraform State Backend Documentation (Edie)

**Work completed:**
- Created comprehensive new section 2 in DEPLOYMENT_PREREQUISITES.md covering Terraform state backend setup (S3 + DynamoDB)
- Positioned section 2 between AWS OIDC (section 1) and Azure setup (section 3) — logical grouping of AWS prerequisites
- Documented 4 GitHub Variables (TF_STATE_BUCKET, TF_STATE_KEY, TF_STATE_REGION, TF_STATE_LOCK_TABLE) with examples and quick setup commands
- Added critical callout emphasizing Variables (public, `gh variable set`) vs Secrets (encrypted, `gh secret set`)
- Included bootstrap and verify script references with TODO comments (Fenster creating these scripts)
- Added state migration section (local→S3) with complete commands and cleanup instructions
- Reorganized all section numbering (old section 2-8 now 3-8) to accommodate new section
- Updated DEPLOYMENT.md Prerequisites to explicitly reference TF state backend setup
- Updated QUICKSTART.md "Before You Begin" to list both OIDC and TF state backend as prerequisites
- Updated checklist in DEPLOYMENT_PREREQUISITES.md with new section numbers

**Key patterns documented:**
- One-time setup per AWS account (like OIDC provider)
- S3 bucket with versioning (rollback), encryption (secrets protection), public access block (security)
- DynamoDB with PAY_PER_REQUEST billing (no provisioned capacity needed)
- GitHub Variables separate from Secrets — non-sensitive infrastructure values
- Bootstrap/verify scripts provide automation (placeholder pattern for pending Fenster scripts)

**Cross-reference updates:**
- DEPLOYMENT_PREREQUISITES.md section 1: AWS OIDC setup
- DEPLOYMENT_PREREQUISITES.md section 2: Terraform State Backend (new)
- DEPLOYMENT_PREREQUISITES.md section 3: Azure setup (was 2)
- DEPLOYMENT_PREREQUISITES.md section 4: GitHub Secrets (was 3)
- DEPLOYMENT_PREREQUISITES.md section 5: GitHub Variables (was 4, reduced to single AWS_REGION)
- DEPLOYMENT.md Prerequisites section: Added TF state backend link
- QUICKSTART.md Before You Begin: Added TF state backend link

**Important technical distinctions:**
- S3 bucket enables: team collaboration (shared state), CI/CD (workflows access state), disaster recovery (versioning), audit trail (all changes logged)
- DynamoDB table enables: concurrent deployments without race conditions via state locking
- GitHub Variables are public (visible in repo settings) — use for bucket names, region
- GitHub Secrets are encrypted — use for credentials, tokens, passwords

**Script status:**
- Bootstrap script path: `scripts/setup/bootstrap-terraform-backend.ps1/.sh` (TODO: verify exists)
- Verify script path: `scripts/verify/verify-terraform-backend.ps1/.sh` (TODO: verify exists)
- Pattern follows existing `bootstrap-github-oidc.ps1/.sh` and `verify-github-secrets.ps1/.sh`

**File modifications:**
- `DEPLOYMENT_PREREQUISITES.md`: Added section 2 (4KB), reorganized sections 3-8, updated checklist
- `DEPLOYMENT.md`: Updated Prerequisites section with TF state backend link
- `QUICKSTART.md`: Updated Before You Begin section with TF state backend link
- `.squad/decisions/inbox/edie-tf-state-backend-docs.md`: Created decision log

**Citation:** DEPLOYMENT_PREREQUISITES.md sections 1-8 (reorganized), DEPLOYMENT.md Prerequisites, QUICKSTART.md Before You Begin, .squad/decisions/inbox/edie-tf-state-backend-docs.md

---


## Learnings

### 2026-02-25: AWS OIDC Documentation Gaps Patched (Edie)

**Work completed:**
- Patched Gap 1: Added 3-sentence clarification after section 1.1 explaining one-time setup per account, shared OIDC for multiple repos, and repeat instructions for different accounts
- Patched Gap 3: Created new section 1.3 "Verify the Bootstrap" with verification commands for:
  - OIDC provider existence (`aws iam list-open-id-connect-providers`)
  - IAM role and trust policy (`aws iam get-role`, `aws iam get-role-policy`)
  - Attached policies (`aws iam list-attached-role-policies`)
  - GitHub secret existence (`gh secret list`)
  - Reference to verification script at `scripts/verify/verify-github-secrets.ps1` or `.sh`
  - Expected output examples for each check
- Added cross-reference from section 1.2 pointing to section 3 for `gh secret set` command
- Skipped Gap 2 (policy list in section 1.2) per team decision — Fenster owns that update

**Key points documented:**
- One-time setup per AWS account with option to share OIDC provider across multiple repos
- Multiple AWS accounts require separate OIDC provider and IAM role setup
- 9 IAM policies now listed in expected output
- Verification script location noted for operators
- Clear expected output examples for troubleshooting

**Citation:** DEPLOYMENT_PREREQUISITES.md sections 1.1, 1.3; cross-reference at 1.2 to section 3

---



**Decision:** Created comprehensive E2E test runbook documenting 3 human-in-the-loop test scenarios.

**Key Findings:**

1. **Human-in-the-Loop Requirement**
   - E2E tests cannot be automated because Microsoft Graph API only returns transcripts after real Teams meetings end
   - Transcript generation takes 2-10 minutes
   - Each scenario requires 25-40 minutes of human participation

2. **Three Distinct Scenarios**
   - **Scenario 1 (Teams Bot):** Bot Framework receives meetingStart/End events, polls Graph API
   - **Scenario 2 (Event Hub):** Graph subscription delivers calendar events to Azure Event Hub, Lambda processes
   - **Scenario 3 (Direct Graph):** Graph subscription sends webhook to API Gateway, Lambda stores to S3
   - All three paths converge on same data (transcripts in S3, session metadata in DynamoDB)

3. **Documentation Pattern**
   - Runbook (`test/e2e/E2E_RUNBOOK.md`) is the source of truth for operators
   - Includes pre-flight checklists, step-by-step instructions, validation steps, troubleshooting
   - Uses practical format (commands with expected output, ⚠️/✅ markers)
   - Avoids theory — focuses on actionable steps

4. **File Structure**
   - Test scripts (ad-hoc): `test-scripts/`
   - Scenario implementations: `scenarios/{lambda,nobots-eventhub,nobots}/`
   - Runbooks and guides: `test/e2e/`, `docs/`
   - No automated test files yet in `test/e2e/aws/` or `test/e2e/azure/`

5. **Troubleshooting Patterns**
   - Graph API errors → verify app registration, permissions, token acquisition
   - Infrastructure errors → check Terraform state, AWS/Azure resources exist
   - Data flow errors → monitor CloudWatch logs, check IAM roles, verify eventual consistency delays
   - Transcript delays → expected 2-10 minutes, requires 30+ seconds of audio

**Citation:** `test/e2e/E2E_RUNBOOK.md`, `test/README.md` sections added; existing files: `test-scripts/test-complete-flow.ps1`, `scenarios/`

### 2026-02-24: Documentation Audit and Quick Start Guides (Edie)

**Work completed**:
- Performed comprehensive documentation audit across all README files, guides, and scenario docs
- Discovered 3 distinct deployment scenarios: No-Bot (nobots/), Event Hub (nobots-eventhub/), Teams Bot (lambda/meeting-bot/)
- Created unified QUICKSTART.md at root providing scenario comparison and selection guidance
- Created scenario-specific quick starts:
  - scenarios/nobots-eventhub/QUICKSTART.md (Event Hub real-time scenario)
  - scenarios/lambda/meeting-bot/QUICKSTART.md (Teams Bot scenario)
  - scenarios/nobots/QUICKSTART.md (already existed, confirmed accurate)
- Documented 10 major issues in .squad/decisions/inbox/edie-doc-audit-findings.md

**Key architecture patterns discovered**:

📌 Team update (2026-02-24T21:09): Decision inbox merged, orchestration logs created — Scribe finalized documentation and decision sync
1. **No-Bot scenario**: Simple polling, local scripts, no infrastructure (scenarios/nobots/)
2. **Event Hub scenario**: Real-time Azure Event Hub + AWS Lambda, production-ready (scenarios/nobots-eventhub/)
3. **Teams Bot scenario**: Bot Framework + Lambda, highest complexity (scenarios/lambda/meeting-bot/)

**Critical issues found**:
- DEPLOYMENT.md references wrong folder name ("infra/" should be "iac/")
- README.md still references deprecated iac/azure and iac/aws deployment paths
- Missing docs: ARCHITECTURE.md, TROUBLESHOOTING.md, GLOSSARY.md
- No unified entry point for new users (fixed with QUICKSTART.md)

**Documentation structure**:
- Root docs: README.md, CONFIGURATION.md, DEPLOYMENT.md, DEPLOYMENT_RULES.md, QUICK_REFERENCE.md, QUICKSTART.md (new)
- Scenarios: Each has architecture, deployment, and testing guides
- Docs folder: Setup guides, Graph subscriptions, Teams inventory automation
- Apps folder: Teams app, Lambda, Azure service

**Project uses unified Terraform deployment from iac/ folder** — never use iac/azure/ or iac/aws/ subdirectories (those are modules only).

**User preferences noted**:
- ALL_CAPS_WITH_UNDERSCORES for root-level guide names
- Detailed step-by-step guides with expected outputs
- Real examples with actual tenant IDs and resource names
- Cost estimates for each deployment option
- Quick start guides should be actionable in 10-60 minutes

**File path patterns**:
- Quick starts: QUICKSTART.md or scenarios/*/QUICKSTART.md
- Architecture: scenarios/*/ARCHITECTURE.md
- Deployment: scenarios/*/DEPLOYMENT.md or root DEPLOYMENT.md
- Testing: scenarios/*/GUIDED-TESTING.md
- Implementation details: scenarios/*/IMPLEMENTATION.md

**Important terminology**:
- "Scenario" = deployment pattern (nobots, nobots-eventhub, lambda/meeting-bot)
- "Graph subscription" = webhook notification registration with Microsoft Graph API
- "Service Principal" = Azure AD identity for authentication
- "Event Hub" = Azure service for event streaming (alternative to direct webhooks)

**Citation:** Created QUICKSTART.md, scenarios/nobots-eventhub/QUICKSTART.md, scenarios/lambda/meeting-bot/QUICKSTART.md, .squad/decisions/inbox/edie-doc-audit-findings.md

---

## Team Updates

### 2026-02-24T08:34:33Z: Documentation Audit Merged into Decisions

📌 Team update (2026-02-24T08:34:33Z): Edie's doc audit (10 issues, 3 quick starts created) and Redfoot's E2E test structure (human-in-the-loop pattern) have been merged into .squad/decisions.md for team alignment. Orchestration and session logs created. Recommended next steps: Fix deprecated deployment paths in README.md and DEPLOYMENT.md (critical, this week).

**Related decisions:**
- Documentation Audit & Quick Start Creation → 10 issues identified, 3 quick starts delivered
- E2E Test Structure & Human-in-the-Loop Pattern → Jest with native Node.js, serial execution
