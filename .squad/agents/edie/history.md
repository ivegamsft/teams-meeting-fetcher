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
- Test tenant ibuyspy.net has only two licensed users: trustingboar@ibuyspy.net and boldoriole@ibuyspy.net. Isaac's account (a-ivega@ibuyspy.net) is NOT licensed — important for test planning.

## Team Updates

📌 Team update (2026-02-26T01:43:23Z): Cleaned up temp build folders and confirmed doc references for temp-lambda/tasks — reported by Fenster and Edie — decided by Scribe
