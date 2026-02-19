#!/usr/bin/env pwsh
#Requires -Version 7.0

<#
.SYNOPSIS
    Grant additional permissions to Terraform Service Principal
    
.DESCRIPTION
    This script grants the necessary Azure AD and RBAC permissions for Terraform to:
    - Create App Registrations
    - Create Security Groups
    - Assign RBAC roles to resources
    
.PARAMETER TenantId
    Azure AD Tenant ID
    
.PARAMETER SubscriptionId
    Azure Subscription ID
    
.PARAMETER ServicePrincipalId
    The Application (Client) ID of the Terraform Service Principal
    
.EXAMPLE
    .\grant-terraform-permissions.ps1
#>

param(
    [Parameter()]
    [string]$TenantId = $env:GRAPH_TENANT_ID,
    
    [Parameter()]
    [string]$SubscriptionId = $env:ARM_SUBSCRIPTION_ID,
    
    [Parameter()]
    [string]$ServicePrincipalId = $env:ARM_CLIENT_ID
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info { Write-Host "ℹ️  $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "✅ $args" -ForegroundColor Green }
function Write-Warning { Write-Host "⚠️  $args" -ForegroundColor Yellow }
function Write-Failure { Write-Host "❌ $args" -ForegroundColor Red }

Write-Host "`n=== Grant Terraform Service Principal Permissions ===" -ForegroundColor Cyan

# Validate parameters
if (-not $TenantId) {
    Write-Failure "TenantId is required. Set GRAPH_TENANT_ID environment variable or provide -TenantId parameter."
    exit 1
}

if (-not $SubscriptionId) {
    Write-Failure "SubscriptionId is required. Set ARM_SUBSCRIPTION_ID environment variable or provide -SubscriptionId parameter."
    exit 1
}

if (-not $ServicePrincipalId) {
    Write-Failure "ServicePrincipalId is required. Set ARM_CLIENT_ID environment variable or provide -ServicePrincipalId parameter."
    exit 1
}

Write-Info "Tenant ID: $TenantId"
Write-Info "Subscription ID: $SubscriptionId"
Write-Info "Service Principal ID: $ServicePrincipalId"

# Check if logged in to Azure CLI
Write-Info "Checking Azure CLI login status..."
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Warning "Not logged in to Azure CLI. Logging in..."
    az login --tenant $TenantId
    az account set -s $SubscriptionId
} else {
    if ($account.tenantId -ne $TenantId) {
        Write-Warning "Logged into wrong tenant. Switching to $TenantId..."
        az login --tenant $TenantId
    }
    if ($account.id -ne $SubscriptionId) {
        Write-Info "Setting subscription to $SubscriptionId..."
        az account set -s $SubscriptionId
    }
}

Write-Success "Logged in to tenant: $TenantId"

# Validate current user has required permissions
Write-Host "`n=== Validating Your Permissions ===" -ForegroundColor Cyan

$currentUserId = az ad signed-in-user show --query id -o tsv 2>$null
if (-not $currentUserId) {
    Write-Warning "Unable to validate user permissions - proceeding anyway"
} else {
    # Check for required directory roles
    $privilegedRoleAdminId = "e8611ab8-c189-46e8-94e1-60213ab1f814"
    $globalAdminId = "62e90394-69f5-4237-9190-012177145e10"

    $userRoles = az rest --method GET --uri "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments?`$filter=principalId eq '$currentUserId'&`$expand=roleDefinition" --query "value[].roleDefinition.id" -o tsv 2>$null

    $hasPrivilegedRoleAdmin = $userRoles -contains $privilegedRoleAdminId
    $hasGlobalAdmin = $userRoles -contains $globalAdminId

    if ($hasGlobalAdmin) {
        Write-Success "You have Global Administrator role"
    } elseif ($hasPrivilegedRoleAdmin) {
        Write-Success "You have Privileged Role Administrator role"
    } else {
        Write-Warning "You may not have sufficient permissions to grant directory roles"
        Write-Host "Required: Global Administrator or Privileged Role Administrator" -ForegroundColor Gray
        Write-Host "Some operations may fail if you don't have these roles" -ForegroundColor Gray
    }
}

# Get the Service Principal object
Write-Info "Getting Service Principal object..."
$spObject = az ad sp show --id $ServicePrincipalId --query "id" -o tsv
if (-not $spObject -or $LASTEXITCODE -ne 0) {
    Write-Failure "Service Principal not found: $ServicePrincipalId"
    exit 1
}
$spObjectId = $spObject
Write-Success "Service Principal Object ID: $spObjectId"

#============================================================================
# PHASE 1: Grant Azure AD Directory Roles
#============================================================================

Write-Host "`n=== Phase 1: Azure AD Directory Roles ===" -ForegroundColor Cyan

# Role 1: Application Administrator (to create App Registrations)
Write-Info "Granting Application Administrator role..."
$appAdminRoleId = "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3"
$appAdminBody = @{
    principalId = $spObjectId
    roleDefinitionId = $appAdminRoleId
    directoryScopeId = "/"
} | ConvertTo-Json -Compress

$tempFile = [System.IO.Path]::GetTempFileName()
$appAdminBody | Out-File -FilePath $tempFile -Encoding utf8
$appAdminAssignment = az rest --method POST --uri "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments" `
    --headers "Content-Type=application/json" `
    --body "@$tempFile" 2>&1
Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -eq 0) {
    Write-Success "Application Administrator role granted"
} else {
    if ($appAdminAssignment -match "already exists") {
        Write-Success "Application Administrator role already assigned"
    } else {
        Write-Warning "Failed to grant Application Administrator role: $appAdminAssignment"
    }
}

# Role 2: Groups Administrator (to create Security Groups)
Write-Info "Granting Groups Administrator role..."
$groupsAdminRoleId = "fdd7a751-b60b-444a-984c-02652fe8fa1c"
$groupsAdminBody = @{
    principalId = $spObjectId
    roleDefinitionId = $groupsAdminRoleId
    directoryScopeId = "/"
} | ConvertTo-Json -Compress

$tempFile = [System.IO.Path]::GetTempFileName()
$groupsAdminBody | Out-File -FilePath $tempFile -Encoding utf8
$groupsAdminAssignment = az rest --method POST --uri "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments" `
    --headers "Content-Type=application/json" `
    --body "@$tempFile" 2>&1
Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -eq 0) {
    Write-Success "Groups Administrator role granted"
} else {
    if ($groupsAdminAssignment -match "already exists") {
        Write-Success "Groups Administrator role already assigned"
    } else {
        Write-Warning "Failed to grant Groups Administrator role: $groupsAdminAssignment"
    }
}

#============================================================================
# PHASE 2: Grant Azure RBAC Roles
#============================================================================

Write-Host "`n=== Phase 2: Azure RBAC Roles ===" -ForegroundColor Cyan

# Get current role assignments
Write-Info "Checking current role assignments..."
$roleAssignments = az role assignment list --assignee $ServicePrincipalId --scope "/subscriptions/$SubscriptionId" | ConvertFrom-Json

$hasContributor = $roleAssignments | Where-Object { $_.roleDefinitionName -eq "Contributor" }
$hasUserAccessAdmin = $roleAssignments | Where-Object { $_.roleDefinitionName -eq "User Access Administrator" }

if ($hasContributor) {
    Write-Success "Contributor role already assigned"
} else {
    Write-Info "Granting Contributor role..."
    az role assignment create --assignee $ServicePrincipalId --role "Contributor" --scope "/subscriptions/$SubscriptionId"
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Contributor role granted"
    } else {
        Write-Warning "Failed to grant Contributor role"
    }
}

if ($hasUserAccessAdmin) {
    Write-Success "User Access Administrator role already assigned"
} else {
    Write-Info "Granting User Access Administrator role..."
    az role assignment create --assignee $ServicePrincipalId --role "User Access Administrator" --scope "/subscriptions/$SubscriptionId"
    if ($LASTEXITCODE -eq 0) {
        Write-Success "User Access Administrator role granted"
    } else {
        Write-Warning "Failed to grant User Access Administrator role"
    }
}

#============================================================================
# SUMMARY
#============================================================================

Write-Host "`n=== Summary ===" -ForegroundColor Cyan

Write-Info "Permissions granted to Service Principal: $ServicePrincipalId"
Write-Host ""
Write-Host "Azure AD Directory Roles:" -ForegroundColor Yellow
Write-Host "  ✅ Application Administrator    - Create App Registrations" -ForegroundColor Green
Write-Host "  ✅ Groups Administrator          - Create Security Groups" -ForegroundColor Green
Write-Host ""
Write-Host "Azure RBAC Roles (Subscription):" -ForegroundColor Yellow
Write-Host "  ✅ Contributor                   - Manage Azure resources" -ForegroundColor Green
Write-Host "  ✅ User Access Administrator     - Assign RBAC roles" -ForegroundColor Green
Write-Host ""

Write-Warning "IMPORTANT: Permission changes may take 15-30 minutes to propagate."
Write-Warning "Wait at least 30 minutes before retrying Terraform deployment."
Write-Host ""
Write-Info "After waiting, retry deployment with:"
Write-Host "  cd infra" -ForegroundColor Gray
Write-Host "  terraform plan -out=tfplan" -ForegroundColor Gray
Write-Host "  terraform apply tfplan" -ForegroundColor Gray
Write-Host ""
