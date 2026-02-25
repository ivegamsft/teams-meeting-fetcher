# Teams Configuration Deployment Checklist

**Purpose**: Step-by-step printed checklist for deploying Teams Meeting Fetcher to a new tenant.

**Version**: 1.0  
**Print Date**: ****\_\_\_****  
**Deployed By**: ****\_\_\_****  
**Tenant Name**: ****\_\_\_****  
**Target Tenant ID**: ****\_\_\_****

---

## Pre-Deployment Verification (Day -1)

### Required Access & Credentials

- [ ] **Azure AD Global Administrator** or **Privileged Role Administrator** access
- [ ] **Teams Administrator** access to Teams Admin Center
- [ ] **Azure Subscription Administrator** credentials
- [ ] **AWS Account Administrator** credentials (if deploying Lambda)
- [ ] GitHub repository read/write access
- [ ] Git CLI configured with SSH keys

### Recommended Tools Installed

- [ ] **Azure CLI** (`az version` succeeds)
- [ ] **Azure AD PowerShell** module (`Get-Module -ListAvailable AzureAD`)
- [ ] **Teams PowerShell** module (`Get-Module -ListAvailable MicrosoftTeams`)
- [ ] **Git** (`git --version` succeeds)
- [ ] **Node.js 18+** (`node --version` succeeds)
- [ ] **Python 3.9+** (`python --version` succeeds)

### Documentation Review

- [ ] Read [TEAMS_CONFIGURATION_REPRODUCIBLE.md](./TEAMS_CONFIGURATION_REPRODUCIBLE.md)
- [ ] Review [TEAMS_BOT_SPEC.md](./TEAMS_BOT_SPEC.md) architecture diagram
- [ ] Understand Lambda endpoint (existing or planned)
- [ ] Decide on allow-list group name (`Teams Meeting Monitors` recommended)
- [ ] Review organization's Teams admin policies (inform choice of policy names)

**Approval**: Project Lead  
☐ Approved to proceed | ☐ Blocked — Reason: ******\_******

---

## Phase 1: Azure AD App Registration

**Objective**: Create Azure AD application for bot authentication  
**Duration**: ~15 minutes  
**Facilitator**: Kobashi / Identity Engineer

### Step 1: Choose Approach (select one)

- [ ] **Automated**: Use PowerShell script `bootstrap-azure-spn.ps1`
  - [ ] Script downloaded: `scripts/setup/bootstrap-azure-spn.ps1`
  - [ ] Opened PowerShell as **Administrator**
  - [ ] Navigated to repo root: `cd f:\Git\teams-meeting-fetcher`

- [ ] **Manual**: Create via Azure Portal (backup method)
  - [ ] Navigated to https://portal.azure.com → Azure AD → App registrations

### Step 2: Automated Execution (if chosen)

```powershell
# Run this command in PowerShell as Administrator:
.\scripts\setup\bootstrap-azure-spn.ps1
```

- [ ] Script prompted for tenant confirmation
- [ ] Script created Azure AD app
- [ ] Script displayed app ID and secret
- [ ] **⚠️ Saved credentials immediately** (cannot retrieve again):

  ```
  App ID (GRAPH_CLIENT_ID): _____________________________
  Tenant ID (GRAPH_TENANT_ID): __________________________
  Client Secret (GRAPH_CLIENT_SECRET): [SAVED SECURELY] ✓
  Service Principal Object ID: _____________________________
  ```

### Step 3: Manual Verification (both approaches)

```powershell
# In Azure Portal, navigate to:
# Azure AD → App registrations → Search for "Teams Meeting Fetcher Bot"

# Record these values:
- [ ] Application (client) ID: ___________________________
- [ ] Directory (tenant) ID: ____________________________
- [ ] Redirect URIs (should be empty): ___________________
```

### Step 4: Verify Permissions Granted

In Azure Portal → App → API permissions:

- [ ] ✅ `OnlineMeetings.ReadWrite.All` — **Granted**
- [ ] ✅ `Calls.JoinGroupCall.All` — **Granted**
- [ ] ✅ `Calls.Initiate.All` — **Granted**
- [ ] ✅ `OnlineMeetingTranscript.Read.All` — **Granted**
- [ ] ✅ `OnlineMeetings.Read.All` — **Granted**

All permissions show **"Status: Granted for {TenantName}"**

### Phase 1 Approval

☐ App registration complete and verified  
Approver: ********\_******** Date: ****\_****

---

## Phase 2: Security Group (Allow-List)

**Objective**: Create Azure AD security group for user filtering  
**Duration**: ~10 minutes  
**Facilitator**: Identity Engineer / Kobashi

### Step 1: Create Group

- [ ] **Via Azure Portal**:
  - Navigated to: Azure AD → Groups → New group
  - Group type: **Security**
  - Group name: `Teams Meeting Monitors`
  - Group description: `Users authorized to use Teams Meeting Fetcher`
  - Owners: [Your Name / Team]
  - Members: [Added key stakeholders]
  - Clicked **Create**

- OR [ ] **Via PowerShell**:
  ```powershell
  $group = New-AzADGroup -DisplayName "Teams Meeting Monitors" `
    -MailNickname "teamsmeeting" `
    -Description "Users authorized to use Teams Meeting Fetcher"
  Write-Host "Group ID: $($group.Id)"
  ```

### Step 2: Record Group Details

- [ ] Group Name: `Teams Meeting Monitors`
- [ ] Group Object ID (ENTRA_GROUP_ID): ************\_\_\_************
- [ ] Members accessible in Azure Portal: ✓
- [ ] Group email (if created): ************\_\_\_************

### Step 3: Add Initial Members

- [ ] At least 1 test user added to group
- [ ] Test user's email: ************\_\_\_************
- [ ] Verified in Azure Portal → Group → Members

### Phase 2 Approval

☐ Security group created and populated  
Approver: ********\_******** Date: ****\_****

---

## Phase 3: Teams App Manifest Configuration

**Objective**: Customize Teams app for this tenant  
**Duration**: ~5 minutes  
**Facilitator**: Kobashi / Developer

### Step 1: Gather Required Values

From previous phases:

- [ ] GRAPH_CLIENT_ID: ************\_\_\_************
- [ ] Lambda/API Gateway endpoint: ************\_\_\_************
  - Extract domain only: `example.execute-api.us-east-1.amazonaws.com`
- [ ] Organization name (for manifest): ************\_\_\_************
- [ ] Organization domain (for manifest): ************\_\_\_************

### Step 2: Edit Manifest Files

Edit **`apps/teams-app/manifest.json`**:

- [ ] Line 4: `"id": "5fb90d80-a7cd-43c0-97e3-eb7577e40169"` — **DO NOT CHANGE**
- [ ] Line 6: `"name": "Your Organization Name"` — **UPDATE** to your org
- [ ] Line 7: `"websiteUrl": "https://your-domain.com"` — **UPDATE**
- [ ] Line 8: `"privacyUrl": "https://your-domain.com/privacy"` — **UPDATE**
- [ ] Line 9: `"termsOfUseUrl": "https://your-domain.com/terms"` — **UPDATE**
- [ ] Line 28: `"validDomains": ["execute-api-domain.amazonaws.com"]` — **UPDATE** to your Lambda domain
- [ ] Line 37: `"id": "GRAPH_CLIENT_ID"` (webApplicationInfo) — **UPDATE** to your app ID
- [ ] Line 66: `"botId": "GRAPH_CLIENT_ID"` — **UPDATE** to your app ID
- [ ] Line 46: Configure URL — **UPDATE** to your Lambda endpoint

Edit **`apps/teams-app/manifest-dev.json`**:

- [ ] **Apply same changes as manifest.json**

### Step 3: Verify Changes

```bash
# Validate manifest syntax (optional, requires jq):
cat apps/teams-app/manifest.json | jq . > /dev/null && echo "Valid JSON"

# Spot-check key fields:
grep -E '"validDomains"|"botId"|"id"' apps/teams-app/manifest.json
```

- [ ] No syntax errors
- [ ] All required fields updated
- [ ] Committed to git (if working on feature branch): `git add apps/teams-app/manifest*.json`

### Phase 3 Approval

☐ Manifest files updated and validated  
Approver: ********\_******** Date: ****\_****

---

## Phase 4: Upload Teams App to Organization Catalog

**Objective**: Make app available in Teams org catalog  
**Duration**: ~10 minutes  
**Facilitator**: Teams Administrator

### Step 1: Access Teams Admin Center

- [ ] Navigated to: https://admin.teams.microsoft.com
- [ ] Logged in with **Teams Administrator** credentials
- [ ] Current org verified in top-left corner

### Step 2: Upload App

- [ ] Clicked: **Teams apps** → **Manage apps**
- [ ] Clicked: **Upload a new app** (top-right button)
- [ ] Selected file: `apps/teams-app/manifest.json` (production) or `manifest-dev.json` (dev)
- [ ] System validated the manifest
- [ ] Dialog shows: App ID, permissions, bot configuration
- [ ] Clicked: **Upload**
- [ ] **⚠️ If validation failed**, check manifest syntax above

### Step 3: Verify Upload

- [ ] In **Manage apps** list, search for `Meeting Fetcher`
- [ ] App appears with status: **Available in organization apps**
- [ ] Clicked app to view details:

  ```
  Record these values from the detail pane:
  - [ ] Manifest ID (external): ___________________________
  - [ ] Teams Catalog App ID (internal): __________________
    (This is auto-assigned — save it for Phase 5)
  - [ ] Distribution: Organization
  - [ ] Verified domain: matches deployed endpoint
  ```

### Phase 4 Approval

☐ Teams app uploaded and verified in catalog  
Approver: ********\_******** Date: ****\_****

---

## Phase 5: Configure Teams Admin Policies

**Objective**: Create and assign policies for automated bot installation and recording rules  
**Duration**: ~20 minutes  
**Facilitator**: Teams Administrator / Kobashi

### Step 1: Gather Values

From previous phases:

- [ ] ENTRA_GROUP_ID: ************\_\_\_************
- [ ] GRAPH_CLIENT_ID: ************\_\_\_************
- [ ] TEAMS_CATALOG_APP_ID: ************\_\_\_************
      (from Phase 4, Step 3)

### Step 2: Run Policy Setup Script

Open **PowerShell as Administrator**:

```powershell
cd f:\Git\teams-meeting-fetcher

.\scripts\setup\setup-teams-policies.ps1 `
  -GroupId "<ENTRA_GROUP_ID>" `
  -GroupName "Teams Meeting Monitors" `
  -CatalogAppId "<TEAMS_CATALOG_APP_ID>" `
  -BotAppId "<GRAPH_CLIENT_ID>"
```

Replace placeholder values with ones recorded above.

- [ ] Script executed without errors
- [ ] Script output shows:
  - ✓ "Found existing policy" or "Creating App Setup Policy"
  - ✓ "Found existing policy" or "Creating Meeting Policy"
  - ✓ "Creating Application Access Policy"
  - ✓ "Assigning policies to group"

### Step 3: Verify Policies in Teams Admin Center

**App Setup Policy:**

- [ ] Navigated to: Teams Admin Center → **Teams apps** → **Setup policies**
- [ ] Found: Policy named `Recorded Line`
- [ ] Pinned apps includes: `Meeting Fetcher` (or your app name)
- [ ] Assigned users: The security group `Teams Meeting Monitors`

**Meeting Policy:**

- [ ] Navigated to: Teams Admin Center → **Meetings** → **Meeting policies**
- [ ] Found: Policy named `Recorded Line`
- [ ] Settings verified:
  - [ ] Transcription: **Enabled**
  - [ ] Cloud recording: **Enabled**
  - [ ] Auto-recording: **On for everyone**
- [ ] Assigned users: The security group `Teams Meeting Monitors`

**Application Access Policy:**

- [ ] Navigated to: Teams Admin Center → **Teams apps** → **Permission policies**
- [ ] Verified: **Application Access Policy** shows `Teams Meeting Fetcher Bot` as allowed

### Phase 5 Approval

☐ All Teams policies created and assigned  
Approver: ********\_******** Date: ****\_****

---

## Phase 6: Lambda & Webhook Configuration

**Objective**: Configure Lambda environment and create webhook subscription  
**Duration**: ~15 minutes  
**Facilitator**: Backend Engineer / DevOps

### Step 1: Update Lambda Environment Variables

**Via AWS Console:**

- [ ] Navigated to AWS Lambda → select function (`meeting-bot-handler`)
- [ ] Clicked: **Configuration** → **Environment variables**
- [ ] Updated variables:

| Variable            | Value                 |
| ------------------- | --------------------- |
| GRAPH_TENANT_ID     | ****\_\_****          |
| GRAPH_CLIENT_ID     | ****\_\_****          |
| GRAPH_CLIENT_SECRET | [AWS Secrets Manager] |
| ENTRA_GROUP_ID      | ****\_\_****          |
| BOT_APP_ID          | ****\_\_****          |

- [ ] ✅ All variables present and non-empty
- [ ] ✅ GRAPH_CLIENT_SECRET uses AWS Secrets Manager (not plain text)
- [ ] ✅ Clicked **Deploy** after changes

**Via .env.local (Local Testing):**

- [ ] Created `.env.local` file in repo root with values above
- [ ] **⚠️ NEVER commit `.env.local` to git**
- [ ] **⚠️ Git ignore already excludes `.env.local`**

### Step 2: Verify Lambda Endpoint

```bash
# Test API Gateway health endpoint:
curl -X GET "https://<your-lambda-domain>/health"

# Expected response:
# HTTP 200 OK with JSON body: { "status": "healthy" }
```

- [ ] Health endpoint returns **200 OK**
- [ ] Response includes `status: healthy` or similar
- [ ] API Gateway is responding

### Step 3: Create Webhook Subscription

**Via Graph API (Automated):**

```bash
# Run the subscription creation script:
cd f:\Git\teams-meeting-fetcher
python scripts/graph/create_webhook_subscription.py \
  --tenant-id <GRAPH_TENANT_ID> \
  --client-id <GRAPH_CLIENT_ID> \
  --client-secret <GRAPH_CLIENT_SECRET> \
  --webhook-url https://<lambda-domain>/webhook \
  --group-id <ENTRA_GROUP_ID>
```

- [ ] Script executed successfully
- [ ] Output shows: `Subscription created: <subscription-id>`
- [ ] Subscription ID recorded: ************\_\_\_************

**Via PowerShell (Manual Alternative):**

```powershell
$accessToken = "<token-from-Graph-API>"
$subscriptionBody = @{
  "changeType" = "created"
  "notificationUrl" = "https://<lambda-domain>/webhook"
  "resource" = "/groups/<ENTRA_GROUP_ID>/events"
  "expirationDateTime" = (Get-Date).AddDays(3).ToString("o")
  "clientState" = "<random-secret>"
}

$subscription = Invoke-RestMethod -Method POST `
  -Uri "https://graph.microsoft.com/v1.0/subscriptions" `
  -Headers @{"Authorization" = "Bearer $accessToken"} `
  -Body ($subscriptionBody | ConvertTo-Json) `
  -ContentType "application/json"

Write-Host "Subscription ID: $($subscription.id)"
```

### Step 4: Verify Webhook Subscription

```bash
# List active subscriptions:
python scripts/graph/check_latest_webhook.py \
  --tenant-id <GRAPH_TENANT_ID> \
  --client-id <GRAPH_CLIENT_ID> \
  --client-secret <GRAPH_CLIENT_SECRET>
```

- [ ] Subscription appears in output
- [ ] Status: **Active**
- [ ] Expiration: > 24 hours in future
- [ ] Resource: `/groups/<ENTRA_GROUP_ID>/events`
- [ ] Notification URL: matches Lambda webhook endpoint

### Phase 6 Approval

☐ Lambda environment configured and webhook active  
Approver: ********\_******** Date: ****\_****

---

## Phase 7: End-to-End Testing

**Objective**: Verify the complete flow works  
**Duration**: ~15 minutes  
**Facilitator**: QA / Tester

### Test 1: Bot Installation for Test User

**Setup:**

- [ ] Test user account from Phase 2: ************\_\_\_************
- [ ] Test user is member of `Teams Meeting Monitors` group

**Test Steps:**

1. [ ] Test user logs into Teams (https://teams.microsoft.com)
2. [ ] Navigates to **Apps** → **Manage your apps**
3. [ ] Searches for `Meeting Fetcher`
4. [ ] App appears in search results
5. [ ] Clicks **Add** button
6. [ ] App is pinned to app bar
7. [ ] Bot appears in **Chat** menu (or configured scope)

**Result**: ☐ **PASS** — Bot installed | ☐ **FAIL** — See troubleshooting

### Test 2: Meeting Creation & Auto-Recording

**Setup:**

- [ ] Test user logged into Teams

**Test Steps:**

1. [ ] Test user creates new Teams meeting
2. [ ] Adds meeting name: `Teams Meeting Fetcher Test`
3. [ ] Sets meeting time: Now + 2 minutes
4. [ ] Invites at least 1 other participant
5. [ ] Starts the meeting
6. [ ] Meeting runs for at least 30 seconds

**Observation Points:**

- [ ] Check **Lambda logs** (CloudWatch): Meeting notification received
  - Navigate to: AWS Logs → `/aws/lambda/meeting-bot-handler`
  - Filter by function invocation time
  - Should see event containing meeting details
  - [ ] **Log entry found**: ✓ Meeting event processed
  - [ ] **No log entry**: See troubleshooting below

- [ ] Check **Teams recording**: Meeting recording started
  - In Teams, look for recording indicator (red dot)
  - **Recording started**: ✓
  - **No recording**: See troubleshooting

- [ ] Check **DynamoDB**: Meeting record created
  - Navigate to AWS DynamoDB → `tmf-meetings` table
  - Query by date range (today)
  - Should find meeting record
  - **Record found**: ✓
  - **Not found**: See troubleshooting

**Result**: ☐ **PASS** — All observations confirmed | ☐ **FAIL** — See troubleshooting

### Test 3: Webhook Auto-Renewal

**Setup:**

- [ ] Allow auto-renewal job to run (happens on schedule)

**Test Steps:**

1. [ ] Wait for scheduled renewal (check cron in Lambda config)
2. [ ] Check **CloudWatch Logs** for renewal Lambda function
3. [ ] Look for log entries showing subscription renewal

- [ ] **Renewal logged**: ✓ Subscription auto-renewed
- [ ] **No renewal log**: Check renewal function configuration

**Result**: ☐ **PASS** — Auto-renewal confirmed | ☐ **SKIP** — Manual renewal tested instead

### Phase 7 Results

**Overall Test Result**: ☐ **ALL PASS** | ☐ **PARTIAL PASS** | ☐ **FAILED**

If any test failed, see troubleshooting section below.

### Phase 7 Approval

☐ End-to-end testing complete  
Approver: ********\_******** Date: ****\_****

---

## Troubleshooting Quick Reference

### Problem: Policy Not Applied to Users

**Symptoms**: Users in group don't see Meeting Fetcher pinned; meetings not auto-recording

**Diagnosis**:

1. [ ] Verify group membership:

   ```powershell
   Get-AzureADGroupMember -ObjectId <ENTRA_GROUP_ID> | Select UserPrincipalName
   ```

   - [ ] Test user appears in output

2. [ ] Check policy assignment:

   ```powershell
   Get-CsUserPolicyAssignment -PolicyType TeamsAppSetupPolicy | Where-Object PolicyName -eq "Recorded Line"
   ```

   - [ ] Shows assignments for the group

3. [ ] User may need to log out and back in for policy to apply (wait 30-60 min)

**Fix**:

- [ ] Confirm user is in group (add if missing)
- [ ] Wait 60 minutes for policy to sync
- [ ] Instruct user to restart Teams (`Ctrl+Q` and reopen)

---

### Problem: Bot Not Receiving Meeting Notifications

**Symptoms**: Lambda logs show no incoming events when meetings created

**Diagnosis**:

1. [ ] Verify webhook subscription is active:

   ```bash
   python scripts/graph/check_latest_webhook.py
   ```

   - [ ] Shows active subscription
   - [ ] Expiration is in future

2. [ ] Check notification URL in subscription:
   - [ ] Should be: `https://<lambda-domain>/webhook`
   - [ ] Matches actual Lambda endpoint

3. [ ] Test webhook endpoint manually:
   ```bash
   curl -X GET "https://<lambda-domain>/health"
   ```

   - [ ] Returns HTTP 200

**Fix**:

- [ ] If subscription expired: Re-create subscription (Phase 6, Step 3)
- [ ] If endpoint wrong: Update Lambda configuration and re-create subscription
- [ ] If endpoint down: Check Lambda function status in AWS console

---

### Problem: Graph API Permission Errors

**Symptoms**: Lambda logs show "Insufficient permissions" or "Unauthorized" errors

**Diagnosis**:

1. [ ] Verify app permissions in Azure Portal:
   - Azure AD → App registrations → Teams Meeting Fetcher Bot
   - API permissions tab
   - [ ] All 5 permissions show "Granted"

2. [ ] Verify Application Access Policy:
   ```powershell
   Get-CsApplicationAccessPolicy
   ```

   - [ ] Shows bot app ID as allowed

**Fix**:

- [ ] If permissions not granted: Click "Grant admin consent" in Azure AD
- [ ] If Access Policy missing: Re-run Phase 5 setup script
- [ ] Wait 5 minutes for policy to propagate

---

### Problem: Lambda Errors in CloudWatch

**Get Log Details:**

```bash
# View recent Lambda errors:
aws logs tail /aws/lambda/meeting-bot-handler --follow
```

**Common Errors & Fixes**:

- `"Cannot find module"` → Rebuild Lambda function (npm install, zip, deploy)
- `"GRAPH_CLIENT_SECRET not set"` → Check Phase 6 environment variables
- `"Subscription not found"` → Webhook subscription expired/deleted; re-create in Phase 6
- `"AccessDenied on group events"` → Check Application Access Policy in Teams Admin Center

---

## Sign-Off

**Deployment Date**: ****\_\_\_****  
**Deployed By**: ******************\_\_\_\_******************  
**Verified By**: ******************\_\_\_\_******************

**Overall Status**:

- [ ] ✅ **READY FOR PRODUCTION** — All phases complete, all tests pass
- [ ] ⚠️ **ISSUES IDENTIFIED** — See notes below
- [ ] ❌ **BLOCKED** — Deployment on hold

**Notes & Issues**:

```
_________________________________________________________________

_________________________________________________________________

_________________________________________________________________
```

**Next Steps**:

- [ ] Announce to users in `Teams Meeting Monitors` group
- [ ] Provide documentation link: `/docs/TEAMS_CONFIGURATION_CURRENT_REFERENCE.md`
- [ ] Schedule follow-up: [Date/Time]

---

**Document Control**:

- **Version**: 1.0
- **Last Modified**: February 24, 2026
- **Owned By**: Kobashi (Teams Architect)
- **Next Review**: [3 months from deployment date]
