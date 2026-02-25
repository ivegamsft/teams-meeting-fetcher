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

---

## Team Updates

### 2026-02-24T08:34:33Z: E2E Test Structure Decision Merged

📌 Team update (2026-02-24T08:34:33Z): Redfoot's E2E test structure decision (human-in-the-loop pattern with Jest) has been merged into .squad/decisions.md along with Edie's doc audit findings. Documentation now includes unified quick start guides across all 3 scenarios. E2E tests should reference new QUICKSTART.md files for scenario documentation.

**Related decision:** E2E Test Structure & Human-in-the-Loop Pattern → Jest + native Node.js, phase-based structure, serial execution
