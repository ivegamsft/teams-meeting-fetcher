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

📌 Team update (2026-02-24T21:09): Nobots-EventHub deployment plan merged into canonical decisions — Scribe finalized orchestration and decision sync

📌 Team update (2026-02-26T18:17:56Z): Meeting notification storage refactored to privacy-preserving model: raw notifications stored immediately (no Graph API auto-fetch), meeting details fetched only on deliberate user action via new fetch-details endpoints. Frontend needs UI for "fetch details" action on meetings with `notification_received` status. — decided by McManus

<!-- Append new learnings below. Each entry is something lasting about the project. -->

📌 Team update (2026-02-27T18:28:00Z): DynamoDB pagination vulnerability investigated and fixed. Root cause: 6 unpaginated Scan operations across meetingStore, transcriptStore, and subscriptionStore silently truncate at 1MB limit, losing datasets >1MB. Coordinator applied ExclusiveStartKey pagination to all operations (commit 5e42f63, pushed). Pagination pattern now the store-layer standard to prevent data loss at scale. — coordinated by Keaton & McManus

📌 Team update (2026-03-02T02:13:04Z): Subscription Pipeline Expansion Architecture decision finalized. Three new Graph subscriptions (/communications/callRecords, communications/onlineMeetings/getAllTranscripts, communications/onlineMeetings/getAllRecordings) to complete meeting lifecycle detection. Requires adding CallRecords.Read.All permission. Lambda notification router pattern established. Meeting model gains lifecycle fields (callRecordId, actualStart, actualEnd, duration, lifecycleState). DynamoDB new GSI on onlineMeetingId for dedup. Work plan spans 32 items across 8 phases. — decided by Keaton & team
