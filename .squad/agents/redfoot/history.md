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

---

## Team Updates

### 2026-02-24T08:34:33Z: E2E Test Structure Decision Merged

📌 Team update (2026-02-24T08:34:33Z): Redfoot's E2E test structure decision (human-in-the-loop pattern with Jest) has been merged into .squad/decisions.md along with Edie's doc audit findings. Documentation now includes unified quick start guides across all 3 scenarios. E2E tests should reference new QUICKSTART.md files for scenario documentation.

**Related decision:** E2E Test Structure & Human-in-the-Loop Pattern → Jest + native Node.js, phase-based structure, serial execution
