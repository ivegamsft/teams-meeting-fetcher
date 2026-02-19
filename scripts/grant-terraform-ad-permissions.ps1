# Grant Azure AD read permissions to Terraform Service Principal
# Required for Terraform to query domains and service principals

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Grant Azure AD Permissions to Terraform SPN" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Get SPN from terraform.tfvars
$tfvarsPath = Join-Path $PSScriptRoot "..\iac\azure\terraform.tfvars"
if (-not (Test-Path $tfvarsPath)) {
    Write-Host "[ERROR] terraform.tfvars not found: $tfvarsPath" -ForegroundColor Red
    exit 1
}

$clientId = (Get-Content $tfvarsPath | Select-String 'azure_client_id\s*=\s*"([^"]+)"').Matches.Groups[1].Value

if (-not $clientId) {
    Write-Host "[ERROR] Could not find azure_client_id in terraform.tfvars" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Terraform SPN Client ID: $clientId" -ForegroundColor Cyan
Write-Host ""

# Get the service principal
Write-Host "[INFO] Getting service principal..." -ForegroundColor Cyan
$spn = az ad sp show --id $clientId | ConvertFrom-Json

if (-not $spn) {
    Write-Host "[ERROR] Service principal not found" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Found: $($spn.displayName)" -ForegroundColor Green
Write-Host ""

# Microsoft Graph API ID
$graphApiId = "00000003-0000-0000-c000-000000000000"

# Get Microsoft Graph service principal to find permission IDs
Write-Host "[INFO] Getting Microsoft Graph service principal..." -ForegroundColor Cyan
$graphSp = az ad sp show --id $graphApiId | ConvertFrom-Json

# Find Directory.Read.All permission
$directoryReadAll = $graphSp.appRoles | Where-Object { $_.value -eq "Directory.Read.All" } | Select-Object -First 1

if (-not $directoryReadAll) {
    Write-Host "[ERROR] Could not find Directory.Read.All permission" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Found Directory.Read.All: $($directoryReadAll.id)" -ForegroundColor Green
Write-Host ""

# Check if permission already granted
Write-Host "[INFO] Checking existing permissions..." -ForegroundColor Cyan
$existingPerms = az ad app permission list --id $clientId | ConvertFrom-Json

$hasDirectoryRead = $false
foreach ($perm in $existingPerms) {
    if ($perm.resourceAppId -eq $graphApiId) {
        foreach ($role in $perm.resourceAccess) {
            if ($role.id -eq $directoryReadAll.id) {
                $hasDirectoryRead = $true
                break
            }
        }
    }
}

if ($hasDirectoryRead) {
    Write-Host "[OK] Directory.Read.All already granted" -ForegroundColor Green
} else {
    Write-Host "[INFO] Granting Directory.Read.All permission..." -ForegroundColor Cyan
    
    # Add the permission
    az ad app permission add `
        --id $clientId `
        --api "00000003-0000-0000-c000-000000000000" `
        --api-permissions "$($directoryReadAll.id)=Role" | Out-Null
    
    Write-Host "[OK] Permission added" -ForegroundColor Green
    Write-Host ""
    
    # Grant admin consent
    Write-Host "[INFO] Granting admin consent..." -ForegroundColor Cyan
    az ad app permission grant `
        --id $clientId `
        --api "00000003-0000-0000-c000-000000000000" `
        --scope "Directory.Read.All" | Out-Null
    
    az ad app permission admin-consent --id $clientId | Out-Null
    
    Write-Host "[OK] Admin consent granted" -ForegroundColor Green
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "[DONE] Permissions configured!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Re-run terraform plan in iac/azure" -ForegroundColor Cyan
Write-Host ""
