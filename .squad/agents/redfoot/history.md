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
- The `create-test-event.py` script (using auth_helper.py + MSAL client credentials) works reliably for creating test events on boldoriole@ibuyspy.net.
- DynamoDB change notifications store `changeType: updated` with the resource path but do not populate `subject` or `organizerEmail` — these require separate enrichment.
- Lambda auto-recovers quickly once proper code is deployed; EventBridge triggers every ~60 seconds and queued EventHub messages are consumed on next successful invocation.
