# Project Context

- **Owner:** ivegamsft
- **Project:** Teams Meeting Fetcher — webhook-driven service for Microsoft Teams meeting transcriptions via Graph API
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Created:** 2026-02-24

## Team Updates

📌 Team update (2026-02-25T01:30:00Z): EventHub processor Lambda fails with `consumer.subscribe(...).catch is not a function` at handler.js:207. Root cause: @azure/event-hubs returns Subscription object, not Promise. Secondary issue: consumer group mismatch ($Default vs lambda-processor). Needs try/catch refactor and config alignment. — decided by Redfoot

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
