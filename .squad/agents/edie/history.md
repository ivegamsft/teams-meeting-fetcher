# Edie — History

## Project Context

- **Project:** Teams Meeting Fetcher
- **Owner:** ivegamsft
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Description:** Webhook-driven service that fetches Microsoft Teams meeting transcriptions via Graph API, with multi-cloud infrastructure and a management UI.
- **Key docs:** README.md, CONFIGURATION.md, DEPLOYMENT.md, DEPLOYMENT_RULES.md, QUICK_REFERENCE.md
- **Doc locations:** `docs/`, `specs/`, `scenarios/`

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
