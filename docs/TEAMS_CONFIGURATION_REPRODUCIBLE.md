# Teams Configuration — Reproducible Setup Across Tenants

**Purpose**: Complete documentation of all Teams configuration changes to enable repeatable deployment in any tenant.

**Last Updated**: February 24, 2026  
**Maintainer**: Kobashi (Teams Architect)  
**Status**: ✅ Ready for Multi-Tenant Deployment

---

## Table of Contents

1. [Configuration Overview](#configuration-overview)
2. [Tenant Prerequisites](#tenant-prerequisites)
3. [Step-by-Step Reproducible Setup](#step-by-step-reproducible-setup)
4. [Configuration Inventory](#configuration-inventory)
5. [Validation Checklist](#validation-checklist)
6. [Rollback Procedure](#rollback-procedure)

---

## Configuration Overview

The Teams Meeting Fetcher solution consists of the following tenant-scoped components:

### Components That Must Be Configured Per Tenant

| Component                                    | Type           | Scope        | Repeatability           |
| -------------------------------------------- | -------------- | ------------ | ----------------------- |
| **Azure AD App Registration** (Bot Identity) | Infrastructure | Tenant-wide  | ✅ Script-based         |
| **Graph API Permissions**                    | IAM            | Tenant-wide  | ✅ Declarative          |
| **Teams App Manifest**                       | Configuration  | Tenant + Org | ✅ Code-based           |
| **Teams Admin Policies**                     | Policy         | Organization | ✅ PowerShell Script    |
| **Application Access Policy**                | Policy         | Organization | ✅ PowerShell Script    |
| **Security Group (Allow-List)**              | IAM            | Tenant-wide  | ✅ Manual/Script        |
| **Webhook Subscription**                     | Integration    | Tenant-wide  | ✅ API-based            |
| **Bot Service Registration**                 | Infrastructure | Tenant-wide  | ✅ Azure Portal / CLI   |
| **Lambda Environment Variables**             | Configuration  | AWS Account  | ✅ Terraform / Env file |

### Components That Are Deployment-Global (No Per-Tenant Changes)

- **Lambda Functions** - Deployed once per AWS account (can serve multiple tenants)
- **API Gateway** - Deployed once per AWS account
- **DynamoDB Tables** - Shared across tenants (keyed by tenant ID)
- **GitHub Actions Workflows** - Defined once, referenced across tenants

---

## Tenant Prerequisites

Before starting the reproducible setup, ensure you have:

### Access & Permissions

- [ ] **Global Administrator** or **Privileged Role Administrator** in target Azure AD tenant
- [ ] **Teams Administrator** role to create/modify Teams policies
- [ ] **Azure Subscription Administrator** to create app registrations and service principals
- [ ] **AWS Account Administrator** (if deploying Lambda) or credentials to existing Lambda

### Tools & Dependencies

```powershell
# Required tools — verify installation:
az version                              # Azure CLI
Connect-MicrosoftTeams                  # Teams PowerShell module
Get-Module -ListAvailable Azure.Graph   # Azure Graph PowerShell module

# Install if missing:
Install-Module -Name MicrosoftTeams -Force     # Teams module
Install-Module -Name Az.Graph -Force           # Graph module
```

### Information to Gather / Decide

| Item                           | Example                                       | Source                                    |
| ------------------------------ | --------------------------------------------- | ----------------------------------------- |
| **Tenant ID**                  | `62837751-4e48-4d06-8bcb-57be1a669b78`        | Azure AD → Properties                     |
| **Target AWS Region**          | `us-east-1`                                   | Architecture decision                     |
| **Lambda Function Endpoint**   | `https://abc123.lambda-url.us-east-1.on.aws/` | Existing Lambda URL or planned deployment |
| **Allow-List Group Name**      | `Teams Meeting Monitors`                      | Create new or use existing                |
| **Allow-List Group Object ID** | `5e7708f8-b0d2-467d-97f9-d9da4818084a`        | Will be created or located                |
| **Bot Display Name**           | `Teams Meeting Fetcher Bot`                   | Choose your own                           |
| **App Short Name**             | `Meeting Fetcher`                             | Choose your own                           |

---

## Step-by-Step Reproducible Setup

### Phase 1: Azure AD App Registration (Bot Identity)

**Objective**: Create an Azure AD application that the bot will use to authenticate to Microsoft Graph API.

#### Option A: Automated (Recommended)

```powershell
# Use the bootstrap script (will create or update SPN):
.\scripts\setup\bootstrap-azure-spn.ps1

# When prompted, provide:
# - Tenant ID
# - Bot display name (e.g., "Teams Meeting Fetcher Bot")
# - Required permissions (will be auto-selected)

# Output will include:
# - Azure AD App ID (GRAPH_CLIENT_ID)
# - Client Secret (GRAPH_CLIENT_SECRET) — save securely!
# - Service Principal Object ID
```

**Save these values — you'll need them later**:

```
GRAPH_TENANT_ID=<your-tenant-id>
GRAPH_CLIENT_ID=<app-id>
GRAPH_CLIENT_SECRET=<secret>  # USE SECURE VAULT, NOT .env
```

#### Option B: Manual (Azure Portal)

1. **Navigate to App Registrations**
   - Azure Portal → Azure AD → App registrations → New registration
   - Name: `Teams Meeting Fetcher Bot` (or your chosen name)
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: (skip for now)
   - Click **Register**

2. **Record the Application Details**
   - Copy **Application (client) ID** → save as `GRAPH_CLIENT_ID`
   - Copy **Directory (tenant) ID** → save as `GRAPH_TENANT_ID`

3. **Create Client Secret**
   - Go to **Certificates & secrets**
   - Click **New client secret**
   - Description: `Bot authentication secret`
   - Expires: `24 months` (or per org policy)
   - Copy the secret value **immediately** → save as `GRAPH_CLIENT_SECRET`
   - **⚠️ You cannot retrieve the secret again — save it now**

4. **Grant Graph API Permissions**
   - Go to **API permissions**
   - Click **Add a permission** → **Microsoft Graph** → **Application permissions**
   - Search and add the following (select all):
     - `OnlineMeetings.ReadWrite.All` — Start recording
     - `Calls.JoinGroupCall.All` — Join meetings
     - `Calls.Initiate.All` — Initiate calls
     - `OnlineMeetingTranscript.Read.All` — Read transcripts (existing)
     - `OnlineMeetings.Read.All` — Read meeting details (existing)
   - Click **Grant admin consent for {TenantName}**
   - Confirm the permission grants

---

### Phase 2: Security Group (Allow-List)

**Objective**: Create or identify an Azure AD security group that restricts bot access to specific users/organizers.

#### Option A: Create New Group

```powershell
# PowerShell:
$groupName = "Teams Meeting Monitors"
$groupDesc = "Users authorized to use Teams Meeting Fetcher"

$group = New-AzADGroup -DisplayName $groupName -MailNickName $groupName.Replace(' ', '') -Description $groupDesc

# Record the Object ID:
$groupId = $group.Id
Write-Host "Group created: $groupName"
Write-Host "Object ID: $groupId"

# Export to .env:
# ENTRA_GROUP_ID=<groupId>
```

Or via Azure Portal:

- Azure AD → Groups → New group
- Group type: **Security**
- Group name: `Teams Meeting Monitors`
- Group description: `Users authorized to use Teams Meeting Fetcher`
- Membership: Add users/organizers who should be allowed
- Click **Create**
- Record the **Object ID** → save as `ENTRA_GROUP_ID`

#### Option B: Use Existing Group

```powershell
# Find existing group:
$groupId = (Get-AzADGroup -DisplayName "Your Existing Group Name").Id
Write-Host "Using existing group: $groupId"
```

---

### Phase 3: Teams App Manifest Configuration

**Objective**: Customize the Teams app manifest with tenant-specific values.

#### 1. Update Manifest File

Edit `apps/teams-app/manifest.json`:

```json
{
  "id": "5fb90d80-a7cd-43c0-97e3-eb7577e40169",
  "developer": {
    "name": "Your Organization Name", // ← UPDATE: Your org name
    "websiteUrl": "https://your-domain.com", // ← UPDATE: Your domain
    "privacyUrl": "https://your-domain.com/privacy",
    "termsOfUseUrl": "https://your-domain.com/terms"
  },
  "validDomains": ["<YOUR_API_DOMAIN>"], // ← UPDATE: Lambda endpoint domain
  "webApplicationInfo": {
    "id": "<GRAPH_CLIENT_ID>" // ← UPDATE: Your Azure AD app ID
  },
  "bots": [
    {
      "botId": "<GRAPH_CLIENT_ID>" // ← UPDATE: Same as above
    }
  ],
  "configurableTabs": [
    {
      "configurationUrl": "https://<YOUR_API_DOMAIN>/dev/bot/config" // ← UPDATE
    }
  ]
}
```

**Required Updates**:

| Field                                  | Current Value                                    | New Value                           | Source                         |
| -------------------------------------- | ------------------------------------------------ | ----------------------------------- | ------------------------------ |
| `developer.name`                       | `Your Organization`                              | Your org name                       | Manual                         |
| `developer.websiteUrl`                 | `https://your-domain.com`                        | Your domain                         | Manual                         |
| `developer.privacyUrl`                 | `https://your-domain.com/privacy`                | Your domain                         | Manual                         |
| `developer.termsOfUseUrl`              | `https://your-domain.com/terms`                  | Your domain                         | Manual                         |
| `validDomains[0]`                      | `epo20g6lg3.execute-api.us-east-1.amazonaws.com` | Lambda endpoint                     | Lambda URL or Terraform output |
| `webApplicationInfo.id`                | `5fb90d80-a7cd-43c0-97e3-eb7577e40169`           | `GRAPH_CLIENT_ID`                   | Phase 1 output                 |
| `bots[0].botId`                        | `5fb90d80-a7cd-43c0-97e3-eb7577e40169`           | `GRAPH_CLIENT_ID`                   | Phase 1 output                 |
| `configurableTabs[0].configurationUrl` | Existing domain                                  | Lambda endpoint + `/dev/bot/config` | Lambda URL                     |

#### 2. Prepare Manifest ID (Keep the Same Across Tenants)

The manifest ID (GUID) should remain constant across tenant deployments. This identifier is used by Microsoft to recognize the same app across orgs. **DO NOT regenerate a new GUID for each tenant.**

```json
"id": "5fb90d80-a7cd-43c0-97e3-eb7577e40169"  // Keep this constant across all deployments
```

---

### Phase 4: Upload Teams App to Organization Catalog

**Objective**: Make the app available in your tenant's org catalog so it can be installed.

#### Upload via Teams App Management

1. **Access Teams Admin Center**
   - Navigate to: https://admin.teams.microsoft.com
   - Log in with **Teams Administrator** credentials

2. **Navigate to Manage apps**
   - Teams Admin Center → **Manage apps**

3. **Upload a custom app**
   - Click **Upload a new app**
   - Select `apps/teams-app/manifest.json` (updated with your values)
   - **Note**: You need `manifest-dev.json` or dev variant if deploying to dev environment
   - The system will validate and show the app configuration
   - Click **Upload**

4. **Verify Upload**
   - The app should appear in the Organization apps list
   - Search for `Meeting Fetcher`
   - Record the **Teams Catalog App ID** (assigned by Teams, not the manifest ID)

**Example Output**:

- Manifest ID: `5fb90d80-a7cd-43c0-97e3-eb7577e40169`
- Teams Catalog App ID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (auto-assigned)

---

### Phase 5: Configure Teams Admin Policies

**Objective**: Create and assign policies that auto-install the bot and enforce recording rules.

#### Prerequisites

Have ready:

- `ENTRA_GROUP_ID` from Phase 2
- `GRAPH_CLIENT_ID` from Phase 1
- Teams Catalog App ID from Phase 4

#### Run Policy Setup Script

```powershell
# Execute setup script

.\scripts\setup\setup-teams-policies.ps1 `
  -GroupId "<ENTRA_GROUP_ID>" `
  -GroupName "Teams Meeting Monitors" `
  -CatalogAppId "<TEAMS_CATALOG_APP_ID>" `
  -BotAppId "<GRAPH_CLIENT_ID>"

# Example:
.\scripts\setup\setup-teams-policies.ps1 `
  -GroupId "5e7708f8-b0d2-467d-97f9-d9da4818084a" `
  -GroupName "Teams Meeting Monitors" `
  -CatalogAppId "a1b2c3d4-e5f6-7890-abcd-ef1234567890" `
  -BotAppId "1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8"
```

**What This Does**:

1. ✅ Creates/updates "Recorded Line" App Setup Policy
   - Adds the Meeting Fetcher bot to auto-install list
   - Scoped to the allow-list group

2. ✅ Creates/updates "Recorded Line" Meeting Policy
   - Enables transcription requirement
   - Enables auto-recording for group members
   - Scoped to the allow-list group

3. ✅ Creates/updates Application Access Policy
   - Grants bot permission to access users' online meetings
   - **Tenant-wide policy** (required by Graph API)

#### Optional: Manual Policy Creation

If the script fails, create policies manually in Teams Admin Center:

**Step 1: App Setup Policy**

- Teams Admin Center → **Teams apps** → **Setup policies**
- New policy → Name: `Recorded Line`
- Pinned apps: **Add apps** → Search `Meeting Fetcher` → Add
- Assigned users: Select your group
- Save

**Step 2: Meeting Policy**

- Teams Admin Center → **Meetings** → **Meeting policies**
- New policy → Name: `Recorded Line`
- Settings:
  - Transcription: **Enabled**
  - Cloud recording: **Enabled**
  - Auto-recording: **On for everyone**
- Assigned users: Select your group
- Save

**Step 3: Application Access Policy**

- Teams Admin Center → **Teams apps** → **Permission policies**
- Application Access Policy
- Allowed apps: Add `Teams Meeting Fetcher Bot`
- Save

---

### Phase 6: Lambda Environment Variables & Webhook Configuration

**Objective**: Configure Lambda function to connect to the specific tenant.

#### Update Lambda Environment Variables

Edit Lambda function environment variables or `.env.local`:

```bash
# Graph API Configuration (from Phase 1)
GRAPH_TENANT_ID=<your-tenant-id>               # Phase 1
GRAPH_CLIENT_ID=<your-app-id>                  # Phase 1
GRAPH_CLIENT_SECRET=<your-secret>              # Phase 1 (use AWS Secrets Manager in prod)

# Teams Configuration
ENTRA_GROUP_ID=<your-group-id>                 # Phase 2
BOT_APP_ID=<your-app-id>                       # Same as GRAPH_CLIENT_ID

# Webhook Endpoint (set after Lambda is deployed)
WEBHOOK_ENDPOINT=https://<your-lambda-url>/webhook
BOT_WEBHOOK_URL=https://<your-lambda-url>/bot/callbacks

# DynamoDB Configuration (if multi-tenant, include tenant ID in table names)
MEETINGS_TABLE=tmf-meetings-<tenant-id>
SUBSCRIPTIONS_TABLE=tmf-subscriptions-<tenant-id>
```

#### Create Webhook Subscription

Once Lambda is deployed and running:

```bash
# Use Graph API to create subscription to your group's calendar events
curl -X POST "https://graph.microsoft.com/v1.0/subscriptions" \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "changeType": "created",
    "notificationUrl": "https://<your-lambda-url>/webhook",
    "resource": "/groups/<group-id>/events",
    "expirationDateTime": "2025-02-24T16:00:00Z",
    "clientState": "<random-secret>"
  }'

# Or use the inventory script:
python scripts/graph/create_webhook_subscription.py \
  --tenant-id <GRAPH_TENANT_ID> \
  --client-id <GRAPH_CLIENT_ID> \
  --client-secret <GRAPH_CLIENT_SECRET> \
  --webhook-url https://<your-lambda-url>/webhook
```

---

## Configuration Inventory

### Files Modified for Tenant-Specific Deployment

| File                                       | Purpose                 | Must Customize | Notes                                |
| ------------------------------------------ | ----------------------- | -------------- | ------------------------------------ |
| `apps/teams-app/manifest.json`             | Teams app definition    | ✅ Yes         | Bot ID, domains, org name            |
| `apps/teams-app/manifest-dev.json`         | Dev environment variant | ✅ Yes         | Same changes as manifest.json        |
| `.env.local`                               | Lambda env vars         | ✅ Yes         | Tenant IDs, secrets, URLs            |
| `iac/terraform.tfvars`                     | Infrastructure as code  | ✅ Partial     | Tenant-scoped table names            |
| Files **NOT** Modified in Deployment       |                         |                |                                      |
| `scripts/setup/setup-teams-policies.ps1`   | Policy creation script  | ❌ No          | Used as-is; params passed at runtime |
| `scripts/teams/inventory-teams-config.py`  | Configuration audit     | ❌ No          | Used as-is; reads from .env          |
| GitHub workflows `.github/workflows/*.yml` | CI/CD automation        | ❌ No          | Same across all deployments          |
| Lambda function code (`apps/aws-lambda/*`) | Bot logic               | ❌ No          | Same across all deployments          |

### Configuration Checklist

Print and complete this before deployment:

```
Tenant Name: ________________________________
Tenant ID: __________________________________
Deployment Date: ____________________________

PHASE 1: Azure AD App Registration
☐ App ID (GRAPH_CLIENT_ID): ________________
☐ Client Secret (saved securely): ✓________
☐ Tenant ID matches: ___________= _________

PHASE 2: Security Group
☐ Group Name: _____________________________
☐ Group ID (ENTRA_GROUP_ID): ______________
☐ Members added: __________________________

PHASE 3: Teams App Manifest
☐ Updated manifest.json:
  ☐ Developer name
  ☐ Website URL
  ☐ Valid domains
  ☐ Bot ID = GRAPH_CLIENT_ID
  ☐ webApplicationInfo.id = GRAPH_CLIENT_ID
☐ Updated manifest-dev.json (same changes)

PHASE 4: Teams App Upload
☐ App uploaded to org catalog
☐ Teams Catalog App ID: ____________________

PHASE 5: Teams Policies
☐ App Setup Policy "Recorded Line" created
☐ Meeting Policy "Recorded Line" created
☐ Application Access Policy created
☐ All assigned to Group: ___________________

PHASE 6: Lambda Configuration
☐ .env.local created with all values
☐ Lambda environment variables updated
☐ Webhook subscription created
☐ Subscription endpoint: ____________________

COMPLETE ☐ Ready for testing
```

---

## Validation Checklist

After completing all phases, validate the setup:

### 1. Verify Azure AD App Registration

```powershell
# Connect to Azure AD
Connect-AzureAD

# Check app was created
Get-AzureADApplication -Filter "displayName eq 'Teams Meeting Fetcher Bot'"

# Verify permissions were granted
$app = Get-AzureADApplication -Filter "displayName eq 'Teams Meeting Fetcher Bot'"
Get-AzureADApplicationPermission -ObjectId $app.ObjectId
```

**Expected Output**: Should show `Calls.JoinGroupCall.All`, `Calls.Initiate.All`, `OnlineMeetings.ReadWrite.All`

### 2. Verify Teams Policies

```powershell
# Connect to Teams
Connect-MicrosoftTeams

# Check App Setup Policy
Get-CsTeamsAppSetupPolicy -Identity "Recorded Line"

# Check Meeting Policy
Get-CsTeamsMeetingPolicy -Identity "Recorded Line"

# Check policy assignments to group
$group = Get-AzureADGroup -Filter "displayName eq 'Teams Meeting Monitors'"
Get-CsUserPolicyAssignment -PolicyType TeamsAppSetupPolicy -PolicyName "Recorded Line"
```

### 3. Verify Teams App Installed

```powershell
# List installed apps in org catalog
Get-TeamsApp -DistributionMethod Organization | Where-Object { $_.DisplayName -like "*Meeting*" }

# Should see "Teams Meeting Fetcher" or similar name
```

### 4. Verify Lambda Endpoint

```bash
# Test webhook endpoint
curl -X GET "https://<your-lambda-url>/health"

# Should return 200 OK with health status
```

### 5. Verify Webhook Subscription

```bash
# List active subscriptions for the group
python scripts/graph/check_latest_webhook.py
```

### 6. Test End-to-End Flow

1. **Create a Teams meeting** as a user in the allow-list group
2. **Check Lambda logs** for webhook notification received
3. **Verify meeting was recorded** in Graph API / Teams recording

---

## Rollback Procedure

### If Setup Fails or Needs to Be Reverted

#### 1. Delete Policies (Teams Admin Center)

```powershell
# Remove policy assignments
Remove-CsTeamsAppSetupPolicy -Identity "Recorded Line"
Remove-CsTeamsMeetingPolicy -Identity "Recorded Line"
```

#### 2. Delete Security Group

```powershell
# Only if this was a new group for this deployment
Remove-AzureADGroup -ObjectId "<ENTRA_GROUP_ID>"
```

#### 3. Delete Azure AD App

```powershell
# Removes the bot app registration
Remove-AzureADApplication -ObjectId "<app-object-id>"
```

#### 4. Delete Teams App from Org Catalog

```powershell
# Remove from org catalog
Remove-TeamsApp -Identity "<teams-catalog-app-id>" -Confirm:$false
```

#### 5. Remove Webhook Subscription

```bash
# Delete the subscription from Graph API
curl -X DELETE "https://graph.microsoft.com/v1.0/subscriptions/<subscription-id>" \
  -H "Authorization: Bearer <access-token>"
```

---

## Automation Scripts Summary

### Quick Reference for Running All Phases

```powershell
# Phase 1: Create Azure AD App
.\scripts\setup\bootstrap-azure-spn.ps1

# Phase 2: Create Security Group (manual - use Azure Portal above for now)
# Phase 3: Update manifest files (manual edits required)
# Phase 4: Upload app (manual via Teams Admin Center)

# Phase 5: Run all policy creation at once
$ENTRA_GROUP_ID = "<from-phase-2>"
$GRAPH_CLIENT_ID = "<from-phase-1>"
$TEAMS_CATALOG_APP_ID = "<from-phase-4>"

.\scripts\setup\setup-teams-policies.ps1 `
  -GroupId $ENTRA_GROUP_ID `
  -CatalogAppId $TEAMS_CATALOG_APP_ID `
  -BotAppId $GRAPH_CLIENT_ID

# Phase 6: Update Lambda env vars and create webhook (see documentation above)
```

### Inventory & Documentation

```bash
# After deployment: Document everything
python scripts/teams/run-inventory.py

# Output location: inventory/teams-config-inventory-{timestamp}.md
# This creates your permanent tenant documentation
```

---

## Multi-Tenant Strategy

### Using Same Codebase for Multiple Tenants

**Approach**: Deploy Lambda functions once in AWS account; route based on tenant ID in webhook.

#### 1. DynamoDB Tables Keyed by Tenant

```terraform
# iac/aws/modules/dynamodb/main.tf
resource "aws_dynamodb_table" "meetings" {
  name           = "tmf-meetings-${var.tenant_id}"
  #                                    ↑ Include tenant ID
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "tenantId"
  range_key      = "meetingId"

  # This allows one table per tenant with data isolation
}
```

#### 2. Webhook Endpoint Handles Multiple Tenants

Edit `apps/aws-lambda/handler.js`:

```javascript
exports.webhookHandler = async (event) => {
  const tenantId = extractTenantFromRequest(event);
  const tableName = `tmf-meetings-${tenantId}`;

  // Use tenant-specific table
  const dynamodb = new AWS.DynamoDB({ tableName });
  // ... rest of logic
};
```

#### 3. Environment Variables per Tenant

Use Lambda [environment variable overrides](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html) or AWS Secrets Manager with tenant-scoped secrets:

```bash
# AWS Secrets Manager
aws secretsmanager create-secret \
  --name "/tmf/tenant-${TENANT_ID}/config" \
  --secret-string '{
    "TENANT_ID": "'$TENANT_ID'",
    "GRAPH_CLIENT_ID": "'$CLIENT_ID'",
    "GRAPH_CLIENT_SECRET": "'$CLIENT_SECRET'"
  }'
```

#### 4. Repeat All Phases for Each Tenant

Run through Phases 1-6 once per tenant. Code and Lambda remain the same; configuration is tenant-specific.

---

## FAQ

### Q: Can I use the same Azure AD app across multiple tenants?

**A**: No. Each tenant requires its own Azure AD app registration. The app's credentials (Client Secret) are tenant-specific and cannot be reused.

### Q: What happens if I redeploy to an existing tenant?

**A**:

- If Azure AD app exists: Script will detect and offer to reset credentials
- If policies exist: Script will update them in-place
- If Teams app exists: Manual delete and re-upload required (via Teams Admin Center)

### Q: How do I backup the Teams configuration?

**A**: Run the inventory script before any changes:

```bash
python scripts/teams/run-inventory.py
# Creates: inventory/teams-config-inventory-{timestamp}.zip (backup of all configs)
```

### Q: Can I rename the bot or policies after deployment?

**A**: Yes, but you must:

1. Update manifest files
2. Delete and re-upload Teams app
3. Delete and recreate policies with new names
4. Re-run setup scripts with new names

### Q: What if a user is not in the allow-list group?

**A**: The bot will:

1. Receive the meeting start notification
2. Check if organizer is in `ENTRA_GROUP_ID` group
3. If not in group: Do nothing (no recording started)
4. If in group: Join and start recording

---

## Change Log

| Date       | Version | Changes                            | Author  |
| ---------- | ------- | ---------------------------------- | ------- |
| 2026-02-24 | 1.0.0   | Initial reproducible documentation | Kobashi |

---

## Related Documentation

- [TEAMS_BOT_SPEC.md](TEAMS_BOT_SPEC.md) — Architecture and requirements
- [CONFIGURATION.md](../CONFIGURATION.md) — General configuration guide
- [SETUP_AND_AUTOMATION_GUIDE.md](SETUP_AND_AUTOMATION_GUIDE.md) — Automation options
- [TEAMS_INVENTORY_AUTOMATION.md](TEAMS_INVENTORY_AUTOMATION.md) — Inventory script usage
