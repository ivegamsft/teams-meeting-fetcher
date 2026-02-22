# Script to regrant admin consent for Teams Meeting Fetcher Bot
# After reducing permissions from 7 to 5, admin consent needs to be re-granted
#
# Usage: .\regrant-bot-app-consent.ps1 [-BotAppId <app-id>]
#
# The Bot App ID can be provided via:
#   1. Parameter: -BotAppId
#   2. Environment variable: BOT_APP_ID or AZURE_BOT_APP_ID
#   3. Terraform output: azure_bot_app_id (from iac/ directory)

param(
    [Parameter(Mandatory=$false)]
    [string]$BotAppId
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Re-grant Admin Consent for Teams Meeting Fetcher Bot" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Check Azure CLI is installed and logged in
try {
    $null = az account show 2>$null
} catch {
    Write-Host "❌ Not logged in to Azure CLI" -ForegroundColor Red
    Write-Host "Please run: az login" -ForegroundColor Yellow
    exit 1
}

# Get Bot App ID from parameter, environment variable, or Terraform output
if (-not $BotAppId) {
    # Try environment variables first
    $BotAppId = $env:BOT_APP_ID
    if (-not $BotAppId) {
        $BotAppId = $env:AZURE_BOT_APP_ID
    }
    
    # If still not found, try Terraform output
    if (-not $BotAppId) {
        Write-Host "Looking up Bot App ID from Terraform outputs..." -ForegroundColor Cyan
        $iacDir = Join-Path $PSScriptRoot "..\..\iac"
        if (Test-Path $iacDir) {
            Push-Location $iacDir
            try {
                $tfOutputJson = terraform output -json 2>$null | ConvertFrom-Json
                if ($tfOutputJson -and $tfOutputJson.azure_bot_app_id) {
                    $BotAppId = $tfOutputJson.azure_bot_app_id.value
                    Write-Host "  ✅ Found from Terraform: $BotAppId" -ForegroundColor Green
                }
            } catch {
                Write-Host "  ⚠️  Could not read Terraform outputs" -ForegroundColor Yellow
            } finally {
                Pop-Location
            }
        }
    }
}

# Validate Bot App ID is provided
if (-not $BotAppId) {
    Write-Host "❌ Bot App ID not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please provide the Bot App ID via:" -ForegroundColor Yellow
    Write-Host "  1. Parameter: .\regrant-bot-app-consent.ps1 -BotAppId <app-id>" -ForegroundColor Gray
    Write-Host "  2. Environment variable: `$env:BOT_APP_ID='<app-id>'" -ForegroundColor Gray
    Write-Host "  3. Terraform output: Run from iac/ directory after deployment" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

$botAppName = "Teams Meeting Fetcher Bot"

Write-Host "Looking for Bot application: $botAppName" -ForegroundColor Cyan
Write-Host "Bot App ID: $BotAppId" -ForegroundColor Gray
Write-Host ""

# Verify the app exists
$appExists = az ad app show --id $botAppId --query appId -o tsv 2>$null
if (-not $appExists) {
    Write-Host "❌ Bot application not found with ID: $botAppId" -ForegroundColor Red
    Write-Host "Please verify the app was created by Terraform" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Found Bot application" -ForegroundColor Green
Write-Host ""

# Get current API permissions
Write-Host "Current Graph API permissions for Bot:" -ForegroundColor Cyan
$currentPermissions = az ad app permission list --id $botAppId --query "[?resourceAppId=='00000003-0000-0000-c000-000000000000'].resourceAccess[]" -o json | ConvertFrom-Json

if (-not $currentPermissions -or $currentPermissions.Count -eq 0) {
    Write-Host "  ⚠️  No Graph API permissions found" -ForegroundColor Yellow
    Write-Host "  This is unexpected - Terraform should have configured 5 permissions" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Expected permissions (after security hardening)
$expectedPermissions = @{
    "b8bb2037-6e08-44ac-a4ea-4674e010e2a4" = "OnlineMeetings.ReadWrite.All"
    "a4a80d8d-0849-410b-b711-e25bb11ba43d" = "OnlineMeetingTranscript.Read.All"
    "a4a08342-1043-4ca2-8a54-4837bc001b64" = "OnlineMeetingRecording.Read.All"
    "5b567255-7703-4780-807c-7be8301ae99b" = "Group.Read.All"
    "df021288-bdef-4463-88db-98f22de89214" = "User.Read.All"
}

# Verify we have the expected 5 permissions
$hasCorrectPermissions = $true
foreach ($permId in $expectedPermissions.Keys) {
    $permName = $expectedPermissions[$permId]
    $found = $currentPermissions | Where-Object { $_.id -eq $permId }
    
    if ($found) {
        Write-Host "  ✅ $permName" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Missing: $permName" -ForegroundColor Red
        $hasCorrectPermissions = $false
    }
}

# Check for removed permissions (should NOT be present)
$removedPermissions = @{
    "f6b49018-60ab-4f81-83bd-22caeabfed2d" = "Calls.JoinGroupCall.All"
    "284383ee-7f6e-4e40-a2a8-e85dcb029101" = "Calls.Initiate.All"
}

foreach ($permId in $removedPermissions.Keys) {
    $permName = $removedPermissions[$permId]
    $found = $currentPermissions | Where-Object { $_.id -eq $permId }
    
    if ($found) {
        Write-Host "  ⚠️  Still present (should be removed): $permName" -ForegroundColor Yellow
        $hasCorrectPermissions = $false
    }
}

Write-Host ""

if (-not $hasCorrectPermissions) {
    Write-Host "⚠️  Permission configuration doesn't match expected state" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Expected 5 permissions (from security hardening):" -ForegroundColor Cyan
    Write-Host "  1. OnlineMeetings.ReadWrite.All - Create meetings & enable recording" -ForegroundColor Gray
    Write-Host "  2. OnlineMeetingTranscript.Read.All - Download transcripts" -ForegroundColor Gray
    Write-Host "  3. OnlineMeetingRecording.Read.All - Download recordings" -ForegroundColor Gray
    Write-Host "  4. Group.Read.All - Validate group membership" -ForegroundColor Gray
    Write-Host "  5. User.Read.All - Read user profiles" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Removed (no longer needed):" -ForegroundColor Cyan
    Write-Host "  ❌ Calls.JoinGroupCall.All - Future auto-join functionality" -ForegroundColor Gray
    Write-Host "  ❌ Calls.Initiate.All - Future call initiation" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Please run: cd iac && terraform apply" -ForegroundColor Yellow
    Write-Host "This will update the Bot app permissions to the correct state" -ForegroundColor Yellow
    Write-Host ""
    $continueAnyway = Read-Host "Continue to grant consent anyway? (yes/no)"
    if ($continueAnyway -ne "yes") {
        exit 0
    }
}

Write-Host "Granting admin consent for Bot application..." -ForegroundColor Cyan
Write-Host "⚠️  This requires Global Administrator or Cloud Application Administrator role" -ForegroundColor Yellow
Write-Host ""

try {
    az ad app permission admin-consent --id $botAppId 2>&1 | Out-Null
    Write-Host "✅ Admin consent granted successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to grant admin consent automatically" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please grant admin consent manually:" -ForegroundColor Yellow
    Write-Host "1. Go to Azure Portal:" -ForegroundColor Gray
    Write-Host "   https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$botAppId" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Navigate to: API permissions" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Click: 'Grant admin consent for [Your Tenant]'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "4. Confirm when prompted" -ForegroundColor Gray
    Write-Host ""
    $manualDone = Read-Host "Press Enter after granting consent manually"
}

# Verify consent was granted
Write-Host ""
Write-Host "Verifying admin consent..." -ForegroundColor Cyan
Start-Sleep -Seconds 3  # Give Azure AD time to update

$consentStatus = az ad app permission list-grants --id $botAppId --query "[].scope" -o tsv 2>$null

if ($consentStatus) {
    Write-Host "✅ Admin consent verified - permissions are active" -ForegroundColor Green
} else {
    Write-Host "⚠️  Unable to verify consent status" -ForegroundColor Yellow
    Write-Host "Please verify manually in Azure Portal" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Bot App Consent Complete! 🎉" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The Bot now has consent for these 5 permissions:" -ForegroundColor Cyan
Write-Host "  ✅ OnlineMeetings.ReadWrite.All" -ForegroundColor Green
Write-Host "  ✅ OnlineMeetingTranscript.Read.All" -ForegroundColor Green
Write-Host "  ✅ OnlineMeetingRecording.Read.All" -ForegroundColor Green
Write-Host "  ✅ Group.Read.All" -ForegroundColor Green
Write-Host "  ✅ User.Read.All" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Test Bot functionality: python scripts/graph/03-create-test-meeting.py" -ForegroundColor Gray
Write-Host "2. Verify transcript download: python scripts/graph/04-poll-transcription.py" -ForegroundColor Gray
Write-Host "3. Check group membership validation works" -ForegroundColor Gray
Write-Host ""
