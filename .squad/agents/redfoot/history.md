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
