# Teams Admin Configuration Guide

**Purpose:** Step-by-step setup for Teams administrators to configure tenant-level policies and permissions needed for the Teams Meeting Fetcher app to access online meetings and transcripts.

**Scope:** Setting up a NEW tenant from scratch for automatic meeting transcription and recording via the Teams Meeting Fetcher service.

**Target Audience:** Teams administrators (not developers). These are one-time configuration steps.

---

## Prerequisites

Before starting, you need:

1. **Teams Admin Center access** — Must have Teams Administrator role
2. **Azure Portal access** — Must have Global Administrator or Application Administrator role
3. **Teams PowerShell Module** — For PowerShell-based setup (optional but recommended for verification)
4. **Teams Premium license** — Required for auto-transcription features and meeting templates
5. **Teams Meeting Fetcher app details:**
   - **Client ID:** `63f2f070-e55d-40d3-93f9-f46229544066`
   - **Tenant:** ibuyspy.net (replace with your tenant)

### Install Teams PowerShell Module (Optional)

```powershell
# Requires PowerShell 7.0+ on Windows, or PowerShell 6.2+ on other OSes
Install-Module -Name MicrosoftTeams -Force
```

---

## Layer 1: Teams Admin Meeting Policies

Teams Admin Meeting Policies control whether users can record and transcribe meetings in the Teams client.

### Step 1.1: Verify Global Meeting Policy (Teams Admin Center)

1. Sign into **Teams Admin Center** (https://admin.teams.microsoft.com)
2. Navigate to **Meetings** > **Meeting policies**
3. Click **Global (Org-wide default)** policy
4. Under **Recording & transcription**, verify these settings:

| Setting | Required Value |
|---------|----------------|
| **Meeting recording** | On |
| **Transcription** | On |
| **Auto recording** | Enabled (allows organizers to set auto-record per meeting) |
| **Copilot** | On with saved transcript required |
| **Live captions** | Enabled (let users turn on/off) |

### Step 1.2: Verify Meeting Policy (PowerShell Alternative)

```powershell
# Connect to Teams PowerShell
Connect-MicrosoftTeams

# Check Global policy
Get-CsTeamsMeetingPolicy -Identity Global | Select-Object `
    AllowCloudRecording, `
    AllowTranscription, `
    AutoRecording, `
    LiveCaptionsEnabledType, `
    Copilot, `
    NewMeetingRecordingExpirationDays

# Check what policy is assigned to specific users
Get-CsOnlineUser -Identity "user@yourtenant.com" | Select-Object `
    DisplayName, `
    TeamsMeetingPolicy
```

**Expected Output (Global Policy):**
```
AllowCloudRecording         : True
AllowTranscription          : True
AutoRecording               : Enabled
LiveCaptionsEnabledType     : DisabledUserOverride
Copilot                     : EnabledWithTranscript
NewMeetingRecordingExpirationDays : 120
```

### Step 1.3: Enable Meeting Recording & Transcription (If Needed)

If any setting is incorrect, use Teams Admin Center:

1. Click **Global** policy
2. Under **Recording & transcription**:
   - Toggle **Meeting recording** to **On**
   - Toggle **Transcription** to **On**
   - Set **Auto recording** to **Enabled**
   - Set **Copilot** to **On with saved transcript required**
3. Click **Save**

**OR use PowerShell:**

```powershell
Connect-MicrosoftTeams

Set-CsTeamsMeetingPolicy -Identity Global `
    -AllowCloudRecording $true `
    -AllowTranscription $true `
    -AutoRecording Enabled `
    -LiveCaptionsEnabledType DisabledUserOverride `
    -Copilot EnabledWithTranscript
```

### Step 1.4: Verification

After saving, verify the policy is active:

```powershell
# Should return the settings you just set
Get-CsTeamsMeetingPolicy -Identity Global | Select-Object `
    AllowCloudRecording, `
    AllowTranscription, `
    AutoRecording
```

**Checkpoint:** ✓ Users can now record and transcribe meetings manually. Meetings > Meeting policies configured.

---

## Layer 2: Application Access Policy (CRITICAL)

This layer allows the Teams Meeting Fetcher app to read online meetings via the Graph API. **This is required for the transcription pipeline to function.**

> **Bootstrap:** This policy is created automatically when you run `scripts/bootstrap-teams-policies.ps1 -AppId "<APP-ID>"`. The manual steps below are for reference or if you need to customize the setup.
>
> **No REST API exists** for this operation — Teams PowerShell is the only supported method (as of 2025).

### Step 2.1: Create Application Access Policy (PowerShell)

```powershell
# Connect to Teams PowerShell
Connect-MicrosoftTeams

# Create the policy for Teams Meeting Fetcher
New-CsApplicationAccessPolicy `
    -Identity "TMF-AppAccess-Policy" `
    -AppIds "63f2f070-e55d-40d3-93f9-f46229544066" `
    -Description "Allow Teams Meeting Fetcher app to access online meetings"
```

**Expected Output:**
```
Identity    : TMF-AppAccess-Policy
AppIds      : {63f2f070-e55d-40d3-93f9-f46229544066}
Description : Allow Teams Meeting Fetcher app to access online meetings
```

### Step 2.2: Grant Policy to Users or Tenant

**Option A: Grant to All Users (Recommended for Test Tenants)**

```powershell
# Grant to entire tenant
Grant-CsApplicationAccessPolicy `
    -PolicyName "TMF-AppAccess-Policy" `
    -Global
```

**Option B: Grant to Specific Users (Recommended for Production)**

```powershell
# Grant to specific user(s)
Grant-CsApplicationAccessPolicy `
    -PolicyName "TMF-AppAccess-Policy" `
    -Identity "user@yourtenant.com"

# Grant to multiple users
Grant-CsApplicationAccessPolicy `
    -PolicyName "TMF-AppAccess-Policy" `
    -Identity "user1@yourtenant.com"

Grant-CsApplicationAccessPolicy `
    -PolicyName "TMF-AppAccess-Policy" `
    -Identity "user2@yourtenant.com"
```

### Step 2.3: Verify Policy Creation and Assignment

```powershell
# Check policy exists
Get-CsApplicationAccessPolicy -Identity "TMF-AppAccess-Policy"

# Check policy is assigned to user(s)
Get-CsOnlineUser -Identity "user@yourtenant.com" | Select-Object `
    DisplayName, `
    ApplicationAccessPolicy
```

**Expected Output:**
```
Identity    : TMF-AppAccess-Policy
AppIds      : {63f2f070-e55d-40d3-93f9-f46229544066}
Description : Allow Teams Meeting Fetcher app to access online meetings

DisplayName            : User Name
ApplicationAccessPolicy: TMF-AppAccess-Policy
```

### Step 2.4: Wait for Propagation

**Important:** Changes to application access policies can take **up to 30 minutes** to propagate across Microsoft 365. 

- Do not proceed to Layer 3 verification until 30 minutes have elapsed.
- If testing immediately, you may see `403 Forbidden - No application access policy found` errors; these will resolve after propagation.

**Checkpoint:** ✓ Application Access Policy created and assigned. After 30 minutes, app can access OnlineMeetings API.

---

## Layer 3: Graph API Permissions

The Teams Meeting Fetcher app needs specific Microsoft Graph API permissions to read meetings, transcripts, recordings, and user/group information.

### Required Permissions (7 Total)

The complete set of Graph API permissions required:

1. **Calendars.Read** — Read calendar events
2. **Group.Read.All** — Read group membership information
3. **User.Read.All** — Read user details
4. **OnlineMeetings.Read.All** — Read online meeting details
5. **OnlineMeetingTranscript.Read.All** — Read meeting transcripts
6. **OnlineMeetingRecording.Read.All** — Read meeting recordings
7. **Subscription.ReadWrite.All** — Create and manage webhook subscriptions

### Step 3.1: Add Permissions in Azure Portal

1. Sign into **Azure Portal** (https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Search for and click **Teams Meeting Fetcher** (or search by Client ID: `63f2f070-e55d-40d3-93f9-f46229544066`)
4. Click **API permissions** from the left menu
5. Click **Add a permission**
6. Select **Microsoft Graph** > **Application permissions**
7. Search and add these permissions:
   - `Calendars.Read` — Read calendar events
   - `Group.Read.All` — Read group membership information
   - `User.Read.All` — Read user details
   - `OnlineMeetings.Read.All` — Read online meeting details
   - `OnlineMeetingTranscript.Read.All` — Read meeting transcripts
   - `OnlineMeetingRecording.Read.All` — Read meeting recordings
   - `Subscription.ReadWrite.All` — Create and manage webhook subscriptions
8. Click **Add permissions**

### Automated Permission Granting

These permissions can be automatically granted using the PowerShell script:

```powershell
# Grant all 7 required Graph API permissions
.\scripts\grant-graph-permissions.ps1
```

This script automates the process and ensures all required permissions are configured correctly.

### Step 3.2: Grant Admin Consent

After adding permissions:

1. In the **API permissions** page, click **Grant admin consent for [Your Tenant]**
2. Confirm the consent prompt
3. Wait for the status to change from "Requires admin consent" to "Granted"

**Expected Result:**
```
Status: ✓ Granted for [Your Tenant]
```

### Step 3.3: Verify Permissions (PowerShell)

```powershell
# Connect to Microsoft Graph
Connect-MgGraph -Scopes "Application.ReadWrite.All"

# Get the app registration
$app = Get-MgApplication -Filter "appId eq '63f2f070-e55d-40d3-93f9-f46229544066'"

# List required resource accesses
$app.RequiredResourceAccess | ForEach-Object {
    Write-Host "Resource: $($_.ResourceAppId)"
    $_.ResourceAccess | ForEach-Object {
        Write-Host "  - ID: $($_.Id), Type: $($_.Type)"
    }
}
```

**Checkpoint:** ✓ Graph API permissions added and consented. App can now query meeting data.

---

## Layer 4: Teams Premium License Verification

Teams Premium licenses enable advanced transcription features (live translated transcription, intelligent recap).

### Step 4.1: Verify User Licenses (Microsoft 365 Admin Center)

1. Sign into **Microsoft 365 Admin Center** (https://admin.microsoft.com)
2. Navigate to **Users** > **Active users**
3. Select the user to check
4. Click the **Licenses and apps** tab
5. Under **Licenses**, confirm:
   - A base Teams license (e.g., **Microsoft 365 E3**, **Teams Essentials**)
   - **Microsoft Teams Premium** is checked

### Step 4.2: Assign Teams Premium License (If Missing)

1. In **Active users**, select the user
2. Click **Licenses and apps**
3. Under **Licenses**, click the checkbox for **Microsoft Teams Premium**
4. Click **Save changes**

### Step 4.3: Verify via PowerShell

```powershell
# Connect to Microsoft Graph
Connect-MgGraph -Scopes "User.Read.All", "Organization.Read.All"

# Get user and their license info
$user = Get-MgUser -UserId "user@yourtenant.com" -Property "assignedLicenses"
$user.AssignedLicenses | ForEach-Object {
    Write-Host "SKU ID: $($_.SkuId)"
}

# List all available licenses in tenant
Get-MgSubscribedSku | Select-Object SkuPartNumber, SkuId
```

**What to Look For:** SKU containing "TEAMS_PREMIUM"

**Checkpoint:** ✓ Teams Premium licenses assigned to users. Advanced transcription features enabled.

---

## Optional: Meeting Templates (Enforce Auto-Transcription)

If you want to enforce automatic meeting recording and transcription for all meetings:

### Step 5.1: Create Meeting Template (Teams Admin Center)

1. Navigate to **Meetings** > **Meeting templates**
2. Click **Create template**
3. Set these options:
   - **Template name:** "Auto-Record and Transcribe" (or similar)
   - **Record and transcribe automatically:** ON (and **locked** to prevent users from disabling)
   - **Live captions:** Enabled
   - **Copilot:** Enabled
4. Click **Save**

### Step 5.2: Assign Template to Users

1. In **Meeting templates**, select your new template
2. Click **Assign users**
3. Select the users or groups who should use this template
4. Click **Assign**

**Effect:** When these users create meetings, the "Record and transcribe automatically" option will be pre-enabled and locked.

**Checkpoint:** ✓ Meeting templates configured (optional). Auto-transcription enforced.

---

## End-to-End Verification Checklist

After completing all layers, verify the complete setup:

### Verification Step 1: Check Teams Policies

```powershell
Connect-MicrosoftTeams

# Should return True/True/Enabled
Get-CsTeamsMeetingPolicy -Identity Global | Select-Object `
    AllowCloudRecording, `
    AllowTranscription, `
    AutoRecording
```

### Verification Step 2: Check Application Access Policy

```powershell
# Should return TMF-AppAccess-Policy
Get-CsOnlineUser -Identity "user@yourtenant.com" | Select-Object ApplicationAccessPolicy

# Should show the policy with correct AppIds
Get-CsApplicationAccessPolicy -Identity "TMF-AppAccess-Policy"
```

### Verification Step 3: Check Graph API Permissions

In Azure Portal:
1. **App registrations** > **Teams Meeting Fetcher**
2. **API permissions** tab
3. Verify all 7 permissions appear with status "✓ Granted for [Tenant]":
   - `Calendars.Read`
   - `Group.Read.All`
   - `User.Read.All`
   - `OnlineMeetings.Read.All`
   - `OnlineMeetingTranscript.Read.All`
   - `OnlineMeetingRecording.Read.All`
   - `Subscription.ReadWrite.All`

### Verification Step 4: Check Teams Premium License

```powershell
Connect-MgGraph -Scopes "User.Read.All"
Get-MgUser -UserId "user@yourtenant.com" -Property "assignedLicenses" | Select-Object AssignedLicenses
```

Should include `TEAMS_PREMIUM` SKU.

### Verification Step 5: Test Graph API Access

After allowing 30 minutes for propagation, run this test (requires app credentials):

```bash
# Test access to online meetings
curl -X GET "https://graph.microsoft.com/v1.0/users/{userId}/onlineMeetings" \
  -H "Authorization: Bearer {accessToken}"
```

Expected: `200 OK` with meeting details.
Error: If you see `403 Forbidden - No application access policy found`, wait another 10-15 minutes and retry.

---

## Troubleshooting

### Problem: "No application access policy found" (403 Forbidden)

**Causes:**
1. Application Access Policy not created
2. Policy not assigned to the user
3. Changes not yet propagated (< 30 minutes)

**Solution:**
```powershell
# Verify policy exists
Get-CsApplicationAccessPolicy -Identity "TMF-AppAccess-Policy"

# Verify user assignment
Get-CsOnlineUser -Identity "user@yourtenant.com" | Select-Object ApplicationAccessPolicy

# If missing, assign:
Grant-CsApplicationAccessPolicy -PolicyName "TMF-AppAccess-Policy" -Identity "user@yourtenant.com"

# Wait 30 minutes and retry API call
```

### Problem: "Permission denied" (403 Forbidden) after Access Policy is granted

**Causes:**
1. Graph API permissions not added
2. Admin consent not granted
3. Permissions added but not propagated

**Solution:**
1. Verify in Azure Portal > **App registrations** > **API permissions** that all 7 permissions are present with "✓ Granted" status:
   - `Calendars.Read`
   - `Group.Read.All`
   - `User.Read.All`
   - `OnlineMeetings.Read.All`
   - `OnlineMeetingTranscript.Read.All`
   - `OnlineMeetingRecording.Read.All`
   - `Subscription.ReadWrite.All`
2. If missing, add and grant admin consent (see Layer 3)
3. Wait 10-15 minutes for propagation
4. Retry API call

### Problem: "User not found" or meeting events not appearing

**Causes:**
1. User doesn't exist in tenant
2. User doesn't have a Teams license
3. User not in the target Entra group

**Solution:**
```powershell
# Check user exists
Get-MgUser -UserId "user@yourtenant.com"

# Check licenses
Get-MgUser -UserId "user@yourtenant.com" -Property "assignedLicenses" | Select-Object AssignedLicenses

# Check group membership
Get-MgGroupMember -GroupId "groupId" | Select-Object UserPrincipalName
```

### Problem: Transcripts not appearing in Graph API even after meeting

**Causes:**
1. Recording/transcription not enabled in Teams policies (Layer 1)
2. Organizer didn't enable "Record and transcribe automatically" in meeting options
3. Transcript still being processed (can take 15–60 minutes)
4. No Teams Premium license

**Solution:**
1. Verify Layer 1 policies are enabled (see Step 1.2–1.3)
2. Start a new test meeting with "Record and transcribe automatically" enabled
3. Wait 15–60 minutes for transcription to complete
4. Check Teams Premium license (see Step 4.1)

---

## Cross-Reference to Application Configuration

After completing these admin steps, the Teams Meeting Fetcher application needs corresponding configuration.

**See:** [CONFIGURATION.md](../CONFIGURATION.md) for:
- Graph API credential setup (client ID, client secret, tenant ID)
- Entra group ID configuration
- Webhook authentication
- Database and polling setup

These admin steps and app configuration are complementary:
- **Admin steps** = Tenant permissions and policies
- **App steps** = How the app authenticates and processes data

---

## Summary

| Layer | Component | Status Check | Time to Complete |
|-------|-----------|--------------|------------------|
| **Layer 1** | Teams Admin Policies | Meeting policies configured | 10 minutes |
| **Layer 2** | Application Access Policy | `Get-CsApplicationAccessPolicy` returns policy | 30 minutes (includes propagation) |
| **Layer 3** | Graph API Permissions | Azure Portal shows permissions with "✓ Granted" | 10 minutes |
| **Layer 4** | Teams Premium License | User has Teams Premium assigned | 5 minutes |
| **Verification** | End-to-end test | Graph API call returns `200 OK` | 5 minutes |

**Total Time:** ~60 minutes (mostly waiting for Layer 2 propagation)

---

## References

- [Microsoft Teams cloud recording](https://learn.microsoft.com/en-us/microsoftteams/cloud-recording)
- [Teams meeting transcription and captions configuration](https://learn.microsoft.com/en-us/microsoftteams/meeting-transcription-captions)
- [Application access policy for Graph API](https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy)
- [Copilot in Teams meetings](https://learn.microsoft.com/en-us/microsoftteams/copilot-teams-transcription)
- [Teams Premium features and licensing](https://learn.microsoft.com/en-us/microsoftteams/enhanced-teams-experience)
