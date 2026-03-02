# Redfoot — History

## Project Context

- **Project:** Teams Meeting Fetcher
- **Owner:** ivegamsft
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Description:** Webhook-driven service that fetches Microsoft Teams meeting transcriptions via Graph API, with multi-cloud infrastructure and a management UI.
- **Joined:** 2026-02-24

## Core Context

- E2E tests are human-in-the-loop with Jest; scenarios cover Teams Bot, Event Hub, and Direct Graph flows.
- Test harness uses native Node.js utilities, structured helpers, and serial execution to avoid conflicts.
- Pipeline validation confirmed Event Hub flow; key fixes included `subscribe()` error handling and consumer group alignment.
- Test artifacts and runbook live under `test/e2e/` with scenario guides in `scenarios/`.

## Learnings

### 2026-02-27: E2E Pipeline Test (Post-Terraform Apply)
- **CRITICAL:** Terraform apply deployed a 190-byte placeholder Lambda (tmf-eventhub-processor-dev) at 02:57 UTC, causing `Runtime.ImportModuleError: Cannot find module 'handler'`. The Lambda code must be built and deployed separately via `apps/aws-lambda-eventhub/package.ps1` then `aws lambda update-function-code`.
- After manual redeployment of the 15.8MB Lambda package, the pipeline resumed successfully.
- E2E timing: Graph calendar event creation to DynamoDB write took ~32 seconds (event created 03:07:43, DynamoDB write at 03:08:15).
- The `create-test-event.py` script (using auth_helper.py + MSAL client credentials) works reliably for creating test events on user2@<YOUR_TENANT_DOMAIN>.
- DynamoDB change notifications store `changeType: updated` with the resource path but do not populate `subject` or `organizerEmail` — these require separate enrichment.
- Lambda auto-recovers quickly once proper code is deployed; EventBridge triggers every ~60 seconds and queued EventHub messages are consumed on next successful invocation.

### 2026-03-01: Pipeline Diagnosis — "Meeting Not in DynamoDB"
- **Request:** Isaac reported "Sales Call: SchoolofFineArt - Anthony Lewis" (scheduled Mar 3, held Mar 1) didn't appear in DynamoDB. Lambda logs showed only "Processing mode: consume" and "Auto-detected partitions: 0,1" with 0 events for 6+ hours.
- **Diagnosis result:** The pipeline is NOT broken. All four links (Graph subscription, EventHub, Lambda, DynamoDB) are healthy and functional.
- **Proof:** Created a diagnostic test event on trustingboar's calendar. Graph delivered the notification to EventHub within ~30 seconds. Lambda processed it at next invocation and wrote 3 records to DynamoDB. Confirmed in DynamoDB scan.
- **Root cause:** The meeting's calendar event (on boldoriole's calendar, not trustingboar's) was created Feb 26 and last modified Feb 26. Holding the meeting on Mar 1 did NOT update the calendar event's `lastModifiedDateTime` in Graph. No calendar change = no Graph notification = no EventHub message.
- **Architecture gap:** Graph `/users/{id}/events` subscriptions only fire on calendar event CRUD operations. A meeting being "held" (joined, attended, transcript generated) does NOT trigger a calendar event update. To capture meeting-held and transcript-available events, the system needs subscriptions to `/communications/onlineMeetings` or a polling mechanism via the online meetings API.
- **Key facts discovered:**
  - EventHub namespace: `disableLocalAuth: true` (RBAC-only, working correctly)
  - Microsoft's Graph publisher service (`jp.prd.publisherhub.notifications.msidentity.com`) has Data Sender role on EventHub
  - Key Vault (`tmf-kv-eus-8akfpg`) has public network access disabled — CLI access blocked but not needed for pipeline
  - EventHub message retention is 24 hours; messages from Feb 25-27 (5668, 5177, 28) were all consumed
  - 3 active Graph subscriptions (trustingboar, boldoriole, and one more user) all pointing to same EventHub


📌 Team update (2026-03-02T02:13:04Z): Subscription Pipeline Expansion Architecture decision merged. Redfoot owns E2E tests for each new subscription type (callRecords, transcripts, recordings) with full lifecycle coverage: subscription creation → notification delivery → DynamoDB write → enrichment → dedup verification. Tests validate that meeting status transitions correctly (scheduled → in_progress → ended → transcribed) with proper timestamp and duration capture. — decided by Keaton

### 2026-03-02: Full E2E Test Suite Run
- **Scenario 2 (EventHub): ALL PASSING.** Pre-flight (4/4), Setup (3/3), Validation (3/3) = 10/10 non-interactive tests passed.
  - Lambda `tmf-eventhub-processor-dev` confirmed alive (nodejs20.x, last modified 2026-03-01T22:17:05).
  - DynamoDB checkpoints table has 2 partitions: partition 1 (seq=5467, updated 03:05 UTC), partition 0 (seq=5465, updated 22:11 UTC).
  - 75 CloudWatch log events in last 15 min. 15 processing events, 15 checkpoint events, 0 errors.
  - Graph API token acquisition succeeded using Azure SPN credentials from Lambda env.
  - No recent S3 event files (Lambda running on schedule but no new EventHub messages in poll window).
- **Scenario 1 (Teams Bot): 2/4 pre-flight passed, 2 failed.**
  - DynamoDB `tmf-meetings-8akfpg` (ACTIVE) and S3 `tmf-transcripts-eus-dev` both exist.
  - Lambda `meeting-bot-handler-dev` does NOT exist (not deployed).
  - BOT_APP_ID and BOT_APP_SECRET not configured (no bot registration credentials available).
- **Scenario 3 (Direct Graph): 1/4 pre-flight passed, 3 failed.**
  - S3 `tmf-webhooks-eus-dev` exists.
  - Lambda `teams-meeting-webhook-dev` does NOT exist (not deployed).
  - WEBHOOK_URL and WATCH_USER_ID not configured (no API Gateway webhook endpoint).
- **Azure placeholder: Skipped (7 tests, all describe.skip).**
- **Unit tests: 92/92 passed across 4 test suites (1.97s).**
- **Key finding:** E2E `.env.test` was loaded from project root (dotenv path in tests goes 3 dirs up from `test/e2e/aws/`), not from `test/e2e/`. Added `.env.test` to `.gitignore` to prevent accidental credential commit.
- **Infrastructure gaps for full E2E:** Scenarios 1 and 3 need their Lambdas deployed and credentials configured. Only Scenario 2 (EventHub) has complete infrastructure.
