# Project Context

- **Owner:** ivegamsft
- **Project:** Teams Meeting Fetcher — webhook-driven service for Microsoft Teams meeting transcriptions via Graph API
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Created:** 2026-02-24

## Learnings

### Nobots-EventHub Deployment & Testing Plan (2026-02-25)

**Context:** Created comprehensive deployment and testing plan for nobots-eventhub scenario (Azure Event Hub → AWS Lambda).

**Key Findings:**
1. **Blockers identified:** Azure Client Secret expires (terraform.tfvars), Lambda zip package build process, Graph API permissions, Event Hub consumer group existence
2. **Risk assessment:** Documented 8 critical/major risks with mitigations (wrong tenant, region, RBAC timing, subscription expiration, etc.)
3. **Pre-flight validation:** 19-point checklist covers credentials, backend config, Azure setup, Lambda packages, environment files, and firewall rules
4. **Infrastructure deployment:** 101 resources (40 Azure, 60 AWS) with clear success criteria and rollback procedures
5. **Testing strategy:** 3-tier approach (5-min pre-flight checks, 5-10 min automated test, 30-45 min E2E with human-in-the-loop)

**Agent Assignments:** Clear ownership matrix (ivegamsft, Hockney, Redfoot, Fenster) with escalation to Keaton for decisions.

**Decision Gates:** 3 gates (pre-deploy, post-deploy, post-test) for go/no-go decisions at critical checkpoints.

**Output:** Comprehensive plan at `.copilot/session-state/*/plan.md` (33KB, 6 phases, 25-point validation checklist).

<!-- Append new learnings below. Each entry is something lasting about the project. -->
