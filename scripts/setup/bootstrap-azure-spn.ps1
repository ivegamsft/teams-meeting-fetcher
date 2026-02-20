# Bootstrap script for setting up Azure Service Principal with required permissions
# Run this script with Global Administrator or Privileged Role Administrator privileges

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Teams Meeting Fetcher - SPN Bootstrap Script" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Azure CLI is installed
try {
    $null = Get-Command az -ErrorAction Stop
    Write-Host "✅ Azure CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ Azure CLI is not installed" -ForegroundColor Red
    Write-Host "Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
try {
    $null = az account show 2>$null
} catch {
    Write-Host "⚠️  Not logged in to Azure" -ForegroundColor Yellow
    Write-Host "Logging in..." -ForegroundColor Yellow
    az login
}

# Validate current user has required permissions
Write-Host ""
Write-Host "Validating your Azure AD permissions..." -ForegroundColor Cyan

$currentUserId = az ad signed-in-user show --query id -o tsv 2>$null
if (-not $currentUserId) {
    Write-Host "❌ Unable to get current user information" -ForegroundColor Red
    Write-Host "Please ensure you're logged in with: az login" -ForegroundColor Yellow
    exit 1
}

# Check for required directory roles
$privilegedRoleAdminId = "e8611ab8-c189-46e8-94e1-60213ab1f814"
$globalAdminId = "62e90394-69f5-4237-9190-012177145e10"

$userRoles = az rest --method GET --uri "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments?`$filter=principalId eq '$currentUserId'&`$expand=roleDefinition" --query "value[].roleDefinition.id" -o tsv 2>$null

$hasPrivilegedRoleAdmin = $userRoles -contains $privilegedRoleAdminId
$hasGlobalAdmin = $userRoles -contains $globalAdminId

if ($hasGlobalAdmin) {
    Write-Host "✅ You have Global Administrator role" -ForegroundColor Green
} elseif ($hasPrivilegedRoleAdmin) {
    Write-Host "✅ You have Privileged Role Administrator role" -ForegroundColor Green
} else {
    Write-Host "❌ Missing required Azure AD role" -ForegroundColor Red
    Write-Host ""
    Write-Host "This script requires one of the following roles:" -ForegroundColor Yellow
    Write-Host "  • Global Administrator" -ForegroundColor Gray
    Write-Host "  • Privileged Role Administrator" -ForegroundColor Gray
    Write-Host ""
    Write-Host "These roles are needed to grant directory roles to the Service Principal." -ForegroundColor Gray
    Write-Host "Contact your Azure AD administrator to get the appropriate role assigned." -ForegroundColor Yellow
    Write-Host ""
    $override = Read-Host "Continue anyway? (yes/no)"
    if ($override -ne "yes") {
        exit 1
    }
    Write-Host "⚠️  Proceeding without validation - some operations may fail" -ForegroundColor Yellow
}

# Get current subscription
$subscriptionId = az account show --query id -o tsv
$tenantId = az account show --query tenantId -o tsv
$subscriptionName = az account show --query name -o tsv

Write-Host ""
Write-Host "Current Azure context:" -ForegroundColor Cyan
Write-Host "  Subscription: $subscriptionName"
Write-Host "  Subscription ID: $subscriptionId"
Write-Host "  Tenant ID: $tenantId"
Write-Host ""

$confirm = Read-Host "Is this the correct subscription? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Please select the correct subscription with 'az account set --subscription <id>'" -ForegroundColor Yellow
    exit 1
}

# Create Service Principal
Write-Host ""
Write-Host "Creating Service Principal for Terraform deployment..." -ForegroundColor Cyan
$spnName = "tmf-terraform-deploy-spn"

# Check if SPN already exists
$existingSpn = az ad sp list --display-name $spnName --query "[0].appId" -o tsv

if ($existingSpn) {
    Write-Host "⚠️  Service Principal '$spnName' already exists" -ForegroundColor Yellow
    $reset = Read-Host "Do you want to reset credentials? (yes/no)"
    if ($reset -eq "yes") {
        $appId = $existingSpn
        Write-Host "Resetting credentials for existing SPN..." -ForegroundColor Yellow
        $spnCredentialsJson = az ad sp credential reset --id $appId --output json --only-show-errors 2>&1 | Out-String
    } else {
        Write-Host "Using existing SPN. You'll need to provide credentials manually." -ForegroundColor Yellow
        $appId = $existingSpn
        $spnCredentialsJson = $null
    }
} else {
    Write-Host "Creating new Service Principal..." -ForegroundColor Cyan
    $spnCredentialsJson = az ad sp create-for-rbac `
        --name $spnName `
        --role Contributor `
        --scopes "/subscriptions/$subscriptionId" `
        --output json `
        --only-show-errors 2>&1 | Out-String

    try {
        $spnCredentials = $spnCredentialsJson | ConvertFrom-Json
        $appId = $spnCredentials.appId
    } catch {
        Write-Host "❌ Failed to parse SPN credentials output" -ForegroundColor Red
        Write-Host $spnCredentialsJson
        exit 1
    }
}

if (-not $appId) {
    Write-Host "❌ Failed to create/find Service Principal" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Service Principal created/found" -ForegroundColor Green
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

# Required Graph API permissions
$permissions = @{
    "Application.ReadWrite.All" = "1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9"
    "AppCatalog.ReadWrite.All" = "dc149144-f292-421e-b185-5953f2e98d7f"
    "Calendars.Read" = "798ee544-9d2d-430c-a058-570e29e34338"
    "OnlineMeetings.Read.All" = "6931bccd-447a-43d1-b442-00a195474933"
    "OnlineMeetings.ReadWrite" = "b8bb2037-6e08-44ac-a4ea-4674e010e2a4"
    "Group.Read.All" = "5b567255-7703-4780-807c-7be8301ae99b"
    "User.Read.All" = "df021288-bdef-4463-88db-98f22de89214"
    "Domain.Read.All" = "dbb9058a-0e50-45e7-ae91-66909b422a6c"
    "Directory.Read.All" = "7ab1d382-f21e-4acd-a863-ba3e13f7da61"
}

Write-Host ""
Write-Host "Adding Microsoft Graph API permissions to SPN..." -ForegroundColor Cyan

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

Write-Host "✅ API permissions added" -ForegroundColor Green

# Grant admin consent
Write-Host ""
Write-Host "Granting admin consent for API permissions..." -ForegroundColor Cyan
Write-Host "⚠️  This requires Global Administrator or Privileged Role Administrator role" -ForegroundColor Yellow

try {
    az ad app permission admin-consent --id $appId 2>&1 | Out-Null
    Write-Host "✅ Admin consent granted" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to grant admin consent automatically" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please grant admin consent manually:" -ForegroundColor Yellow
    Write-Host "1. Go to: https://portal.azure.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Permissions/objectId/$objectId/appId/$appId"
    Write-Host "2. Click 'Grant admin consent for [Your Tenant]'"
    Write-Host ""
    Read-Host "Press Enter after granting consent"
}

# Assign Azure RBAC roles
Write-Host ""
Write-Host "Assigning Azure RBAC roles..." -ForegroundColor Cyan

# Contributor role (should already exist from create-for-rbac)
Write-Host "  ✅ Contributor (already assigned)" -ForegroundColor Green

# User Access Administrator (needed for RBAC assignments in Terraform)
Write-Host "  Assigning: User Access Administrator" -ForegroundColor Gray
try {
    az role assignment create `
        --assignee $appId `
        --role "User Access Administrator" `
        --scope "/subscriptions/$subscriptionId" 2>$null
} catch {
    Write-Host "    (may already exist)" -ForegroundColor DarkGray
}

Write-Host "✅ Azure RBAC roles assigned" -ForegroundColor Green

# Assign Azure AD Directory roles (needed for creating users, apps, and groups)
Write-Host ""
Write-Host "Assigning Azure AD Directory Roles..." -ForegroundColor Cyan
Write-Host "  (These allow Terraform to create App Registrations and Security Groups)" -ForegroundColor Gray

try {
    # Directory.ReadWrite.All via Directory Writers role or Graph app role
    Write-Host "  Assigning: Directory.ReadWrite.All" -ForegroundColor Gray
    $directoryWriteRoleId = az ad role list --query "[?displayName=='Directory Writers'].id" -o tsv
    
    if (-not $directoryWriteRoleId) {
        Write-Host "    (Directory Writers role not found, trying alternative)" -ForegroundColor DarkGray
        $graphToken = az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv
        
        $headers = @{
            "Authorization" = "Bearer $graphToken"
            "Content-Type"  = "application/json"
        }
        
        $appRoleAssignment = @{
            principalId = $objectId
            resourceId  = "97e44b74-bbb5-4ee9-9a57-80eb6e3f3e29"
            appRoleId   = "19dbc75e-c427-40af-ae59-e678299e54c3"
        } | ConvertTo-Json
        
        try {
            Invoke-WebRequest -Uri "https://graph.microsoft.com/v1.0/servicePrincipals/$objectId/appRoleAssignments" `
                -Headers $headers `
                -Method Post `
                -Body $appRoleAssignment `
                -ErrorAction SilentlyContinue | Out-Null
            Write-Host "    ✅ Directory.ReadWrite.All app role assigned via Graph API" -ForegroundColor Green
        } catch {
            Write-Host "    (may already exist or insufficient permissions to assign)" -ForegroundColor DarkGray
        }
    } else {
        az ad role assignment create `
            --assignee-object-id $objectId `
            --role $directoryWriteRoleId 2>$null
        Write-Host "    ✅ Directory Writers role assigned" -ForegroundColor Green
    }
} catch {
    Write-Host "    ⚠️  Could not assign Directory AD role automatically" -ForegroundColor Yellow
    Write-Host "    This requires Global Administrator role. Please assign manually:" -ForegroundColor Yellow
    Write-Host "    1. Go to: https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RoleManagement" -ForegroundColor Yellow
    Write-Host "    2. Search for 'Directory.ReadWrite.All' and assign to: $appId" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter after manual assignment or to continue anyway"
}

# Wait for propagation
Start-Sleep -Seconds 5

# Application Administrator role (to create App Registrations)
Write-Host "  Assigning: Application Administrator" -ForegroundColor Gray
$appAdminRoleId = "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3"
$appAdminBody = @{
    principalId = $objectId
    roleDefinitionId = $appAdminRoleId
    directoryScopeId = "/"
} | ConvertTo-Json -Compress

$tempFile = [System.IO.Path]::GetTempFileName()
$appAdminBody | Out-File -FilePath $tempFile -Encoding utf8
try {
    $result = az rest --method POST --uri "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments" `
        --headers "Content-Type=application/json" `
        --body "@$tempFile" 2>&1
    Write-Host "    ✅ Application Administrator granted" -ForegroundColor Green
} catch {
    if ($result -match "already exists") {
        Write-Host "    (already assigned)" -ForegroundColor DarkGray
    } else {
        Write-Host "    ⚠️  Failed (may need manual assignment)" -ForegroundColor Yellow
    }
} finally {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
}

# Groups Administrator role (to create Security Groups)
Write-Host "  Assigning: Groups Administrator" -ForegroundColor Gray
$groupsAdminRoleId = "fdd7a751-b60b-444a-984c-02652fe8fa1c"
$groupsAdminBody = @{
    principalId = $objectId
    roleDefinitionId = $groupsAdminRoleId
    directoryScopeId = "/"
} | ConvertTo-Json -Compress

$tempFile = [System.IO.Path]::GetTempFileName()
$groupsAdminBody | Out-File -FilePath $tempFile -Encoding utf8
try {
    $result = az rest --method POST --uri "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments" `
        --headers "Content-Type=application/json" `
        --body "@$tempFile" 2>&1
    Write-Host "    ✅ Groups Administrator granted" -ForegroundColor Green
} catch {
    if ($result -match "already exists") {
        Write-Host "    (already assigned)" -ForegroundColor DarkGray
    } else {
        Write-Host "    ⚠️  Failed (may need manual assignment)" -ForegroundColor Yellow
    }
} finally {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
}

Write-Host "✅ Directory roles assigned" -ForegroundColor Green
# Output credentials
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Service Principal Setup Complete! 🎉" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($spnCredentialsJson) {
    $spnCredentials = $spnCredentialsJson | ConvertFrom-Json
    $clientSecret = if ($spnCredentials.password) { $spnCredentials.password } else { $spnCredentials.clientSecret }
    
    Write-Host "Save these credentials securely:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "azure_subscription_id = `"$subscriptionId`""
    Write-Host "azure_tenant_id       = `"$tenantId`""
    Write-Host "azure_client_id       = `"$appId`""
    Write-Host "azure_client_secret   = `"$clientSecret`""
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Save the client_secret now - it won't be shown again!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Permissions granted:" -ForegroundColor Cyan
    Write-Host "  • Contributor (manage Azure resources)" -ForegroundColor Gray
    Write-Host "  • User Access Administrator (assign RBAC roles)" -ForegroundColor Gray
    Write-Host "  • Application Administrator (create App Registrations)" -ForegroundColor Gray
    Write-Host "  • Groups Administrator (create Security Groups)" -ForegroundColor Gray
    Write-Host "  • Graph API permissions (Calendar, Meetings, etc.)" -ForegroundColor Gray
    Write-Host ""
    
    # Optionally write to terraform.tfvars
    $writeTfvars = Read-Host "Write these values to iac/azure/terraform.tfvars? (yes/no)"
    if ($writeTfvars -eq "yes") {
        # Generate random password
        $randomPassword = -join ((65..90) + (97..122) + (48..57) + (33,35,36,37,42,64) | Get-Random -Count 16 | ForEach-Object {[char]$_})
        $randomPassword = $randomPassword + "Aa1!"  # Ensure complexity requirements
        
        $tfvarsPath = Join-Path $PSScriptRoot "..\iac\azure\terraform.tfvars"
        $tfvarsContent = @"
# Generated by bootstrap script on $(Get-Date)
# NEVER commit this file to version control!

environment      = "dev"
azure_region     = "eastus"
region_short     = "eus"

azure_subscription_id = "$subscriptionId"
azure_tenant_id       = "$tenantId"
azure_client_id       = "$appId"
azure_client_secret   = "$clientSecret"

# Test User Configuration
create_test_user = true
"@
        
        $tfvarsContent | Out-File -FilePath $tfvarsPath -Encoding utf8
        Write-Host "✅ Credentials written to iac/azure/terraform.tfvars" -ForegroundColor Green
        Write-Host "⚠️  Remember to add terraform.tfvars to .gitignore!" -ForegroundColor Yellow
    }
} else {
    Write-Host "Credentials not available (using existing SPN)" -ForegroundColor Yellow
    Write-Host "Please retrieve credentials from Key Vault or reset them if needed"
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. ⚠️  WAIT 5-10 minutes for Azure AD permissions to propagate" -ForegroundColor Yellow
Write-Host "2. cd infra (use unified deployment, not iac/azure)" -ForegroundColor Gray
Write-Host "3. terraform init" -ForegroundColor Gray
Write-Host "4. terraform plan -out=tfplan" -ForegroundColor Gray
Write-Host "5. terraform apply tfplan" -ForegroundColor Gray
Write-Host ""
