# Project Context

- **Owner:** ivegamsft
- **Project:** Teams Meeting Fetcher — webhook-driven service for Microsoft Teams meeting transcriptions via Graph API
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Created:** 2026-02-24

## Team Updates

📌 Team update (2026-02-25T01:30:00Z): EventHub processor Lambda fails with `consumer.subscribe(...).catch is not a function` at handler.js:207. Root cause: @azure/event-hubs returns Subscription object, not Promise. Secondary issue: consumer group mismatch ($Default vs lambda-processor). Needs try/catch refactor and config alignment. — decided by Redfoot

📌 Team update (2026-02-25T01:37:00Z): Fenster fixed the handler.js subscribe() bug by replacing `.catch()` with try/catch wrapper. Also fixed Terraform consumer group wiring in iac/main.tf (uses module.azure output instead of var default). Lambda deployed; Terraform changes pending manual deploy-unified.yml trigger. — decided by Fenster

📌 Team update (2026-02-26T14:56Z): Fenster completed webhook infrastructure: added Lambda env vars `ADMIN_APP_WEBHOOK_URL` and `WEBHOOK_AUTH_SECRET` to Terraform, integrated Secrets Manager, fixed deploy-undefined blockers (no keepers on suffix), and updated deploy-admin-app workflow to set Lambda webhook URL dynamically after IP discovery. Both deployments succeeded. — decided by Fenster

## Core Context (Summarized Learnings)

**Admin App Architecture:**
- Auth: Entra ID OIDC via `passport-azure-ad` (deprecated but functional). Routes at app level (`/auth/*`). API key auth (`x-api-key`) preserved for webhooks. Session-based via express-session.
- Entra config: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI` (all Terraform-managed).

**Meetings Pipeline Architecture:**
- Graph API → EventHub → Lambda → S3 archive + DynamoDB direct-write (decoupled, Lambda writes directly to meetings table).
- DynamoDB composite key: `meeting_id` (partition) + `created_at` (sort). Query before PutItem via `meetingStore._resolveKey()`.
- Notification-only storage: Raw notification data on webhook receipt, full enrichment via GET `/api/meetings/{id}/details` or POST `/batch-fetch-details`.
- Meeting model fields: `meeting_id`, `created_at`, `status`, `resource`, `rawNotification`, `detailsFetched`, `rawEventData`, `changeType` ('created' | 'updated' | 'deleted').

**Webhook & Graph Subscriptions:**
- Graph subscriptions: user-scoped `/users/{id}/events` with EventHub notification URL. Created via app token (client_credentials flow).
- Webhook auth: `WEBHOOK_AUTH_SECRET` (Bearer token) + `WEBHOOK_CLIENT_STATE` (Graph validation). Separate from dashboard auth.
- `webhookAuth` middleware in `src/middleware/auth.ts`. Routes at `/api/webhooks/*` bypass `dashboardAuth`.

**Lambda & Infrastructure:**
- EventHub Lambda: Polls events, archives to S3, writes to DynamoDB meetings table. Env vars: `MEETINGS_TABLE_NAME`, `WEBHOOK_CLIENT_STATE` (Graph validation).
- Admin app: HTTPS with self-signed certs (Docker build). Lambda requires `NODE_TLS_REJECT_UNAUTHORIZED=0` for outbound HTTPS.
- Graph subscriptions active (as of 2026-02-27): 4 user-scoped subscriptions for Calendar events. Monitor group: `2e572630-7b65-470d-82f2-0387ebb04524`.

**Scale Testing Insights:**
- Graph API latency: creates ~2.8-2.9s avg (p95 ~3.9s), mutations ~1.4-1.6s avg (no room provisioning). 100ms pacing prevents rate limiting.
- EventHub Lambda: Batches 100 notifications every ~15s, scales linearly at ~0.2 events/sec.
- S3 archive: Reliable source of truth for replay on failure. Can replay 390 notifications in ~90 seconds.
- Terraform deployment: `deploy-unified.yml` does NOT redeploy eventhub-processor Lambda (uses placeholder after plan). Manual or separate workflow required.

## Learnings

<!-- Recent work entries below -->

📌 Team update (2026-02-27T19:25:31Z): Identified transcript pipeline gap — all pipeline pieces exist but nothing calls `checkForTranscript()`. EventHub Lambda writes meetings to DynamoDB and exits. Admin app's implementation is complete but never triggered. Two fix options proposed: (A) background poller in admin app, (B) event-driven Lambda trigger. Coordinator implemented Option A, deployed to 98.92.64.148:3000. Phase 2 (event-driven subscriptions) recommended for future scaling. — decided by McManus/Kobayashi

- **Transcript Pipeline Gap Analysis (2026-02-28):** Investigated why 1105 meetings show 0 transcripts processed. Found the "missing middle" — the admin app has complete transcript storage infrastructure (transcriptService, transcriptStore, Transcript model, DynamoDB table, S3 buckets, API routes) and the meeting-bot has full transcript fetch+delivery logic, but there is NO automated trigger connecting the EventHub Lambda's meeting notifications to the admin app's `meetingService.checkForTranscript()`. The EventHub Lambda writes meeting notifications to DynamoDB and exits — it never calls the admin app or triggers transcript fetching. The admin app's `checkForTranscript()` method exists but is never called by any route, scheduler, or worker. The meeting-bot handles transcript fetching independently for its own chat-posting use case but doesn't write to the admin app's DynamoDB transcripts table. Two paths to fix: (A) Add a background poller/worker to admin app that scans for completed meetings with `onlineMeetingId` and calls `checkForTranscript()`, or (B) Have the EventHub Lambda or a new Lambda invoke the admin app's transcript check after meeting status changes.
- **Graph Permission Grant (2026-02-27):**Audited Teams Meeting Fetcher SPN (63f2f070-e55d-40d3-93f9-f46229544066) appRoleAssignments. OnlineMeetingTranscript.Read.All and OnlineMeetingRecording.Read.All already granted (Feb 24); only OnlineMeetings.Read.All was missing. Added via `az ad app permission add` + `az rest` POST. Fixed `scripts/grant-graph-permissions.ps1` with correct permission IDs. All 7 Graph permissions now verified on SPN.
- **AzureAD module deprecation:** Use `az ad app permission add` + `az rest` POST to `/servicePrincipals/{id}/appRoleAssignments` instead of deprecated AzureAD PowerShell module. Audit via `az rest --method GET --url "...appRoleAssignments"`. `az ad app permission admin-consent` may timeout but succeed server-side — always verify after.

## Cross-Agent Updates

📌 Team update (2026-02-27T02:23:00Z): Kobayashi completed Teams transcription configuration analysis. Critical blockers identified: (1) CsApplicationAccessPolicy missing (403 error on OnlineMeetings API), (2) Graph permissions missing (OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All, OnlineMeetingRecording.Read.All), (3) Isaac's account (a-ivega@ibuyspy.net) NOT licensed for Teams Premium — only test users (trustingboar, boldoriole) are licensed. Full configuration checklist created with Layer 1-4 breakdown and PowerShell commands. User directive: subscription created for a-ivega is unnecessary. — decided by Kobayashi

📌 Team update (2026-02-27T18:28:00Z): DynamoDB pagination vulnerability investigated and fixed. Root cause: 6 unpaginated Scan operations across meetingStore, transcriptStore, and subscriptionStore silently truncate at 1MB limit, losing datasets >1MB. Coordinator applied ExclusiveStartKey pagination to all operations (commit 5e42f63, pushed). Pagination pattern now the store-layer standard to prevent data loss at scale. — coordinated by Keaton & McManus


📌 Team update (20260228T063050Z): Fenster found 81 meetings with stale/deleted Exchange event IDs causing retry storm in transcriptPoller.ts every 5-min cycle. Need permanent-failure marking to stop wasting Graph API calls.
