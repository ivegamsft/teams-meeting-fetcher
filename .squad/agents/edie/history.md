# Edie — History

## Core Context

- Documentation audit identified three deployment scenarios and critical doc gaps; unified quick starts created.
- Unified deployment documentation aligned to `deploy-unified.yml`, `iac/` root, and workflow dependency chain.
- Terraform state backend prerequisites documented (S3/DynamoDB, GitHub variables vs secrets) with bootstrap/verify references.
- AWS OIDC docs patched with verification steps and one-time setup clarifications.
- Project standard: unified Terraform deployment from `iac/`, not `iac/azure/` or `iac/aws`.

## Learnings

### 2026-02-25: temp-lambda and tasks Folder References (Edie)

- `temp-lambda/` and `tasks/` are gitignored and absent.
- Only references found in `.github/copilot-instructions.md` (gitignore note) and `.github/prompts/clean-up-docs.prompt.md` (`tasks/TODO.md`).

### 2026-02-26: Sales Blitz Scale Test Plan (Edie)

- Created `docs/scale-test-plan.md` documenting a realistic sales scenario (two reps, 320 calendar events over one week) that serves as both a sales workflow demo and an E2E pipeline stress test.
- Plan includes: test parameters (9 AM–5 PM EST, 15-min call slots, 32 calls per rep per day), event format with customer details, execution script strategy with Graph API rate limiting, verification checklist spanning EventHub → Lambda → S3 → DynamoDB → Admin UI, rate limit strategy with exponential backoff, and troubleshooting table.
- Designed for clarity and actionability; team can execute immediately with confidence on what to expect and how to verify each pipeline stage.

### 2026-02-27: Teams Transcription Architecture (Edie)

- Created `docs/TEAMS_ADMIN_CONFIGURATION.md` — a repeatable, step-by-step guide for Teams administrators to configure four independent layers required for meeting transcription:
  1. **Layer 1:** Teams Admin policies (AllowTranscription, AllowCloudRecording, AutoRecording) — verified via Teams Admin Center or PowerShell
  2. **Layer 2:** CsApplicationAccessPolicy (CONFIRMED CRITICAL BLOCKER in ibuyspy.net test tenant) — must be created with app client ID `63f2f070-e55d-40d3-93f9-f46229544066` and assigned to users/globally; propagation takes 30 minutes
  3. **Layer 3:** Graph API permissions (OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All, OnlineMeetingRecording.Read.All) — added via Azure Portal and require admin consent
  4. **Layer 4:** Teams Premium license verification — users must have base Teams license + Teams Premium add-on
- Added cross-reference in CONFIGURATION.md (top of "Quick Start" section) linking to the new Teams Admin doc to clarify that app configuration assumes admin setup is complete.
- Key insight: Transcription pipeline has two-phase setup: *admin configuration* (tenant policies/permissions, one-time) + *app configuration* (credentials/secrets, per deployment). These are complementary and separate.
### 2026-02-28: Complete Prerequisites & Permissions Documentation (Edie)

- Updated `docs/TEAMS_ADMIN_CONFIGURATION.md` Layer 3 to document the complete set of **7 required Graph API permissions** (was only 3):
  1. **Calendars.Read** — Read calendar events
  2. **Group.Read.All** — Read group membership information
  3. **User.Read.All** — Read user details
  4. **OnlineMeetings.Read.All** — Read online meeting details
  5. **OnlineMeetingTranscript.Read.All** — Read meeting transcripts
  6. **OnlineMeetingRecording.Read.All** — Read meeting recordings
  7. **Subscription.ReadWrite.All** — Create and manage webhook subscriptions
- Added reference to `scripts/grant-graph-permissions.ps1` for automated permission granting (previously undocumented).
- Updated `CONFIGURATION.md` to list all 7 permissions in the Teams Admin Configuration section and corrected the security section to reflect the 7 permissions.
- Added comprehensive **Prerequisites** section to `README.md` with organizational, technical, and configuration requirements clearly separated; emphasized that Teams Admin Configuration must be completed first.
- Added warning banner in README Quick Start section directing teams to the admin configuration guide before starting development.
- Updated `scripts/setup/README.md` to document `grant-graph-permissions.ps1` with full usage, prerequisites, and integration into the setup sequence; added script to the recommended setup sequence (step 4).
- Updated `scripts/graph/README.md` with prerequisites section, environment variable explanations, and link to the admin configuration guide.
- All changes focused on answering: "What permissions are required?" and "How do I grant them?" — prerequisites now clearly listed across all entry points (README, CONFIGURATION, admin guide, and scripts docs).

## Team Updates

📌 Team update (2026-02-26T01:43:23Z): Cleaned up temp build folders and confirmed doc references for temp-lambda/tasks — reported by Fenster and Edie — decided by Scribe

📌 Team update (20260227T023500Z): McManus audited Graph permissions and confirmed all 7 now granted on SPN. Fixed `scripts/grant-graph-permissions.ps1` with correct 7-permission set. Fenster fully synchronized IaC (Terraform, permissions.json, auto-bootstrap, consent.json) with all 7 permissions and verified correct Application GUIDs (corrected 2 wrong GUIDs from task brief). Edie updated 5 documentation files (README, CONFIGURATION, TEAMS_ADMIN_CONFIGURATION, scripts/setup/README, scripts/graph/README) with complete 7-permission prerequisites list and reorganized entry points. Outcome: All 7 Graph permissions verified on SPN, IaC consistent, docs unified across all layers. CsApplicationAccessPolicy remains Isaac's action item. — decided by Scribe
