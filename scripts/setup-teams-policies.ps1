<#
.SYNOPSIS
    Configures Teams admin policies for Meeting Fetcher.
    Scoped to a security group — NOT tenant-wide.

.DESCRIPTION
    1. Configures the "Recorded Line" App Setup Policy to auto-install Meeting Fetcher.
    2. Configures a "Recorded Line" Meeting Policy to enforce transcription + auto-recording.
    3. Assigns both policies to a specified Azure AD security group.

.PARAMETER GroupId
    The Azure AD Object ID of the security group to assign policies to.

.PARAMETER GroupName
    Display name of the group (used for logging only).

.PARAMETER CatalogAppId
    The Teams catalog app ID for Meeting Fetcher (not the manifest external ID).
    Find via: Get-TeamsApp -DistributionMethod Organization
    Defaults to Meeting Fetcher's catalog ID.

.PARAMETER DryRun
    If set, only shows what would be done without making changes.

.EXAMPLE
    .\setup-teams-policies.ps1 -GroupId "<YOUR-GROUP-OBJECT-ID>" -CatalogAppId "<YOUR-CATALOG-APP-ID>"

.EXAMPLE
    .\setup-teams-policies.ps1 -GroupId "<YOUR-GROUP-OBJECT-ID>" -CatalogAppId "<YOUR-CATALOG-APP-ID>" -DryRun
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$GroupId,

    [string]$GroupName = "",

    # Teams catalog app ID (not the manifest external ID).
    # Find via: Get-TeamsApp -DistributionMethod Organization | Format-Table Id, DisplayName
    [Parameter(Mandatory = $true)]
    [string]$CatalogAppId,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$PolicyName = "Recorded Line"

# ─── Prerequisite check ───────────────────────────────────────────────────────

Write-Host "`n=== Meeting Fetcher – Teams Policy Setup ===" -ForegroundColor Cyan
Write-Host "Policy name    : $PolicyName"
Write-Host "Target group   : $GroupId $GroupName"
Write-Host "Catalog App ID : $CatalogAppId"
if ($DryRun) { Write-Host "[DRY RUN] No changes will be made." -ForegroundColor Yellow }
Write-Host ""

# Check MicrosoftTeams module
if (-not (Get-Module -ListAvailable -Name MicrosoftTeams)) {
    Write-Host "Installing MicrosoftTeams PowerShell module..." -ForegroundColor Yellow
    Install-Module -Name MicrosoftTeams -Force -Scope CurrentUser
}

Import-Module MicrosoftTeams

# Connect (opens browser auth)
try {
    $session = Get-CsTenant -ErrorAction Stop | Out-Null
    Write-Host "Already connected to Teams." -ForegroundColor Green
} catch {
    Write-Host "Connecting to Microsoft Teams..." -ForegroundColor Yellow
    Connect-MicrosoftTeams
}

# ─── 1. App Setup Policy – "Recorded Line" ────────────────────────────────────

Write-Host "`n--- App Setup Policy: '$PolicyName' ---" -ForegroundColor Cyan

$setupPolicy = $null
try {
    $setupPolicy = Get-CsTeamsAppSetupPolicy -Identity $PolicyName -ErrorAction Stop
    Write-Host "  Found existing policy." -ForegroundColor Green
} catch {
    Write-Host "  Policy not found – will create." -ForegroundColor Yellow
}

# The AppPresetList uses Teams catalog app IDs (not manifest external IDs).
# The app must already be uploaded to the org catalog via New-TeamsApp.
if ($null -eq $setupPolicy) {
    Write-Host "  Creating App Setup Policy '$PolicyName'..."
    if (-not $DryRun) {
        New-CsTeamsAppSetupPolicy `
            -Identity $PolicyName `
            -Description "Auto-installs Meeting Fetcher for recorded meeting lines."
        # Add the app via JSON-style AppPresetList
        Set-CsTeamsAppSetupPolicy `
            -Identity $PolicyName `
            -AppPresetList @([PSCustomObject]@{ Id = $CatalogAppId })
        Write-Host "  Created." -ForegroundColor Green
    }
} else {
    # Check if Meeting Fetcher is already in the installed apps
    $existingIds = $setupPolicy.AppPresetList | ForEach-Object { $_.Id }
    if ($existingIds -contains $CatalogAppId) {
        Write-Host "  Meeting Fetcher already in installed apps – no change needed." -ForegroundColor Green
    } else {
        Write-Host "  Adding Meeting Fetcher to installed apps..."
        $updatedApps = [System.Collections.Generic.List[object]]::new()
        foreach ($app in $setupPolicy.AppPresetList) { $updatedApps.Add($app) }
        $updatedApps.Add([PSCustomObject]@{ Id = $CatalogAppId })
        if (-not $DryRun) {
            Set-CsTeamsAppSetupPolicy `
                -Identity $PolicyName `
                -AppPresetList $updatedApps
            Write-Host "  Updated." -ForegroundColor Green
        }
    }
}

# ─── 2. Meeting Policy – "Recorded Line" ──────────────────────────────────────

Write-Host "`n--- Meeting Policy: '$PolicyName' ---" -ForegroundColor Cyan

$meetingPolicy = $null
try {
    $meetingPolicy = Get-CsTeamsMeetingPolicy -Identity $PolicyName -ErrorAction Stop
    Write-Host "  Found existing policy." -ForegroundColor Green
} catch {
    Write-Host "  Policy not found – will create." -ForegroundColor Yellow
}

$meetingParams = @{
    AllowTranscription  = $true
    AllowCloudRecording = $true
    AutoRecording       = "Enabled"  # strongest enforcement: auto-starts recording + transcription
}

if ($null -eq $meetingPolicy) {
    Write-Host "  Creating Meeting Policy '$PolicyName'..."
    if (-not $DryRun) {
        New-CsTeamsMeetingPolicy `
            -Identity $PolicyName `
            -Description "Enforces auto-recording and transcription for recorded lines." `
            @meetingParams
        Write-Host "  Created." -ForegroundColor Green
    }
} else {
    Write-Host "  Updating Meeting Policy '$PolicyName'..."
    if (-not $DryRun) {
        Set-CsTeamsMeetingPolicy `
            -Identity $PolicyName `
            @meetingParams
        Write-Host "  Updated." -ForegroundColor Green
    }
}

# ─── 3. Assign both policies to the security group ────────────────────────────

Write-Host "`n--- Group Policy Assignment ---" -ForegroundColor Cyan
Write-Host "  Group: $GroupId"

# App Setup Policy → Group
Write-Host "  Assigning App Setup Policy '$PolicyName' to group..."
$existingSetupAssignment = $null
try {
    $existingSetupAssignment = Get-CsGroupPolicyAssignment `
        -GroupId $GroupId `
        -PolicyType TeamsAppSetupPolicy `
        -ErrorAction Stop
} catch { }

if ($existingSetupAssignment -and $existingSetupAssignment.PolicyName -eq $PolicyName) {
    Write-Host "  App Setup Policy already assigned to group." -ForegroundColor Green
} else {
    if (-not $DryRun) {
        # Rank determines priority when a user is in multiple groups (1 = highest)
        New-CsGroupPolicyAssignment `
            -GroupId $GroupId `
            -PolicyType TeamsAppSetupPolicy `
            -PolicyName $PolicyName `
            -Rank 1
        Write-Host "  App Setup Policy assigned." -ForegroundColor Green
    } else {
        Write-Host "  [DRY RUN] Would assign App Setup Policy." -ForegroundColor Yellow
    }
}

# Meeting Policy → Group
Write-Host "  Assigning Meeting Policy '$PolicyName' to group..."
$existingMeetingAssignment = $null
try {
    $existingMeetingAssignment = Get-CsGroupPolicyAssignment `
        -GroupId $GroupId `
        -PolicyType TeamsMeetingPolicy `
        -ErrorAction Stop
} catch { }

if ($existingMeetingAssignment -and $existingMeetingAssignment.PolicyName -eq $PolicyName) {
    Write-Host "  Meeting Policy already assigned to group." -ForegroundColor Green
} else {
    if (-not $DryRun) {
        New-CsGroupPolicyAssignment `
            -GroupId $GroupId `
            -PolicyType TeamsMeetingPolicy `
            -PolicyName $PolicyName `
            -Rank 1
        Write-Host "  Meeting Policy assigned." -ForegroundColor Green
    } else {
        Write-Host "  [DRY RUN] Would assign Meeting Policy." -ForegroundColor Yellow
    }
}

# ─── 4. Verify ────────────────────────────────────────────────────────────────

Write-Host "`n--- Verification ---" -ForegroundColor Cyan

Write-Host "`n  App Setup Policy:"
Get-CsTeamsAppSetupPolicy -Identity $PolicyName |
    Select-Object Identity, Description, @{N='InstalledApps';E={($_.AppPresetList | ForEach-Object { $_.Id }) -join ', '}} |
    Format-List

Write-Host "  Meeting Policy:"
Get-CsTeamsMeetingPolicy -Identity $PolicyName |
    Select-Object Identity, AllowTranscription, AllowCloudRecording, AutoRecording |
    Format-List

Write-Host "  Group Assignments:"
Get-CsGroupPolicyAssignment -GroupId $GroupId |
    Select-Object PolicyType, PolicyName, Rank |
    Format-Table -AutoSize

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Note: Policy changes can take 4-24 hours to propagate to users." -ForegroundColor Yellow
Write-Host ""
