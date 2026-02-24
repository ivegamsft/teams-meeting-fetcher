# Bootstrap Teams Configuration

**Purpose**: Set up Teams bot registration, policies, and webhook subscriptions from scratch.

**When to use**: New Teams tenant setup, Teams configuration migration, or complete Teams environment recreation.

**Prerequisites**:

- Azure AD permissions (Application Administrator or higher)
- Teams Admin Center access (Teams Administrator role)
- Microsoft Graph PowerShell SDK or CLI installed
- Python 3.10+ with Graph SDK (`pip install msgraph-core azure-identity`)
- Local `.env.local` file with Azure credentials

---

## Step 1: Verify Tenant Access

```bash
# Verify current tenant ID
az account show --query "tenantId" --output tsv

# This must match GRAPH_TENANT_ID from your .env.local
cat .env.local | grep GRAPH_TENANT_ID
```

---

## Step 2: Register Bot Application in Azure AD

```bash
# Create Azure AD application for the bot
az ad app create --display-name "Teams Meeting Fetcher Bot"

# Copy the returned appId (this becomes BOT_APP_ID)
# Save it to .env.local

# Create service principal for the app
az ad sp create --id <BOT_APP_ID>
```

**Output to save**:

- `appId` → `BOT_APP_ID` in `.env.local`

---

## Step 3: Generate Bot Application Password

```bash
# Create password credential
az ad app credential create \
  --id <BOT_APP_ID> \
  --display-name "TeamsBot" \
  --years 1

# Copy the returned password (shown only once)
# Save as BOT_APP_PASSWORD in .env.local

# Verify credential created
az ad app credential list --id <BOT_APP_ID>
```

**Important**: Store `BOT_APP_PASSWORD` securely. Cannot be retrieved after creation.

---

## Step 4: Configure Bot Permissions (Application Roles)

```bash
# Add permissions needed for Teams meeting recording/transcript access

# Using PowerShell (recommended for complex role assignments):
$appId = "<BOT_APP_ID>"
$tenantId = "<GRAPH_TENANT_ID>"

# Connect to Microsoft Graph
Connect-MgGraph -TenantId $tenantId -AppId $appId -ClientSecret "<BOT_APP_PASSWORD>"

# Grant permissions for:
# - OnlineMeetingTranscript.Read.All
# - OnlineMeetings.Read.All
# - CallRecords.Read.All

# Alternative: Use Azure Portal
# 1. Go to Azure AD > App registrations > your app
# 2. Permissions > Add a permission
# 3. Select Microsoft Graph
# 4. Select Application permissions
# 5. Add: OnlineMeetingTranscript.Read.All, OnlineMeetings.Read.All, CallRecords.Read.All
# 6. Admin consent
```

---

## Step 5: Create Security Group for Bot Access

```bash
# Create Azure AD security group for Teams bot users
az ad group create \
  --display-name "Teams Meeting Fetcher Users" \
  --mail-nickname "teams-meeting-fetcher-users"

# Capture returned ID as ALLOWED_GROUP_ID
# Save to .env.local

# Verify group created
az ad group show --group <ALLOWED_GROUP_ID>
```

---

## Step 6: Create Teams Admin Policies

```bash
# Create App Setup Policy for bot deployment
# This requires Teams PowerShell module

# Install Teams PowerShell (if not already)
Install-Module -Name MicrosoftTeams -Force

# Connect to Teams
Connect-MicrosoftTeams -Credential (Get-Credential)

# Create policy allowing bot installation
New-CsTeamsAppSetupPolicy `
  -Identity "AllowTeamsMeetingFetcher" `
  -Description "Policy allowing Teams Meeting Fetcher bot installation" `
  -AllowUserInstalls $true `
  -AllowSideLoading $true

# Assign policy to security group
Grant-CsTeamsAppSetupPolicy `
  -PolicyName "AllowTeamsMeetingFetcher" `
  -GroupId "<ALLOWED_GROUP_ID>"

# Create Meeting Policy to enable recording
New-CsTeamsMeetingPolicy `
  -Identity "AllowRecording" `
  -Description "Policy allowing meeting recording" `
  -AutoRecordingOptIn $true

# Assign to group
Grant-CsTeamsMeetingPolicy `
  -PolicyName "AllowRecording" `
  -GroupId "<ALLOWED_GROUP_ID>"
```

**Policies created**:

- `AllowTeamsMeetingFetcher` - App setup policy
- `AllowRecording` - Meeting recording policy

---

## Step 7: Register Teams App Manifest

```bash
# Create Teams app manifest from template
python scripts/teams/create-manifest.py

# Follow prompts to set:
# - App ID: <BOT_APP_ID>
# - Bot endpoint: https://<YOUR_BOT_DOMAIN>/api/messages
# - Scope: team, groupchat, personal

# Verify manifest.json created
cat teams-app/manifest.json | jq .
```

---

## Step 8: Create Microsoft Graph Webhook Subscription

```bash
# Subscribe to Teams call records updates
python scripts/graph/02-create-webhook-subscription.py

# When prompted, provide:
# - Resource: /communications/callRecords
# - Change type: created
# - Expiration: 4320 (3 days)

# Verify subscription created
python scripts/graph/check_latest_webhook.py
```

---

## Step 9: Register Bot with Microsoft Teams

```bash
# Package Teams app for installation
npm run package:teams-app

# Output: teams-app/teams-meeting-fetcher.zip

# Upload to Teams Admin Center:
# 1. Go to Teams Admin Center > Teams apps > Manage apps
# 2. Upload custom app
# 3. Select teams-meeting-fetcher.zip
# 4. Approve for organization

# Or use Teams PowerShell:
Connect-MicrosoftTeams
New-CsTeamsApp -Path "teams-app/teams-meeting-fetcher.zip"
```

---

## Step 10: Create Test Meeting & Verify Setup

```bash
# Create a test Teams meeting
python scripts/graph/03-create-test-meeting.py

# When prompted, create a meeting for next hour

# Verify bot can access meeting details
python scripts/graph/04-poll-transcription.py

# Should return meeting info without errors
```

---

## Step 11: Test Webhook Delivery

```bash
# Start webhook listener
npm run start

# In another terminal, trigger a test webhook delivery
python scripts/graph/06-test-webhook.py

# Verify webhook is received and logged

# Check logs
tail -f logs/webhook.log
```

---

## Step 12: Verify End-to-End Integration

```bash
# Run comprehensive verification script
python scripts/graph/01-verify-setup.py

# Should verify:
# ✓ Azure AD app created
# ✓ Security group created
# ✓ Teams policies applied
# ✓ Graph webhook subscription active
# ✓ Bot permissions granted
# ✓ Teams app registered
```

---

## Configuration Files Updated

After completion, verify `.env.local` has:

```bash
# Teams Configuration
BOT_APP_ID=<Azure AD App ID>
BOT_APP_PASSWORD=<Azure AD App Password>
GRAPH_TENANT_ID=<Your Azure Tenant ID>
ALLOWED_GROUP_ID=<Security Group ID>

# Webhook
WEBHOOK_BASE_URL=https://<your-domain>/api/messages
GRAPH_SUBSCRIPTION_ID=<Webhook Subscription ID>
```

---

## Troubleshooting

### "Insufficient permissions to complete operation"

```bash
# Verify you have Application Administrator role
az role assignment list --query "[?principalName=='<your-email>']"

# If not, contact Azure AD admin to add you to Application Administrator role
```

### "Graph webhook subscription creation failed"

```bash
# Verify bot has required permissions
az ad app permission list --id <BOT_APP_ID>

# If missing, add permissions via Portal or:
az ad app permission add --id <BOT_APP_ID> \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions e4006cc1-3ab5-41ce-9fef-622f061651f7=Scope
```

### "Teams app upload fails with manifest error"

```bash
# Validate manifest.json
python -c "import json; json.load(open('teams-app/manifest.json'))" && echo "Valid"

# Check for required fields
cat teams-app/manifest.json | jq '.{id, version, shortName, fullName}'
```

### "Webhook subscription expires immediately"

```bash
# Check subscription status
python scripts/graph/check_latest_webhook.py

# If expired, recreate with longer TTL:
python scripts/graph/02-create-webhook-subscription.py --ttl 4320
```

---

## Verification Checklist

- [ ] Azure AD app registered (`BOT_APP_ID` set)
- [ ] App password generated (`BOT_APP_PASSWORD` set)
- [ ] Permissions granted (OnlineMeetingTranscript.Read.All, etc.)
- [ ] Security group created (`ALLOWED_GROUP_ID` set)
- [ ] Teams Admin Policies created and assigned
- [ ] Teams app manifest created and valid
- [ ] Graph webhook subscription active and receiving events
- [ ] Bot registered in Teams Admin Center
- [ ] Test meeting created successfully
- [ ] Webhook delivery test passed
- [ ] End-to-end verification script passes all checks
- [ ] `.env.local` has all required Teams configuration

---

## Next Steps

1. **Deploy Bot to AWS/Azure**: Run deployment workflows: `deploy-unified.yml` creates all infrastructure, or use `deploy-lambda-*.yml` to redeploy Lambda code to existing infrastructure
2. **Create Teams Channel App**: Install bot in a test Teams channel
3. **Run E2E Tests**: Execute `npm run test:e2e` to validate integration
4. **Set Up Monitoring**: Configure Azure Application Insights or CloudWatch logging
5. **Document Setup**: Create runbook for future Teams environment recreations
