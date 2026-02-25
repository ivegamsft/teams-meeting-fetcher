# Redfoot — History

## Project Context

- **Project:** Teams Meeting Fetcher
- **Owner:** ivegamsft
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Description:** Webhook-driven service that fetches Microsoft Teams meeting transcriptions via Graph API, with multi-cloud infrastructure and a management UI.
- **Joined:** 2026-02-24

## Learnings

### 2026-02-24: E2E Test Structure Created

**Key Files:**
- `test/e2e/helpers.js` - Shared utilities for AWS CLI, Graph API, and human-in-the-loop testing
- `test/e2e/aws/teams-bot-e2e.test.js` - Scenario 1: Bot Framework + Graph transcript polling
- `test/e2e/aws/eventhub-e2e.test.js` - Scenario 2: EventHub-based notifications with Lambda polling
- `test/e2e/aws/direct-graph-e2e.test.js` - Scenario 3: Direct Graph webhook notifications
- `test/e2e/azure/placeholder.test.js` - Placeholder for future Azure Container Apps tests
- `test/e2e/jest.config.js` - Jest config with 10-minute timeout for human interaction
- `test/e2e/package.json` - E2E test dependencies and scripts
- `test/e2e/README.md` - Comprehensive documentation and troubleshooting guide

**Architecture Decisions:**
- Human-in-the-loop pattern: Tests prompt for manual Teams meeting creation with clear instructions
- Phase-based structure: Pre-flight → Setup → Human action → Validation → Teardown → Summary
- AWS CLI via child_process.execSync for infrastructure checks (Lambda, DynamoDB, S3, CloudWatch)
- Graph API client credentials flow for token acquisition
- Serial test execution (maxWorkers: 1) to avoid resource conflicts
- Rich console output with box-drawing characters for visual clarity
- Each test is self-contained and idempotent where possible

**Test Coverage:**
1. **Teams Bot (Scenario 1):** Bot receives meetingEnd, polls /users/{id}/onlineMeetings/{id}/transcripts, stores in S3/DynamoDB
2. **EventHub (Scenario 2):** Graph → EventHub → Lambda polls → S3/DynamoDB checkpoints
3. **Direct Graph (Scenario 3):** Graph subscription → API Gateway webhook → Lambda → S3

**Helper Functions Pattern:**
- All AWS operations return structured objects with `{ exists, error, ...metadata }`
- Graph API operations use native https module (no SDK dependencies)
- Human prompts display visual boxes with clear instructions
- Error handling is graceful - tests continue where possible to show full picture

**Known Limitations:**
- Tests require human to create real Teams meetings (not automatable)
- Transcript processing can take 5-10 minutes after meeting ends
- Graph webhook notifications can take 1-3 minutes to arrive
- Tests assume AWS profile `tmf-dev` and region `us-east-1` (configurable via .env.test)

**User Preferences:**
- Descriptive console logging with emojis for status (✅ ❌ ⚠️ ℹ️ 📋 🔍)
- Box-drawing characters for visual sections
- Troubleshooting tips in summary sections
- No markdown files for planning/notes - tests are documentation

### 2026-02-24: Post-Redeployment Infrastructure Smoke Tests (suffix 8akfpg)

**Test Results Summary (16 tests):**

| # | Test | Result | Details |
|---|------|--------|---------|
| 1 | Lambda: tmf-webhook-writer-dev | PASS | Active, nodejs20.x, 35MB |
| 2 | Lambda: tmf-eventhub-processor-dev | PASS (exists) | Active, nodejs20.x, 16MB |
| 3 | Lambda: tmf-meeting-bot-dev | PASS | Active, nodejs20.x, 15MB |
| 4 | Lambda: tmf-webhook-authorizer-dev | PASS | Active, nodejs20.x, 6.5MB |
| 5 | Lambda: tmf-subscription-renewal-dev | PASS | Active, python3.11, 1.9KB |
| 6 | DynamoDB: eventhub-checkpoints | PASS | ACTIVE, 0 items (fresh) |
| 7 | DynamoDB: graph-subscriptions | PASS | ACTIVE, 0 items (fresh) |
| 8 | DynamoDB: meeting-bot-sessions-dev | PASS | ACTIVE, 0 items (fresh) |
| 9 | S3: tmf-webhooks-eus-dev | PASS | Accessible, empty |
| 10 | S3: tmf-checkpoints-eus-dev | PASS | Accessible |
| 11 | S3: tmf-transcripts-eus-dev | PASS | Accessible |
| 12 | API Gateway (new URL) | PASS | HTTP 401 (auth working) |
| 13 | Bot Webhook (new URL) | PASS | HTTP 200 `{"ok":true}` |
| 14 | EventHub Processor Invocation | FAIL | `consumer.subscribe(...).catch is not a function` |
| 15 | Webhook Writer Invocation | PASS | Correctly echoes validation token |
| 16 | Graph API Token + Subscription | PASS | Token acquired, active subscription for boldoriole@ibuyspy.net/events |

**Azure Resources:**
- EventHub Namespace: tmf-ehns-eus-8akfpg (Active, Standard, eastus)
- EventHub: tmf-eh-eus-8akfpg (Active, 2 partitions, 1d retention)
- Key Vault: tmf-kv-eus-8akfpg (Active, eastus)
- Storage Account: tmfsteus8akfpg (available, StorageV2, eastus)

**Critical Finding - EventHub Processor Code Bug:**
- The "Cannot find module 'handler'" error is RESOLVED (real code deployed)
- NEW ERROR: `consumer.subscribe(...).catch is not a function` at handler.js:207
- Root cause: `EventHubConsumerClient.subscribe()` returns a `Subscription` object, not a Promise. Chaining `.catch()` on it fails.
- File: `apps/aws-lambda-eventhub/handler.js` line 207
- This means the EventHub processor Lambda will fail every invocation until this is fixed.

**Consumer Group Mismatch:**
- Terraform output `azure_eventhub_lambda_consumer_group` = `lambda-processor`
- Lambda env var CONSUMER_GROUP = `$Default`
- These should match for proper EventHub partition ownership.

**EventBridge Rules (all ENABLED):**
- `tmf-eventhub-poll-dev`: rate(1 minute)
- `tmf-eventhub-processor-scheduler`: rate(5 minutes)
- `tmf-renew-subscriptions-dev`: cron(0 2 * * ? *) — daily at 2am

**Stale Config Fixed:**
- Updated `.env.local.azure` with new API Gateway URL (45kg5tox6b), Bot Webhook URL (yfexrxjcak...), and Bot App ID (acc484fb...)

**Meeting Bot Config Gaps:**
- WATCHED_USER_IDS is empty — needs boldoriole@ibuyspy.net
- CALLBACK_URL is empty
- GRAPH_NOTIFICATION_URL is empty
- TEAMS_CATALOG_APP_ID is empty

### 2026-02-25: Full E2E Pipeline Validation (Live Test)

**Test Method:** Created a real calendar event via Graph API and traced the notification through every pipeline stage.

**Pipeline Results:**

| Step | Component | Result | Details |
|------|-----------|--------|---------|
| 1 | Graph API: Create Meeting | PASS | Created online Teams meeting for boldoriole@ibuyspy.net via client credentials flow |
| 2 | Graph Subscription | PASS | Active subscription (d08febbf...) watching /users/boldoriole@ibuyspy.net/events, expires in ~46hrs, routes to EventHub |
| 3 | EventHub: Notification Delivery | PASS | 3 incoming messages at 01:40Z (~2 min after meeting creation). Graph notifications flowing correctly. |
| 4 | Lambda: EventHub Processor | FAIL | Triggered every 1min by EventBridge, crashes immediately: `consumer.subscribe(...).catch is not a function` at handler.js:207 |
| 5 | Storage: DynamoDB/S3 | EMPTY | All 3 DynamoDB tables (0 items), all 3 S3 buckets (0 objects). No data reaches storage. |

**Pipeline Break Point:** Step 4 — EventHub Processor Lambda (`tmf-eventhub-processor-dev`)

**Root Cause Analysis:**
1. **Primary Bug (handler.js:207):** `EventHubConsumerClient.subscribe()` returns a `Subscription` object, not a Promise. Chaining `.catch()` on it causes `TypeError`. Fix: wrap in try/catch instead.
2. **Consumer Group Mismatch:** Lambda env `CONSUMER_GROUP=$Default`, Terraform created `lambda-processor` consumer group. Should use `lambda-processor` for proper partition ownership.
3. **Outgoing Messages: 0** — Lambda never successfully reads from EventHub, so no outgoing message count despite 3 incoming.

**Pipeline Diagram:**
```
Graph API (Create Event) ──PASS──> Graph Subscription ──PASS──> EventHub (3 msgs)
                                                                      │
                                                                      ▼
                                                            Lambda Processor ──FAIL──X
                                                            (handler.js:207 crash)
                                                                      │
                                                                  [BLOCKED]
                                                                      │
                                                          ┌───────────┴───────────┐
                                                          ▼                       ▼
                                                    DynamoDB (empty)        S3 (empty)
```

**What Needs Fixing (Priority Order):**
1. Fix handler.js:207 — replace `.catch()` chain with try/catch around `consumer.subscribe()`
2. Update Lambda env CONSUMER_GROUP from `$Default` to `lambda-processor`
3. Redeploy Lambda with fixed code
4. Re-run this E2E test to verify full pipeline flow

**Meeting Created for Test:**
- Subject: "E2E Pipeline Test - Redfoot 2026-02-24 20:38"
- Event ID: AAMkADE2ZWVhN2My... (boldoriole@ibuyspy.net calendar)
- Online Teams meeting with join URL

### 2026-02-25: Post-Fix Full Pipeline Re-Validation (ALL PASS)

**Context:** deploy-unified completed with handler.js subscribe bug fix (try-catch replacing .catch()) and CONSUMER_GROUP env var updated from `$Default` to `lambda-processor`. Lambda code redeployed.

**Test Method:** Created a live calendar event via Graph API and traced the notification through every pipeline stage.

**Pipeline Results:**

| Step | Component | Result | Details |
|------|-----------|--------|---------|
| 1 | Lambda Config Check | PASS | CONSUMER_GROUP=`lambda-processor` (confirmed via get-function-configuration). Active, nodejs20.x, last modified 02:27:54Z. |
| 2 | Graph API: Create Meeting | PASS | Created Teams meeting "E2E Pipeline Retest - Redfoot 2026-02-24 21:35" for boldoriole@ibuyspy.net. Online meeting with join URL. |
| 3 | Graph Subscription | PASS | Active subscription d08febbf... watching /users/boldoriole@ibuyspy.net/events, routed to EventHub. Expires 2026-02-27. |
| 4 | EventHub: Notification Delivery | PASS | 3 notifications enqueued (1 "created" + 2 "updated") within 1-4 seconds of event creation. Partition 0: seq 12-13, Partition 1: seq 16. |
| 5 | Lambda: EventHub Processor | PASS | Running every 1 min via EventBridge. No errors. Consumes from both partitions using `lambda-processor` consumer group. ~10s per invocation. |
| 6 | DynamoDB: Checkpoints | PASS | 2 checkpoint records (partition 0: seq 14, partition 1: seq 16). Consumer group = `lambda-processor`. Updated at 02:36-02:38Z. |
| 7 | S3: Event Storage | PASS | 18 files in `eventhub/` prefix in tmf-webhooks-eus-dev. File at 02:36:15Z (4644 bytes) contains all 3 Graph notifications with correct event ID, subscription ID, and tenant ID. |

**Pipeline Diagram (ALL GREEN):**
```
Graph API (Create Event) --PASS--> Graph Subscription --PASS--> EventHub (3 msgs in ~1s)
                                                                      |
                                                                      v
                                                            Lambda Processor --PASS-->
                                                            (no errors, 10s/run)
                                                                      |
                                                              +-------+-------+
                                                              v               v
                                                        DynamoDB (PASS)  S3 (PASS)
                                                        2 checkpoints    18 event files
```

**Previously Broken Items Now Fixed:**
1. `consumer.subscribe(...).catch is not a function` at handler.js:207 -- RESOLVED (try-catch in place)
2. CONSUMER_GROUP mismatch (`$Default` vs `lambda-processor`) -- RESOLVED (env var now `lambda-processor`)
3. `Cannot find module 'handler'` -- RESOLVED (confirmed in earlier redeployment)

**Latency Observations:**
- Event created at 02:35:58Z, first EventHub notification enqueued at 02:35:59Z (1 second!)
- Lambda consumed the notification at 02:36:15Z (17 seconds after creation)
- End-to-end: Graph event creation to S3 storage in ~17 seconds

**Remaining Empty (Expected):**
- graph-subscriptions DynamoDB: 0 items (not used by EventHub flow)
- meeting-bot-sessions-dev DynamoDB: 0 items (different scenario)
- tmf-checkpoints-eus-dev S3: empty (not used by EventHub flow)
- tmf-transcripts-eus-dev S3: empty (no actual transcripts -- would need a real Teams meeting with speech)

---

## Team Updates

### 2026-02-24T08:34:33Z: E2E Test Structure Decision Merged

📌 Team update (2026-02-24T08:34:33Z): Redfoot's E2E test structure decision (human-in-the-loop pattern with Jest) has been merged into .squad/decisions.md along with Edie's doc audit findings. Documentation now includes unified quick start guides across all 3 scenarios. E2E tests should reference new QUICKSTART.md files for scenario documentation.

**Related decision:** E2E Test Structure & Human-in-the-Loop Pattern → Jest + native Node.js, phase-based structure, serial execution
