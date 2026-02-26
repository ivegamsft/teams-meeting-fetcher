# Decision: EventHub-to-Meetings Pipeline via Webhook Forwarding

**By:** McManus (Backend Dev)
**Date:** 2026-02-25

## Decision

The EventHub Lambda forwards parsed Graph notification payloads to the admin app's `/api/webhooks/graph` endpoint. The admin app processes them via `meetingService.processNotification()`, which fetches event details from Graph API and writes to the DynamoDB meetings table.

## Rationale

- The EventHub Lambda has Azure EventHub credentials but NOT Graph API credentials. It cannot fetch meeting details directly.
- The admin app already has Graph API client configured and the meeting processing logic built.
- Forwarding keeps the Lambda thin (poll + archive + forward) and the admin app as the single source of truth for meeting data.
- The forwarding is optional -- controlled by `ADMIN_APP_WEBHOOK_URL` env var. Lambda still archives to S3 regardless.

## Impact

- **Fenster (Infra):** Must add `ADMIN_APP_WEBHOOK_URL` and `WEBHOOK_AUTH_SECRET` env vars to the eventhub-processor Lambda module in Terraform (`iac/aws/modules/eventhub-processor/`).
- **Deployment:** Admin app must be deployed first (webhook route available) before Lambda can forward. S3 archival continues independently.
- **New env vars for admin app:** `WEBHOOK_AUTH_SECRET`, `WEBHOOK_CLIENT_STATE` -- need to be set in the container app config.
