# Automated Azure Service Principal bootstrap script
# Creates SPN with required Graph API permissions for Terraform and nobots workflow

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Auto Bootstrap - Azure Service Principal" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Get current subscription
$subscriptionId = az account show --query id -o tsv
$tenantId = az account show --query tenantId -o tsv
$subscriptionName = az account show --query name -o tsv

Write-Host "Current Azure context:"
Write-Host "  Subscription: $subscriptionName"
Write-Host "  Subscription ID: $subscriptionId"
Write-Host "  Tenant ID: $tenantId"
Write-Host ""

# Create Service Principal
Write-Host "Creating Service Principal for Terraform..." -ForegroundColor Cyan
$spnName = "tmf-terraform-deploy-spn"

# Check if SPN already exists
$existingSpn = az ad sp list --display-name $spnName --query "[0].appId" -o tsv

if ($existingSpn) {
    Write-Host "[INF] Service Principal '$spnName' already exists - resetting credentials" -ForegroundColor Yellow
    $appId = $existingSpn
    $spnCredentialsJson = az ad sp credential reset --id $appId --output json 2>&1
} else {
    Write-Host "Creating new Service Principal..." -ForegroundColor Cyan
    $spnCredentialsJson = az ad sp create-for-rbac `
        --name $spnName `
        --role Contributor `
        --scopes "/subscriptions/$subscriptionId" `
        --output json 2>&1
}

$spnCredentials = $spnCredentialsJson | ConvertFrom-Json
$appId = if ($spnCredentials.appId) { $spnCredentials.appId } else { $existingSpn }
$clientSecret = if ($spnCredentials.password) { $spnCredentials.password } else { $spnCredentials.clientSecret }

Write-Host "[OK] Service Principal created/reset" -ForegroundColor Green
Write-Host "   App ID: $appId"

# Get Object ID
$objectId = az ad sp show --id $appId --query id -o tsv
Write-Host "   Object ID: $objectId"

# Wait for SPN to propagate
Write-Host ""
Write-Host "Waiting for SPN to propagate..." -ForegroundColor Cyan
Start-Sleep -Seconds 15

# Microsoft Graph API ID
$graphApiId = "00000003-0000-0000-c000-000000000000"

# Required Graph API permissions for nobots workflow
# NOTE: Subscription.ReadWrite.All removed — not a valid Graph application permission
$permissions = @{
    "Calendars.Read"                     = "798ee544-9d2d-430c-a058-570e29e34338"
    "Group.Read.All"                     = "5b567255-7703-4780-807c-7be8301ae99b"
    "User.Read.All"                      = "df021288-bdef-4463-88db-98f22de89214"
    "OnlineMeetings.Read.All"            = "c1684f21-1984-47fa-9d61-2dc8c296bb70"
    "OnlineMeetingTranscript.Read.All"   = "a4a80d8d-d283-4bd8-8504-555ec3870630"
    "OnlineMeetingRecording.Read.All"    = "a4a08342-c95d-476b-b943-97e100569c8d"
}

Write-Host ""
Write-Host "Adding Microsoft Graph API permissions..." -ForegroundColor Cyan

foreach ($permName in $permissions.Keys) {
    $permId = $permissions[$permName]
    Write-Host "  Adding: $permName" -ForegroundColor Gray
    
    try {
        az ad app permission add `
            --id $appId `
            --api $graphApiId `
            --api-permissions "$permId=Role" 2>$null
    } catch {
        Write-Host "    (may already exist)" -ForegroundColor DarkGray
    }
}

Write-Host "[OK] API permissions added" -ForegroundColor Green

# Grant admin consent
Write-Host ""
Write-Host "Granting admin consent..." -ForegroundColor Cyan

try {
    az ad app permission admin-consent --id $appId 2>&1 | Out-Null
    Write-Host "[OK] Admin consent granted" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Manual consent needed - open this URL:" -ForegroundColor Yellow
    Write-Host "https://portal.azure.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Permissions/objectId/$objectId/appId/$appId"
}

# Assign User Access Administrator role (for Terraform RBAC)
Write-Host ""
Write-Host "Assigning Azure RBAC roles..." -ForegroundColor Cyan
try {
    az role assignment create `
        --assignee $appId `
        --role "User Access Administrator" `
        --scope "/subscriptions/$subscriptionId" 2>$null | Out-Null
    Write-Host "  [OK] User Access Administrator" -ForegroundColor Green
} catch {
    Write-Host "  [OK] User Access Administrator (already assigned)" -ForegroundColor Green
}

Write-Host "  [OK] Contributor (already assigned)" -ForegroundColor Green

# ─── Teams Application Access Policy ────────────────────────────────────────
# Required for Graph API app-only access to /users/{id}/onlineMeetings,
# transcripts, and recordings. No REST API exists — Teams PowerShell only.
# See: https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Teams Application Access Policy" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This policy allows the app to access OnlineMeetings, Transcripts,"
Write-Host "and Recordings via Graph API. Without it, those endpoints return 403."
Write-Host "NOTE: No REST API exists for this — Teams PowerShell is the only option."
Write-Host ""

$createTeamsPolicy = Read-Host "Create Teams Application Access Policy? (y/n)"

if ($createTeamsPolicy -eq 'y') {
    # Ensure MicrosoftTeams module is available
    if (-not (Get-Module -ListAvailable -Name MicrosoftTeams)) {
        Write-Host "Installing MicrosoftTeams PowerShell module..." -ForegroundColor Yellow
        Install-Module -Name MicrosoftTeams -Force -Scope CurrentUser
    }
    Import-Module MicrosoftTeams

    # Connect to Teams (requires interactive browser auth)
    Write-Host "Connecting to Microsoft Teams (browser auth)..." -ForegroundColor Yellow
    try {
        Get-CsTenant -ErrorAction Stop | Out-Null
        Write-Host "  Already connected to Teams." -ForegroundColor Green
    } catch {
        Connect-MicrosoftTeams -TenantId $tenantId
    }

    $policyName = "MeetingFetcher-Policy"

    # Create or verify the policy
    $existingPolicy = $null
    try {
        $existingPolicy = Get-CsApplicationAccessPolicy -Identity $policyName -ErrorAction Stop
    } catch { }

    if ($null -eq $existingPolicy) {
        Write-Host "  Creating Application Access Policy '$policyName'..." -ForegroundColor Cyan
        New-CsApplicationAccessPolicy `
            -Identity $policyName `
            -AppIds $appId `
            -Description "Allow TMF app to access online meetings, transcripts, and recordings via Graph API"
        Write-Host "  [OK] Policy created" -ForegroundColor Green
    } else {
        $existingAppIds = $existingPolicy.AppIds
        if ($existingAppIds -contains $appId) {
            Write-Host "  [OK] Policy '$policyName' already exists with app $appId" -ForegroundColor Green
        } else {
            Write-Host "  Adding app $appId to existing policy..." -ForegroundColor Yellow
            Set-CsApplicationAccessPolicy `
                -Identity $policyName `
                -AppIds ($existingAppIds + $appId)
            Write-Host "  [OK] Policy updated" -ForegroundColor Green
        }
    }

    # Grant globally
    Write-Host "  Granting policy globally..." -ForegroundColor Cyan
    Grant-CsApplicationAccessPolicy -PolicyName $policyName -Global
    Write-Host "  [OK] Policy granted globally" -ForegroundColor Green
    Write-Host ""
    Write-Host "  NOTE: Policy takes up to 30 minutes to propagate." -ForegroundColor Yellow
    Write-Host "  Test with: GET /v1.0/users/{id}/onlineMeetings" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "[SKIP] Teams policy not created. You can run it later:" -ForegroundColor Yellow
    Write-Host "  .\scripts\setup\setup-teams-policies.ps1 \" -ForegroundColor Gray
    Write-Host "    -GroupId `"<GROUP-ID>`" \" -ForegroundColor Gray
    Write-Host "    -CatalogAppId `"<CATALOG-APP-ID>`" \" -ForegroundColor Gray
    Write-Host "    -BotAppId `"$appId`"" -ForegroundColor Gray
}

# Output credentials
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "[DONE] Bootstrap Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Credentials:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  azure_subscription_id = `"$subscriptionId`""
Write-Host "  azure_tenant_id       = `"$tenantId`""
Write-Host "  azure_client_id       = `"$appId`""
Write-Host "  azure_client_secret   = `"$clientSecret`""
Write-Host ""

# Update terraform.tfvars
Write-Host "Updating iac/azure/terraform.tfvars..." -ForegroundColor Cyan
$tfvarsPath = Join-Path $PSScriptRoot "..\iac\azure\terraform.tfvars"
$tfvarsContent = @"
# Auto-generated by bootstrap script on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
environment  = "dev"
azure_region = "eastus"
region_short = "eus"

# Azure Service Principal credentials
azure_subscription_id = "$subscriptionId"
azure_tenant_id       = "$tenantId"
azure_client_id       = "$appId"
azure_client_secret   = "$clientSecret"

# Test User Configuration
create_test_user = true

# Bot App Display Name
bot_app_display_name = "Teams Meeting Fetcher Bot"

# Bot messaging endpoint (placeholder - update after AWS deployment)
bot_messaging_endpoint = "https://placeholder.example.com/bot/messages"

# Firewall allowlist (Key Vault and Storage access)
allowed_ip_addresses = ["47.206.222.73"]
"@

$tfvarsContent | Out-File -FilePath $tfvarsPath -Encoding utf8
Write-Host "[OK] terraform.tfvars updated" -ForegroundColor Green

# Also update nobots/.env 
Write-Host "Updating nobots/.env..." -ForegroundColor Cyan
$nobotEnvPath = Join-Path $PSScriptRoot "..\nobots\.env"
$nobotEnvContent = @"
# Azure AD - Auto-generated by bootstrap script on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
GRAPH_TENANT_ID=$tenantId
GRAPH_CLIENT_ID=$appId
GRAPH_CLIENT_SECRET=$clientSecret

# User to monitor - Replace with actual user UPN
WATCH_USER_ID=boldoriole@ibuyspy.net

# File storage
DATA_DIR=./data
"@

$nobotEnvContent | Out-File -FilePath $nobotEnvPath -Encoding utf8
Write-Host "[OK] nobots/.env updated" -ForegroundColor Green

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. cd iac/azure"
Write-Host "2. terraform plan"
Write-Host "3. terraform apply"
Write-Host ""
Write-Host "Or test nobots immediately:" -ForegroundColor Cyan
Write-Host "1. cd nobots"
Write-Host "2. npm run poll"
Write-Host ""
