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
