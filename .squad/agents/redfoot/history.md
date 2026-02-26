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
