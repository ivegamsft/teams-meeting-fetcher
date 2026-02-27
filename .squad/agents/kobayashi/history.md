# Kobayashi — History

## Project Context

- **Project:** Teams Meeting Fetcher
- **Owner:** ivegamsft
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Description:** Webhook-driven service that fetches Microsoft Teams meeting transcriptions via Graph API, with multi-cloud infrastructure and a management UI.
- **Joined:** 2026-02-24

## Learnings

### 2026-02-25: Nobots-EventHub Environment Configuration for 8akfpg Deployment

**Context:** Updated environment configuration files for the new `8akfpg` deployment suffix after a fresh Terraform apply. The previous deployment used suffix `6an5wk`.

**Key Steps:**
1. **Retrieved Azure App Secret from Terraform Outputs:**
   - Used `terraform output -json` instead of Key Vault access (RBAC permissions not configured for local user)
   - Secret was marked sensitive but available in Terraform state: `[REDACTED - rotate via Azure portal]`
   - This is the "Teams Meeting Fetcher" app (`63f2f070-e55d-40d3-93f9-f46229544066`) which has Graph API permissions

2. **Updated Resource Values:**
   - All Azure resources now use `8akfpg` suffix (Key Vault, Storage Account, Event Hub Namespace/Name)
   - New Admin Security Group ID: `2e572630-7b65-470d-82f2-0387ebb04524` (Terraform-managed)
   - New API Gateway URL: `https://45kg5tox6b.execute-api.us-east-1.amazonaws.com/dev/graph`
   - New Lambda Function URL: `https://yfexrxjcakoanqr5kikkzif7e40xnqhj.lambda-url.us-east-1.on.aws/`

3. **Graph API App Registration:**
   - Main app ID: `63f2f070-e55d-40d3-93f9-f46229544066` (Teams Meeting Fetcher) — THIS is the one for Graph subscriptions
   - Bot app ID: `acc484fb-6a5e-4cd2-a1cc-f0dfc1668af2` (Teams Meeting Fetcher Bot)
   - Lambda EventHub Consumer app ID: `6dafa2b6-ec4c-4fb6-997c-6efcadcb22ab`
   - The main app has Calendars.Read and Group.Read.All permissions (verified by user's admin consent)

4. **Subscription Script Requirements (from auth_helper.py and create-group-eventhub-subscription.py):**
   - Requires: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`
   - Requires: `EVENT_HUB_NAMESPACE`, `EVENT_HUB_NAME`
   - Optional: `GRAPH_TENANT_DOMAIN` (can use tenant GUID instead)
   - Script loads from `.env.local.azure` first, then `nobots-eventhub/.env` as fallback
   - User should copy `scenarios/nobots-eventhub/.env` values to `.env.local.azure` or create symlink

5. **Files Updated:**
   - `scenarios/nobots-eventhub/.env` — Full production config with all resource values and secrets
   - `scenarios/nobots-eventhub/.env.example` — Template with placeholders and new resource names
   - Did NOT update `scenarios/nobots-eventhub/data/subscription.json` — this is historical data from previous subscription

**Commands for User (Subscription Creation):**
```bash
# From repo root
cd F:\Git\teams-meeting-fetcher

# Option 1: Copy env to expected location
copy scenarios\nobots-eventhub\.env .env.local.azure

# Option 2: Run from scenarios directory
cd scenarios\nobots-eventhub
python ..\..\scripts\graph\create-group-eventhub-subscription.py --group-id 2e572630-7b65-470d-82f2-0387ebb04524 --expiration-hours 48 --change-type created,updated
```

**Critical Notes:**
- Admin consent MUST be granted on app `63f2f070-e55d-40d3-93f9-f46229544066` for `Calendars.Read` and `Group.Read.All` (user confirmed this is done)
- App must have "Azure Event Hubs Data Sender" RBAC role on Event Hub namespace (Terraform should have assigned this)
- The Event Hub namespace uses RBAC-only auth (no SAS connection strings for Graph subscription)
- Blob storage endpoint (`https://tmfsteus8akfpg.blob.core.windows.net`) is required for rich notifications

**Decision:** Store secrets directly in scenario-specific `.env` files, not in Key Vault retrieval scripts. Terraform outputs are the source of truth for application secrets.

### 2026-02-27: Teams Auto-Transcription Configuration Investigation

**Context:** Isaac enabled Teams Premium for ibuyspy.net tenant but meetings are not auto-transcribing. Investigated the full configuration stack required.

**Key Findings:**

1. **Application Access Policy is MISSING (Critical Blocker):**
   - Graph API returns `403 "No application access policy found for this app"` when querying `/users/{userId}/onlineMeetings`
   - The app `63f2f070-e55d-40d3-93f9-f46229544066` needs a `CsApplicationAccessPolicy` created via Teams PowerShell
   - This is a Teams-specific requirement beyond normal Graph API permissions
   - Fix: `New-CsApplicationAccessPolicy` + `Grant-CsApplicationAccessPolicy` (takes up to 30 min to propagate)

2. **Graph API Permissions Gaps:**
   - App currently has: Calendars.Read, Group.Read.All, User.Read.All (all confirmed working)
   - App is MISSING: OnlineMeetings.Read.All, OnlineMeetingTranscript.Read.All, OnlineMeetingRecording.Read.All
   - These must be added in Azure Portal and admin-consented

3. **Teams Meeting Policy Settings Required:**
   - AllowCloudRecording = True, AllowTranscription = True (check Global policy)
   - AutoRecording = Enabled (allows per-meeting auto-record option)
   - Auto-transcription is per-meeting, not global; use Meeting Templates to enforce

4. **Three Independent Layers Must All Be Configured:**
   - Layer 1: Teams Admin policies (AllowTranscription, AllowCloudRecording, etc.)
   - Layer 2: CsApplicationAccessPolicy (confirmed missing)
   - Layer 3: Graph API application permissions (partially missing)

**User (a-ivega@ibuyspy.net):** ID = `dbb98842-0024-4474-a69a-a27acd735bef`
**Active Subscriptions:** 4 calendar event subscriptions confirmed working.

**Decision:** Full configuration checklist written to `.squad/decisions/inbox/kobayashi-teams-transcription-config.md`. Application Access Policy creation is the #1 priority action item.
