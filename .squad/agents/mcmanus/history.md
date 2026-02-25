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
