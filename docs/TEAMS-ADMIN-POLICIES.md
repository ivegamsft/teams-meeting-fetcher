# Teams Admin Policies for Meeting Fetcher

This guide covers the two Teams admin policies that make Meeting Fetcher fully automated,
scoped to a **specific security group** (not tenant-wide):

1. **App Setup Policy "Recorded Line"** — auto-install the bot for group members
2. **Meeting Policy "Recorded Line"** — enforce transcription + auto-recording for group members
3. **Application Access Policy** — allow the bot's Graph API app to read users' online meetings

All three are configured via the PowerShell script at `scripts/setup-teams-policies.ps1`.
The first two can also be configured in the [Teams Admin Center](https://admin.teams.microsoft.com);
the Application Access Policy requires PowerShell.

> **⚠️ No Terraform support:** Teams admin policies use the MicrosoftTeams PowerShell module,
> which has no Terraform provider. The setup script is the IaC equivalent — run it once after
> `terraform apply` to complete the deployment.

---

## Quick Start (PowerShell)

```powershell
# One-liner — pass your group ID, catalog app ID, and bot app ID
.\scripts\setup-teams-policies.ps1 `
  -GroupId "<YOUR-GROUP-OBJECT-ID>" `
  -CatalogAppId "<YOUR-CATALOG-APP-ID>" `
  -BotAppId "<YOUR-BOT-APP-ID>"

# Dry run first to see what it will do
.\scripts\setup-teams-policies.ps1 `
  -GroupId "<YOUR-GROUP-OBJECT-ID>" `
  -CatalogAppId "<YOUR-CATALOG-APP-ID>" `
  -BotAppId "<YOUR-BOT-APP-ID>" `
  -DryRun
```

> **Finding IDs:**
>
> - **Group Object ID**: Azure Portal → Azure AD → Groups → select your group → Object ID
> - **Catalog App ID**: `Get-TeamsApp -DistributionMethod Organization | Format-Table Id, DisplayName`
> - **Bot App ID**: The Azure AD app (client) ID for the bot — same as `BOT_APP_ID` in Lambda env vars

The script will:

1. Create / update the **"Recorded Line"** App Setup Policy with Meeting Fetcher auto-installed
2. Create / update the **"Recorded Line"** Meeting Policy with auto-recording + transcription on
3. Create / update the **"MeetingFetcher-Policy"** Application Access Policy for Graph API online meeting access
4. Grant the Application Access Policy globally
5. Assign the setup + meeting policies to the specified security group via `New-CsGroupPolicyAssignment`

---

## 1. App Setup Policy — "Recorded Line"

The bot must be present in meetings to receive `meetingStart` / `meetingEnd` events.
The "Recorded Line" app setup policy auto-installs Meeting Fetcher for members of a specific group.

### Manual Steps (Teams Admin Center)

1. Go to **Teams Admin Center → Teams apps → [Setup policies](https://admin.teams.microsoft.com/policies/app-setup)**.
2. Open the **Recorded Line** policy (or create it).
3. Under **Installed apps**, click **+ Add apps**.
4. Search for **Meeting Fetcher** and add it.
5. Save the policy.
6. Go to **Group policy assignment** tab → assign "Recorded Line" to your security group.

### PowerShell

```powershell
Install-Module -Name MicrosoftTeams -Force
Connect-MicrosoftTeams

# Meeting Fetcher's Teams catalog app ID (not the manifest external ID).
# Find yours via: Get-TeamsApp -DistributionMethod Organization
$catalogAppId = "<YOUR-CATALOG-APP-ID>"
$groupId      = "<YOUR-GROUP-OBJECT-ID>"

# If policy doesn't exist yet:
New-CsTeamsAppSetupPolicy -Identity "Recorded Line" `
  -Description "Auto-installs Meeting Fetcher for recorded lines."
Set-CsTeamsAppSetupPolicy -Identity "Recorded Line" `
  -AppPresetList @([PSCustomObject]@{ Id = $catalogAppId })

# If it already exists, add Meeting Fetcher to installed apps:
$policy = Get-CsTeamsAppSetupPolicy -Identity "Recorded Line"
$apps = [System.Collections.Generic.List[object]]::new()
foreach ($a in $policy.AppPresetList) { $apps.Add($a) }
$apps.Add([PSCustomObject]@{ Id = $catalogAppId })
Set-CsTeamsAppSetupPolicy -Identity "Recorded Line" -AppPresetList $apps

# Assign to a security group (Rank 1 = highest priority)
New-CsGroupPolicyAssignment `
  -GroupId $groupId `
  -PolicyType TeamsAppSetupPolicy `
  -PolicyName "Recorded Line" `
  -Rank 1
```

---

## 2. Meeting Policy — "Recorded Line"

Transcription and recording are enforced via a matching **"Recorded Line"** meeting policy,
also assigned to the same security group.

### Manual Steps (Teams Admin Center)

1. Go to **Teams Admin Center → Meetings → [Meeting policies](https://admin.teams.microsoft.com/policies/meetings)**.
2. Create or edit a policy named **"Recorded Line"**.
3. Under **Recording & transcription**:
   - Set **Transcription** → **On**
   - Set **Cloud recording** → **On**
   - Set **Meetings automatically record** → **On** _(strongest enforcement)_
4. Save the policy.
5. Go to **Group policy assignment** tab → assign "Recorded Line" to your security group.

### PowerShell

```powershell
# Create or update
Set-CsTeamsMeetingPolicy -Identity "Recorded Line" `
  -AllowTranscription $true `
  -AllowCloudRecording $true `
  -AutoRecording "Enabled"

# Assign to a security group
New-CsGroupPolicyAssignment `
  -GroupId "<YOUR-GROUP-OBJECT-ID>" `
  -PolicyType TeamsMeetingPolicy `
  -PolicyName "Recorded Line" `
  -Rank 1
```

### Why AutoRecording?

- `AllowTranscription = $true` only **allows** users to start transcription; it doesn't force it.
- `AutoRecording = "Enabled"` auto-starts recording + transcription the moment a meeting begins — no user action required.

---

## Policy Precedence

Teams resolves policies in this order:

1. **Direct user assignment** (highest priority)
2. **Group assignment** (by rank — lower number wins)
3. **Global (Org-wide default)** (lowest priority)

By using group assignment with Rank 1, the "Recorded Line" policies override the Global default
for members of the target group only. Other users are unaffected.

---

## 3. Application Access Policy (Graph API)

For the bot to fetch meeting details and transcripts via the Graph API
(`/users/{userId}/onlineMeetings`), an **Application Access Policy** must grant the
bot's app registration access to users' online meetings.

Without this policy, Graph returns **403** "No application access policy found for this app."

> This policy is separate from Graph API permissions. Even with
> `OnlineMeetings.ReadWrite.All` and `OnlineMeetingTranscript.Read.All` granted and
> admin-consented, the user-scoped endpoint requires this additional Teams policy.

### Prerequisites

- Azure AD App Registration ID (the bot's app/client ID)
- Teams Administrator role (or Global Administrator)
- `MicrosoftTeams` PowerShell module v4.0+

### PowerShell

```powershell
Connect-MicrosoftTeams

# Create the policy (the AppIds list contains the bot's Azure AD app ID)
New-CsApplicationAccessPolicy `
  -Identity "MeetingFetcher-Policy" `
  -AppIds "<BOT_APP_ID>" `
  -Description "Allow Meeting Fetcher bot to access online meetings via Graph API"

# Grant globally (all users in the tenant)
Grant-CsApplicationAccessPolicy -PolicyName "MeetingFetcher-Policy" -Global

# OR grant to a specific user only
# Grant-CsApplicationAccessPolicy -PolicyName "MeetingFetcher-Policy" -Identity "user@contoso.com"
```

### Propagation Delay

Application access policies can take **up to 30 minutes** to propagate.
During this window, Graph may still return 403.

### Verification

```powershell
# List all application access policies
Get-CsApplicationAccessPolicy | Format-List Identity, AppIds, Description

# Check global assignment
Get-CsApplicationAccessPolicy -Identity Global
```

---

## How It All Fits Together

```
User is member of "Recorded Line" security group
  │
  ├─ App Setup Policy → Meeting Fetcher auto-installed
  ├─ Meeting Policy  → AutoRecording + Transcription enforced
  │
  Meeting starts
  │
  ├─ Meeting Fetcher receives meetingStart event
  ├─ Teams auto-starts recording + transcription (policy)
  └─ Bot sends "🔴 This meeting is being recorded and transcribed." to chat
      │
      Meeting ends
      │
      ├─ Bot receives meetingEnd event
      ├─ Bot fetches transcript via Graph API
      └─ Bot posts transcript to meeting chat
```

---

## Verification

```powershell
# Check the policies exist
Get-CsTeamsAppSetupPolicy -Identity "Recorded Line" | Format-List
Get-CsTeamsMeetingPolicy -Identity "Recorded Line" | Select AllowTranscription, AutoRecording

# Check group assignment
Get-CsGroupPolicyAssignment -GroupId "<YOUR-GROUP-OBJECT-ID>" | Format-Table PolicyType, PolicyName, Rank

# Check effective policy for a specific user
Get-CsUserPolicyAssignment -Identity "user@contoso.com" | Format-Table PolicyType, PolicyName, PolicySource
```

---

## Troubleshooting

| Symptom                                               | Cause                                              | Fix                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Bot not in meeting chat                               | User not in policy group, or policy not propagated | Check group membership; wait 24h                                                         |
| No meetingStart event                                 | App not installed in meeting                       | Verify `Get-CsTeamsAppSetupPolicy "Recorded Line"` has the app                           |
| Transcription not auto-starting                       | `AutoRecording` not set                            | Set to `"Enabled"` on the meeting policy                                                 |
| "No transcript available" at meeting end              | Transcription wasn't running                       | Ensure meeting policy is assigned; `AutoRecording = "Enabled"`                           |
| Transcript fetch 403 ("No application access policy") | Missing Application Access Policy                  | Run `New-CsApplicationAccessPolicy` + `Grant-CsApplicationAccessPolicy` (see §3)         |
| Transcript fetch 403 ("Insufficient privileges")      | Missing Graph permission                           | Bot app needs `OnlineMeetingTranscript.Read.All` (application), admin-consented          |
| Policy not taking effect for user                     | User has direct assignment that overrides          | Remove direct: `Grant-CsTeamsMeetingPolicy -Identity user@contoso.com -PolicyName $null` |
