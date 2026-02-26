# Project Context

- **Owner:** ivegamsft
- **Project:** Teams Meeting Fetcher — webhook-driven service for Microsoft Teams meeting transcriptions via Graph API
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Created:** 2026-02-24

## Team Updates

📌 Team update (2026-02-25T01:30:00Z): EventHub processor Lambda fails with `consumer.subscribe(...).catch is not a function` at handler.js:207. Root cause: @azure/event-hubs returns Subscription object, not Promise. Secondary issue: consumer group mismatch ($Default vs lambda-processor). Needs try/catch refactor and config alignment. — decided by Redfoot

📌 Team update (2026-02-25T01:37:00Z): Fenster fixed the handler.js subscribe() bug by replacing `.catch()` with try/catch wrapper. Also fixed Terraform consumer group wiring in iac/main.tf (uses module.azure output instead of var default). Lambda deployed; Terraform changes pending manual deploy-unified.yml trigger. — decided by Fenster

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- Admin app auth now uses Entra ID (Azure AD) OIDC via `passport` + `passport-azure-ad` OIDCStrategy. Login is at `/auth/login`, callback at `/auth/callback`, logout at `/auth/logout`. Session-based via express-session.
- API key auth (`x-api-key` header) is preserved for programmatic/webhook access alongside Entra sessions.
- Auth routes are mounted at app level (`/auth/*`), not under `/api/auth/*`, because the OIDC flow uses browser redirects. The `/api/auth/status` endpoint remains for frontend status checks.
- `passport-azure-ad` is deprecated upstream but still functional. If it breaks, replace with `@azure/msal-node` + custom passport strategy.
- Entra config env vars: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`. All set by Terraform.
- Meetings pipeline: Graph API sends calendar event changes to EventHub. EventHub Lambda polls events, archives to S3, and optionally forwards to admin app webhook. Admin app webhook route (`/api/webhooks/graph`) calls `meetingService.processNotification()` which fetches event details from Graph API and writes to DynamoDB meetings table.
- Webhook auth uses `WEBHOOK_AUTH_SECRET` (Bearer token) and `WEBHOOK_CLIENT_STATE` (Graph notification validation). Separate from dashboard auth (API key / Entra session).
- The `webhookAuth` middleware is in `src/middleware/auth.ts`. Webhook routes at `/api/webhooks/*` bypass `dashboardAuth` and use `webhookAuth` instead.
- EventHub Lambda env vars for forwarding: `ADMIN_APP_WEBHOOK_URL` (admin app webhook endpoint URL) and `WEBHOOK_AUTH_SECRET` (bearer token). Not yet wired in Terraform -- Fenster needs to add these to `iac/aws/modules/eventhub-processor/`.
- `configStore` tracks webhook activity via `updateLastNotification()` and `updateLastWebhook()` methods (timestamp fields on the config document).
- DynamoDB meetings table uses composite key: `meeting_id` (partition) + `created_at` (sort). The `meetingStore._resolveKey()` does a Query to get both key parts before GetItem.
