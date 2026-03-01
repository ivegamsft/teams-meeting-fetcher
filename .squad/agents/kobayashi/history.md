# Kobayashi — History

## Team Updates

📌 Team update (20260227T023500Z): McManus confirmed all 7 Graph API permissions now granted on Teams Meeting Fetcher SPN (<YOUR_GRAPH_APP_ID>). Fenster synchronized IaC across Terraform and bootstrap scripts (corrected 2 wrong GUIDs from original task). Edie updated 5 documentation files with complete 7-permission list. Core blockers identified: (1) CsApplicationAccessPolicy still missing (requires Teams Admin PowerShell), (2) Isaac's account not licensed for Teams Premium (only test users). — decided by McManus/Fenster/Edie

## Project Context

- **Project:** Teams Meeting Fetcher
- **Owner:** ivegamsft
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Description:** Webhook-driven service that fetches Microsoft Teams meeting transcriptions via Graph API, with multi-cloud infrastructure and a management UI.
- **Joined:** 2026-02-24

## Learnings

### 2026-02-27: Transcript Fetching Architecture — Phase 1 + Phase 2 Recommendation

📌 Team update (2026-02-27T19:25:31Z): Designed hybrid transcript architecture after McManus identified pipeline gap. Phase 1: scheduled poller (every 5-15 min, query meetings where endTime < now - 5min, call checkForTranscript()). Phase 2: event-driven via getAllTranscripts subscription (fallback). Coordinator implemented Phase 1, live at 98.92.64.148:3000. Next: batch-enrich 1105 meetings to populate onlineMeetingId, verify poller finds transcripts. — decided by Kobayashi/McManus

### 2026-02-25: Nobots-EventHub Environment Configuration for 8akfpg Deployment

**Context:** Updated environment configuration files for the new `8akfpg` deployment suffix after a fresh Terraform apply. The previous deployment used suffix `6an5wk`.

**Key Steps:**
1. **Retrieved Azure App Secret from Terraform Outputs:**
   - Used `terraform output -json` instead of Key Vault access (RBAC permissions not configured for local user)
   - Secret was marked sensitive but available in Terraform state: `[REDACTED - rotate via Azure portal]`
   - This is the "Teams Meeting Fetcher" app (`<YOUR_GRAPH_APP_ID>`) which has Graph API permissions

2. **Updated Resource Values:**
   - All Azure resources now use `8akfpg` suffix (Key Vault, Storage Account, Event Hub Namespace/Name)
   - New Admin Security Group ID: `<YOUR_GROUP_ID>` (Terraform-managed)
   - New API Gateway URL: `https://45kg5tox6b.execute-api.us-east-1.amazonaws.com/dev/graph`
   - New Lambda Function URL: `https://yfexrxjcakoanqr5kikkzif7e40xnqhj.lambda-url.us-east-1.on.aws/`

3. **Graph API App Registration:**
   - Main app ID: `<YOUR_GRAPH_APP_ID>` (Teams Meeting Fetcher) — THIS is the one for Graph subscriptions
   - Bot app ID: `<YOUR_TEAMS_BOT_APP_ID>` (Teams Meeting Fetcher Bot)
   - Lambda EventHub Consumer app ID: `<YOUR_AUX_APP_ID>`
   - The main app has Calendars.Read and Group.Read.All permissions (verified by user's admin consent)

4. **Subscription Script Requirements (from auth_helper.py and create-group-eventhub-subscription.py):**
   - Requires: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`
   - Requires: `EVENT_HUB_NAMESPACE`, `EVENT_HUB_NAME`
   - Optional: `GRAPH_TENANT_DOMAIN` (can use tenant GUID instead)
   - Script loads from `.env.local.azure` first, then `nobots-eventhub/.env` as fallback
   - User should copy `scenarios/nobots-eventhub/.env` values to `.env.local.azure` or create symlink

5. **Files Updated:**
   - `scenarios/nobots-eventhub/.env` — Full production config with all resource values and secrets
   - `scenarios/nobots-eventhub/.env.example` — Template with placeholders and new resource names
   - Did NOT update `scenarios/nobots-eventhub/data/subscription.json` — this is historical data from previous subscription

**Commands for User (Subscription Creation):**
```bash
# From repo root
cd F:\Git\teams-meeting-fetcher

# Option 1: Copy env to expected location
copy scenarios\nobots-eventhub\.env .env.local.azure

# Option 2: Run from scenarios directory
cd scenarios\nobots-eventhub
python ..\..\scripts\graph\create-group-eventhub-subscription.py --group-id <YOUR_GROUP_ID> --expiration-hours 48 --change-type created,updated
```

**Critical Notes:**
- Admin consent MUST be granted on app `<YOUR_GRAPH_APP_ID>` for `Calendars.Read` and `Group.Read.All` (user confirmed this is done)
- App must have "Azure Event Hubs Data Sender" RBAC role on Event Hub namespace (Terraform should have assigned this)
- The Event Hub namespace uses RBAC-only auth (no SAS connection strings for Graph subscription)
- Blob storage endpoint (`https://tmfsteus8akfpg.blob.core.windows.net`) is required for rich notifications

**Decision:** Store secrets directly in scenario-specific `.env` files, not in Key Vault retrieval scripts. Terraform outputs are the source of truth for application secrets.

### 2026-02-27: Teams Auto-Transcription Configuration Investigation

**Context:** Isaac enabled Teams Premium for <YOUR_TENANT_DOMAIN> tenant but meetings are not auto-transcribing. Investigated the full configuration stack required.

**Key Findings:**

1. **Application Access Policy is MISSING (Critical Blocker):**
   - Graph API returns `403 "No application access policy found for this app"` when querying `/users/{userId}/onlineMeetings`
   - The app `<YOUR_GRAPH_APP_ID>` needs a `CsApplicationAccessPolicy` created via Teams PowerShell
   - This is a Teams-specific requirement beyond normal Graph API permissions
   - Fix: `New-CsApplicationAccessPolicy` + `Grant-CsApplicationAccessPolicy` (takes up to 30 min to propagate)

2. **Graph API Permissions Gaps:**
   - App currently has: Calendars.Read, Group.Read.All, User.Read.All (all confirmed working)
   - App is MISSING: OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All, OnlineMeetingRecording.Read.All
   - These must be added in Azure Portal and admin-consented

3. **Teams Meeting Policy Settings Required:**
   - AllowCloudRecording = True, AllowTranscription = True (check Global policy)
   - AutoRecording = Enabled (allows per-meeting auto-record option)
   - Auto-transcription is per-meeting, not global; use Meeting Templates to enforce

4. **Three Independent Layers Must All Be Configured:**
   - Layer 1: Teams Admin policies (AllowTranscription, AllowCloudRecording, etc.)
   - Layer 2: CsApplicationAccessPolicy (confirmed missing)
   - Layer 3: Graph API application permissions (partially missing)

**User (user1@<YOUR_TENANT_DOMAIN>):** ID = `<USER_OBJECT_ID_2>`
**Active Subscriptions:** 4 calendar event subscriptions confirmed working.

**Decision:** Full configuration checklist written to `.squad/decisions/inbox/kobayashi-teams-transcription-config.md`. Application Access Policy creation is the #1 priority action item.

### 2026-02-27: Teams Policy Verification and Calendar Assessment for Isaac

**Context:** Isaac requested verification of Teams admin policies and assessment of calendar cleanup needs before starting fresh transcription testing.

**Key Findings:**

1. **Calendar Status — user2@<YOUR_TENANT_DOMAIN>:**
   - Has 10 active events (created 2026-02-26 to 2026-02-27)
   - Mix of auto-generated test events ("E2E DynamoDB Direct Write 005135") and scheduled sales calls
   - Events are non-blocking but clutter calendar for manual verification
   - Recommendation: Clean up before starting fresh recording test runs (optional)

2. **Configuration IDs Located:**
   - Group ID (test users): `<YOUR_GROUP_ID>`
   - Bot App ID (Graph): `<YOUR_GRAPH_APP_ID>`
   - Teams Bot App ID: `<YOUR_TEAMS_BOT_APP_ID>`
   - Catalog App ID: **UNKNOWN** (requires interactive PowerShell query)

3. **Policy Status Check:**
   - Created helper script `scripts/temp-check-policies.ps1` for interactive Teams PowerShell
   - DryRun script cannot execute in non-interactive context (requires Teams admin auth)
   - From prior investigation: Application Access Policy confirmed MISSING (critical blocker)

4. **Recommended Steps for Isaac:**
   - Get Catalog App ID: `Connect-MicrosoftTeams; Get-TeamsApp -DistributionMethod Organization | Format-Table Id, DisplayName`
   - Run setup script DryRun to see current policy state
   - If policies missing, run non-DryRun to create them (4-24 hour propagation delay)

**Decision:** Documented full status and runbook in `.squad/decisions/inbox/kobayashi-policy-status.md`. Calendar cleanup is optional; policy verification/setup is required.

### 2026-02-28: Transcript Fetching Architecture Design

**Context:** Admin app shows 1,105 meetings but 0 transcripts. CsApplicationAccessPolicy is working (Graph returns 200 with VTT). All meetings stuck at "scheduled" status. Isaac requested architecture design for the transcript pipeline.

**Key Findings:**

1. **The code exists but nothing calls it:**
   - `meetingService.checkForTranscript(meeting)` is fully implemented — queries Graph for transcripts and calls `transcriptService.fetchAndStore()`.
   - `transcriptService.fetchAndStore()` downloads VTT content, stores to S3 (raw + sanitized), updates DynamoDB.
   - But no cron, event handler, or route ever invokes `checkForTranscript()`.

2. **Missing prerequisite data:**
   - `onlineMeetingId` is only populated when `fetchDetails()` is called on a meeting.
   - Most of the 1,105 meetings have never had `fetchDetails()` called, so `onlineMeetingId` is empty.
   - Without `onlineMeetingId`, the Graph transcript API path cannot be constructed.

3. **Calendar events don't signal meeting end:**
   - EventHub subscription monitors `groups/{groupId}/calendar/events` with `changeType: created,updated`.
   - These notify about scheduling changes, NOT meeting lifecycle (join/leave/end).
   - Meeting end must be inferred from `endTime < now` (poll-based).

4. **Graph API transcript path:**
   - List: `GET /communications/onlineMeetings/{onlineMeetingId}/transcripts`
   - Content: `GET /communications/onlineMeetings/{onlineMeetingId}/transcripts/{transcriptId}/content`
   - Transcripts available 1-5 min after meeting end (up to 20 min for long meetings).

5. **Recommended architecture: Hybrid**
   - Phase 1: Scheduled poller (every 10 min) queries meetings past their `endTime` with no transcript, calls `checkForTranscript()`.
   - Phase 2: Add `getAllTranscripts` Graph subscription for near-instant capture; poller becomes fallback.
   - Immediate action: Batch-enrich all 1,105 meetings via `POST /meetings/batch-fetch-details` to populate `onlineMeetingId`.

**Decision:** Architecture proposal written to `.squad/decisions/inbox/kobayashi-transcript-architecture.md`. Phase 1 (poller) recommended for immediate implementation. Phase 2 (event-driven) for future scale.

### 2026-02-28: Teams Meeting Semantic Model — Graph API Entity Landscape

**Context:** Isaac confused by overlapping Graph API meeting constructs. Created comprehensive semantic model mapping the five distinct entities (CalendarEvent, OnlineMeeting, CallRecord, Transcript, Recording) across three API surfaces, with no shared foreign key.

**Key Findings:**

1. **Three API surfaces, three auth models, no common key:**
   - Calendar API (scheduling CRUD) — `eventId`
   - Online Meetings API (meeting runtime + artifacts) — `onlineMeetingId` (GUID)
   - Call Records API (call completion telemetry) — `callRecordId`
   - Only bridge between Calendar and OnlineMeeting is `joinWebUrl` string match

2. **Verified via web research (current as of 2025):**
   - `/communications/callRecords` subscription: YES, tenant-wide, fires when ANY call/meeting ends, `CallRecords.Read.All`, no CsApplicationAccessPolicy needed
   - `communications/onlineMeetings/getAllTranscripts` subscription: YES, tenant-wide, fires when transcript ready, `OnlineMeetingTranscript.Read.All`, NO CsApplicationAccessPolicy needed for tenant-wide path
   - Per-meeting call events (`meetingCallEvents`): YES but per-meeting only, does not scale
   - Transcript availability: 5-30 min after meeting end (commonly ~20 min)
   - CsApplicationAccessPolicy: NOT required for tenant-wide `getAllTranscripts`; REQUIRED for `/users/{id}/onlineMeetings/...` path

3. **Recommended 3-subscription architecture:**
   - Keep: Calendar events subscription (scheduling awareness)
   - Add: `/communications/callRecords` (meeting-ended signal)
   - Add: `communications/onlineMeetings/getAllTranscripts` (transcript-ready signal)
   - Poller demoted to fallback safety net

4. **getAllTranscripts subscription requires:**
   - `includeResourceData: true` with encryption certificate
   - `lifecycleNotificationUrl` for subscriptions > 1 hour
   - Rich notification decryption in webhook handler

**Output:** Created `docs/teams-meeting-semantic-model.md` — comprehensive reference document with entity relationship diagrams, lifecycle state machine, auth model matrix, subscription evaluation, and phased implementation plan.

**Decision:** Written to `.squad/decisions/inbox/kobayashi-meeting-semantic-model.md`.

### 2026-02-28: UI Semantic Model — User-Facing Entity Hierarchy

**Context:** Isaac confused by admin UI conflating "calendar event" with "meeting." Everything called a "meeting" even if never held. Asked for a clean user-facing model that shows the progression: Calendar Item → Meeting → Transcribed Meeting.

**Key Decisions:**

1. **Entity naming:** Use "Event" as the row entity, with lifecycle stages "Scheduled → Held → Transcribed" as badge states. Never show Graph API terms (CalendarEvent, OnlineMeeting, CallRecord) in the primary UI.

2. **Stage resolution logic:** Computed client-side from existing data fields (`resolveStage()` function). No backend changes needed for Phase 1. Maps internal statuses (`notification_received`, `scheduled`, `completed`) to user-facing stages.

3. **Unified Events view:** Recommend merging Meetings and Transcripts tabs into single "Events" tab with progressive disclosure. Stage filter replaces Status filter. "Has Transcript" is a convenience shortcut.

4. **Terminal states:** "Not Held" (24h past endTime, no callRecord/transcript), "Cancelled" (event deleted), "No Transcript" (48h past meeting end, no transcript).

5. **Raw data access:** Collapsible "Raw API Data" section in detail modal showing CalendarEvent, OnlineMeeting, CallRecord, TranscriptRecord JSON. Collapsed by default — admin/debug use only.

6. **Edge cases handled:** Ad hoc calls (no calendar event, enter at Held stage), transcript-before-callRecord race condition (skip straight to Transcribed), partial data display rules.

7. **Three-phase migration:** Phase 1 (badges + rename, no backend), Phase 2 (merge tabs + filters), Phase 3 (raw data + callRecord integration).

**Output:** Created `docs/ui-semantic-model.md` — comprehensive UI design document with entity hierarchy, lifecycle diagrams, data availability matrix, badge design, modal layout, and phased migration plan.

**Decision:** Written to `.squad/decisions/inbox/kobayashi-ui-semantic-model.md`.
