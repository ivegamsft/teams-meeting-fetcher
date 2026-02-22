# Script to remove unnecessary Graph API permissions from tmf-terraform-deploy-spn
# This fixes existing SPNs that were created with the old bootstrap script
#
# Usage: .\remove-terraform-spn-graph-permissions.ps1 [-SpnName <name>]
#
# The SPN name can be provided via:
#   1. Parameter: -SpnName
#   2. Environment variable: TERRAFORM_SPN_NAME
#   3. Default: tmf-terraform-deploy-spn

param(
    [Parameter(Mandatory=$false)]
    [string]$SpnName = "tmf-terraform-deploy-spn"
)

$ErrorActionPreference = "Stop"

# Allow environment variable override
if ($env:TERRAFORM_SPN_NAME -and -not $PSBoundParameters.ContainsKey('SpnName')) {
    $SpnName = $env:TERRAFORM_SPN_NAME
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Remove Graph API Permissions from Terraform Deployment SPN" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check Azure CLI is installed and logged in
try {
    $null = az account show 2>$null
} catch {
    Write-Host "❌ Not logged in to Azure CLI" -ForegroundColor Red
    Write-Host "Please run: az login" -ForegroundColor Yellow
    exit 1
}

$spnName = "tmf-terraform-deploy-spn"

Write-Host "Looking for Service Principal: $spnName" -ForegroundColor Cyan
$spnAppId = az ad sp list --display-name $spnName --query "[0].appId" -o tsv

if (-not $spnAppId) {
    Write-Host "❌ Service Principal '$spnName' not found" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Found SPN with App ID: $spnAppId" -ForegroundColor Green
Write-Host ""

# Get current API permissions
Write-Host "Current Graph API permissions:" -ForegroundColor Cyan
$currentPermissions = az ad app permission list --id $spnAppId --query "[?resourceAppId=='00000003-0000-0000-c000-000000000000'].resourceAccess[]" -o json | ConvertFrom-Json

if (-not $currentPermissions -or $currentPermissions.Count -eq 0) {
    Write-Host "  ✅ No Graph API permissions found (already clean!)" -ForegroundColor Green
    Write-Host ""
    exit 0
}

# Graph API permission IDs to names (for display)
$permissionNames = @{
    "798ee544-9d2d-430c-a058-570e29e34338" = "Calendars.Read"
    "7ab1d382-f21e-4acd-a863-ba3e13f7da61" = "Directory.Read.All"
    "a4a80d8d-0849-410b-b711-e25bb11ba43d" = "OnlineMeetingTranscript.Read.All"
    "1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9" = "Application.ReadWrite.All"
    "dc149144-f292-421e-b185-5953f2e98d7f" = "AppCatalog.ReadWrite.All"
    "6931bccd-447a-43d1-b442-00a195474933" = "OnlineMeetings.Read.All"
    "b8bb2037-6e08-44ac-a4ea-4674e010e2a4" = "OnlineMeetings.ReadWrite"
    "5b567255-7703-4780-807c-7be8301ae99b" = "Group.Read.All"
    "df021288-bdef-4463-88db-98f22de89214" = "User.Read.All"
    "dbb9058a-0e50-45e7-ae91-66909b422a6c" = "Domain.Read.All"
}

foreach ($perm in $currentPermissions) {
    $permName = $permissionNames[$perm.id]
    if (-not $permName) { $permName = $perm.id }
    Write-Host "  • $permName" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "⚠️  These permissions are NOT needed for Terraform deployment" -ForegroundColor Yellow
Write-Host ""
Write-Host "The Terraform azure-ad module uses hard-coded app role IDs" -ForegroundColor Gray
Write-Host "to avoid requiring Directory.Read.All permission on the SPN." -ForegroundColor Gray
Write-Host "See: iac/azure/modules/azure-ad/main.tf (lines 11-37)" -ForegroundColor Gray
Write-Host ""
Write-Host "Terraform SPN only needs:" -ForegroundColor Cyan
Write-Host "  ✅ Azure RBAC: Contributor (manage resources)" -ForegroundColor Gray
Write-Host "  ✅ Azure RBAC: User Access Administrator (assign roles)" -ForegroundColor Gray
Write-Host "  ✅ Azure AD role: Application Administrator (create apps)" -ForegroundColor Gray
Write-Host "  ✅ Azure AD role: Groups Administrator (create groups)" -ForegroundColor Gray
Write-Host "  ❌ Graph API permissions: NONE NEEDED" -ForegroundColor Gray
Write-Host ""

$confirm = Read-Host "Remove ALL Graph API permissions from $spnName? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Operation cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Removing Graph API permissions..." -ForegroundColor Cyan

# Get the resource ID for Microsoft Graph
$graphResourceId = "00000003-0000-0000-c000-000000000000"

# Remove each permission
$removedCount = 0
$failedCount = 0

foreach ($perm in $currentPermissions) {
    $permName = $permissionNames[$perm.id]
    if (-not $permName) { $permName = $perm.id }
    
    Write-Host "  Removing: $permName" -ForegroundColor Gray
    
    try {
        az ad app permission delete `
            --id $spnAppId `
            --api $graphResourceId `
            --permission-id $perm.id 2>$null
        
        Write-Host "    ✅ Removed" -ForegroundColor Green
        $removedCount++
    } catch {
        Write-Host "    ❌ Failed to remove" -ForegroundColor Red
        $failedCount++
    }
}

Write-Host ""
if ($failedCount -eq 0) {
    Write-Host "✅ Successfully removed $removedCount Graph API permission(s)" -ForegroundColor Green
} else {
    Write-Host "⚠️  Removed $removedCount permission(s), failed to remove $failedCount" -ForegroundColor Yellow
}

# Verify no permissions remain
Write-Host ""
Write-Host "Verifying..." -ForegroundColor Cyan
$remainingPermissions = az ad app permission list --id $spnAppId --query "[?resourceAppId=='00000003-0000-0000-c000-000000000000'].resourceAccess[]" -o json | ConvertFrom-Json

if (-not $remainingPermissions -or $remainingPermissions.Count -eq 0) {
    Write-Host "✅ All Graph API permissions removed successfully!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some permissions still remain:" -ForegroundColor Yellow
    foreach ($perm in $remainingPermissions) {
        $permName = $permissionNames[$perm.id]
        if (-not $permName) { $permName = $perm.id }
        Write-Host "  • $permName" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "You may need to remove these manually in Azure Portal:" -ForegroundColor Yellow
    Write-Host "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$spnAppId" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Verify Terraform still works: cd iac && terraform plan" -ForegroundColor Gray
Write-Host "2. The azure-ad module uses hard-coded role IDs, so no Graph API access needed" -ForegroundColor Gray
Write-Host ""
