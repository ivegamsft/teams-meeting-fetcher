<#
.SYNOPSIS
    Creates the Teams Application Access Policy required for Graph API access
    to OnlineMeetings, transcripts, and recordings.

.DESCRIPTION
    This is a standalone bootstrap script for the Teams admin layer. It is
    separate from the Azure SPN bootstrap (auto-bootstrap-azure.ps1) because
    these are typically run by different teams:

      - Azure bootstrap: run by the cloud/infra team (Azure AD + RBAC)
      - Teams bootstrap: run by the Teams/UC admin (Teams policies)

    What this script does:
      1. Connects to Microsoft Teams PowerShell (interactive browser auth)
      2. Creates a CsApplicationAccessPolicy for the TMF app
      3. Grants the policy globally (all users)
      4. Optionally creates meeting policies (auto-recording, transcription)
      5. Optionally assigns policies to a security group

    No REST API exists for CsApplicationAccessPolicy — Teams PowerShell is
    the only supported method.
    See: https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy

.PARAMETER AppId
    The Azure AD app (client) ID for the TMF app. This is the app that needs
    Graph API access to /users/{id}/onlineMeetings, /transcripts, /recordings.

.PARAMETER TenantId
    The Azure AD tenant ID. If not provided, uses the tenant from the current
    Teams connection or prompts for it.

.PARAMETER GroupId
    Optional. The Azure AD security group to assign meeting policies to.
    If provided, auto-recording and transcription policies are created and
    assigned to this group.

.PARAMETER SkipMeetingPolicies
    If set, only creates the Application Access Policy (Layer 2) and skips
    meeting policy creation (Layer 1) and group assignment.

.PARAMETER DryRun
    If set, shows what would be done without making changes.

.EXAMPLE
    # Minimal — just create the Application Access Policy
    .\bootstrap-teams-policies.ps1 -AppId "63f2f070-e55d-40d3-93f9-f46229544066"

.EXAMPLE
    # Full setup — access policy + meeting policies assigned to a group
    .\bootstrap-teams-policies.ps1 `
        -AppId "63f2f070-e55d-40d3-93f9-f46229544066" `
        -TenantId "62837751-4e48-4d06-8bcb-57be1a669b78" `
        -GroupId "5e7708f8-b0d2-467d-97f9-d9da4818084a"

.EXAMPLE
    # Dry run to see what would happen
    .\bootstrap-teams-policies.ps1 -AppId "63f2f070-e55d-40d3-93f9-f46229544066" -DryRun
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$AppId,

    [string]$TenantId = "",

    [string]$GroupId = "",

    [switch]$SkipMeetingPolicies,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Teams Meeting Fetcher - Teams Admin Bootstrap" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "App ID         : $AppId"
if ($TenantId) { Write-Host "Tenant ID      : $TenantId" }
if ($GroupId)  { Write-Host "Group ID       : $GroupId" }
if ($DryRun)   { Write-Host "[DRY RUN] No changes will be made." -ForegroundColor Yellow }
Write-Host ""

# ─── Prerequisites ───────────────────────────────────────────────────────────

if (-not (Get-Module -ListAvailable -Name MicrosoftTeams)) {
    Write-Host "Installing MicrosoftTeams PowerShell module..." -ForegroundColor Yellow
    Install-Module -Name MicrosoftTeams -Force -Scope CurrentUser
}

Import-Module MicrosoftTeams

# ─── Connect ─────────────────────────────────────────────────────────────────

Write-Host "Checking Teams connection..." -ForegroundColor Cyan
$connected = $false
try {
    Get-CsTenant -ErrorAction Stop | Out-Null
    $connected = $true
    Write-Host "  Already connected." -ForegroundColor Green
} catch { }

if (-not $connected) {
    Write-Host "  Connecting to Microsoft Teams..." -ForegroundColor Yellow
    if ($TenantId) {
        Connect-MicrosoftTeams -TenantId $TenantId
    } else {
        Connect-MicrosoftTeams
    }
    Write-Host "  [OK] Connected" -ForegroundColor Green
}

# ─── Layer 2: Application Access Policy (CRITICAL) ──────────────────────────
# Without this, Graph API returns 403 on /users/{id}/onlineMeetings,
# /transcripts, and /recordings endpoints.

Write-Host ""
Write-Host "--- Application Access Policy ---" -ForegroundColor Cyan

$policyName = "MeetingFetcher-Policy"

$existingPolicy = $null
try {
    $existingPolicy = Get-CsApplicationAccessPolicy -Identity $policyName -ErrorAction Stop
} catch { }

if ($null -eq $existingPolicy) {
    Write-Host "  Creating '$policyName' for app $AppId..."
    if (-not $DryRun) {
        New-CsApplicationAccessPolicy `
            -Identity $policyName `
            -AppIds $AppId `
            -Description "Allow TMF app to access online meetings, transcripts, and recordings via Graph API"
        Write-Host "  [OK] Policy created" -ForegroundColor Green
    } else {
        Write-Host "  [DRY RUN] Would create policy" -ForegroundColor Yellow
    }
} else {
    $existingAppIds = $existingPolicy.AppIds
    if ($existingAppIds -contains $AppId) {
        Write-Host "  [OK] Policy already exists with app $AppId" -ForegroundColor Green
    } else {
        Write-Host "  Adding app $AppId to existing policy..."
        if (-not $DryRun) {
            Set-CsApplicationAccessPolicy `
                -Identity $policyName `
                -AppIds ($existingAppIds + $AppId)
            Write-Host "  [OK] Policy updated" -ForegroundColor Green
        } else {
            Write-Host "  [DRY RUN] Would add app to policy" -ForegroundColor Yellow
        }
    }
}

# Grant globally
Write-Host "  Granting policy globally..."
if (-not $DryRun) {
    Grant-CsApplicationAccessPolicy -PolicyName $policyName -Global
    Write-Host "  [OK] Granted globally" -ForegroundColor Green
} else {
    Write-Host "  [DRY RUN] Would grant globally" -ForegroundColor Yellow
}

# ─── Layer 1: Meeting Policies (optional) ────────────────────────────────────

if (-not $SkipMeetingPolicies -and $GroupId) {
    $meetingPolicyName = "Recorded Line"

    Write-Host ""
    Write-Host "--- Meeting Policy: '$meetingPolicyName' ---" -ForegroundColor Cyan

    $meetingPolicy = $null
    try {
        $meetingPolicy = Get-CsTeamsMeetingPolicy -Identity $meetingPolicyName -ErrorAction Stop
        Write-Host "  Found existing policy." -ForegroundColor Green
    } catch {
        Write-Host "  Policy not found — will create." -ForegroundColor Yellow
    }

    $meetingParams = @{
        AllowTranscription  = $true
        AllowCloudRecording = $true
        AutoRecording       = "Enabled"
    }

    if ($null -eq $meetingPolicy) {
        Write-Host "  Creating Meeting Policy..."
        if (-not $DryRun) {
            New-CsTeamsMeetingPolicy `
                -Identity $meetingPolicyName `
                -Description "Enforces auto-recording and transcription for recorded lines." `
                @meetingParams
            Write-Host "  [OK] Created" -ForegroundColor Green
        }
    } else {
        Write-Host "  Updating Meeting Policy..."
        if (-not $DryRun) {
            Set-CsTeamsMeetingPolicy `
                -Identity $meetingPolicyName `
                @meetingParams
            Write-Host "  [OK] Updated" -ForegroundColor Green
        }
    }

    # Assign to group
    Write-Host ""
    Write-Host "--- Group Policy Assignment ---" -ForegroundColor Cyan
    Write-Host "  Group: $GroupId"

    $existingAssignment = $null
    try {
        $existingAssignment = Get-CsGroupPolicyAssignment `
            -GroupId $GroupId `
            -PolicyType TeamsMeetingPolicy `
            -ErrorAction Stop
    } catch { }

    if ($existingAssignment -and $existingAssignment.PolicyName -eq $meetingPolicyName) {
        Write-Host "  [OK] Meeting Policy already assigned to group." -ForegroundColor Green
    } else {
        Write-Host "  Assigning Meeting Policy to group..."
        if (-not $DryRun) {
            New-CsGroupPolicyAssignment `
                -GroupId $GroupId `
                -PolicyType TeamsMeetingPolicy `
                -PolicyName $meetingPolicyName `
                -Rank 1
            Write-Host "  [OK] Assigned" -ForegroundColor Green
        }
    }
} elseif (-not $SkipMeetingPolicies -and -not $GroupId) {
    Write-Host ""
    Write-Host "[SKIP] Meeting policies — no -GroupId provided." -ForegroundColor DarkGray
    Write-Host "  To create meeting policies, re-run with -GroupId." -ForegroundColor DarkGray
}

# ─── Verification ────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "--- Verification ---" -ForegroundColor Cyan

$verifyPolicy = Get-CsApplicationAccessPolicy -Identity $policyName -ErrorAction SilentlyContinue
if ($verifyPolicy) {
    Write-Host "  Policy   : $($verifyPolicy.Identity)" -ForegroundColor Green
    Write-Host "  AppIds   : $($verifyPolicy.AppIds -join ', ')" -ForegroundColor Green
} else {
    Write-Host "  Policy   : NOT FOUND" -ForegroundColor Red
}

$globalPolicy = Get-CsApplicationAccessPolicy -Identity Global -ErrorAction SilentlyContinue
if ($globalPolicy -and $globalPolicy.AppIds -contains $AppId) {
    Write-Host "  Global   : Granted (includes $AppId)" -ForegroundColor Green
} else {
    Write-Host "  Global   : NOT granted for $AppId" -ForegroundColor Red
}

# ─── Done ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "[DONE] Teams Admin Bootstrap Complete" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "NOTE: Application Access Policy takes up to 30 minutes to propagate." -ForegroundColor Yellow
Write-Host "Test with:" -ForegroundColor Yellow
Write-Host "  GET https://graph.microsoft.com/v1.0/users/{userId}/onlineMeetings" -ForegroundColor Gray
Write-Host ""
