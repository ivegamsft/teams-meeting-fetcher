#!/usr/bin/env pwsh
<#
.SYNOPSIS
FALLBACK/BOOTSTRAP: Grant admin consent for Graph API permissions to Teams Meeting Fetcher app.

.DESCRIPTION
*** CANONICAL SOURCE OF TRUTH FOR PERMISSIONS IS TERRAFORM ***
See: iac/azure/modules/azure-ad/main.tf (azuread_app_role_assignment resources)

This script exists ONLY as a fallback for initial bootstrap before Terraform
is fully configured, or for emergency manual recovery. In normal operations,
`terraform apply` manages both permission declarations AND admin consent grants.

Do NOT use this script for routine permission changes — update Terraform instead.

.PARAMETER AppId
The application ID (client ID) of the Teams Meeting Fetcher app in Azure AD.

.PARAMETER TenantId
The Azure AD tenant ID.

.EXAMPLE
./grant-graph-permissions.ps1 -AppId "1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8" -TenantId "62837751-4e48-4d06-8bcb-57be1a669b78"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$AppId,
    
    [Parameter(Mandatory = $true)]
    [string]$TenantId
)

# Microsoft Graph service principal client ID (standard, don't change)
$graphSpn = "00000003-0000-0000-c000-000000000000"

# Permission IDs from Microsoft Graph
# NOTE: Subscription.ReadWrite.All removed — not a valid Graph application permission
# (only exists as delegated Subscription.Read.All). Graph subscriptions require the
# resource-specific permission instead (e.g., Calendars.Read).
$permissions = @{
    "Calendars.Read"                     = "798ee544-9d2d-430c-a058-570e29e34338"
    "Group.Read.All"                     = "5b567255-7703-4780-807c-7be8301ae99b"
    "User.Read.All"                      = "df021288-bdef-4463-88db-98f22de89214"
    "OnlineMeetings.Read.All"            = "c1684f21-1984-47fa-9d61-2dc8c296bb70"
    "OnlineMeetingTranscript.Read.All"   = "a4a80d8d-d283-4bd8-8504-555ec3870630"
    "OnlineMeetingRecording.Read.All"    = "a4a08342-c95d-476b-b943-97e100569c8d"
    "CallRecords.Read.All"               = "45bbb07e-7321-4fd7-a8f6-3ff27e6a81c8"
}

Write-Host "🔐 Granting Graph API permissions for app: $AppId`n" -ForegroundColor Cyan

# Authenticate to Azure AD
Write-Host "🔑 Authenticating to Azure AD tenant: $TenantId" -ForegroundColor Yellow
Connect-AzureAD -TenantId $TenantId -ErrorAction Stop | Out-Null
Write-Host "✅ Authenticated`n" -ForegroundColor Green

# Get the app service principal
Write-Host "🔍 Finding app service principal..." -ForegroundColor Yellow
$appSp = Get-AzureADServicePrincipal -Filter "appId eq '$AppId'" -ErrorAction Stop
if (-not $appSp) {
    Write-Host "❌ App service principal not found" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Found: $($appSp.DisplayName)`n" -ForegroundColor Green

# Get Graph service principal
Write-Host "🔍 Finding Microsoft Graph service principal..." -ForegroundColor Yellow
$graphSp = Get-AzureADServicePrincipal -Filter "appId eq '$graphSpn'" -ErrorAction Stop
if (-not $graphSp) {
    Write-Host "❌ Graph service principal not found" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Found: Microsoft Graph`n" -ForegroundColor Green

# Grant permissions
Write-Host "📝 Granting permissions:" -ForegroundColor Yellow
$permissionsGranted = 0

foreach ($permName in $permissions.Keys) {
    $permId = $permissions[$permName]
    
    try {
        # Create app role assignment
        New-AzureADServiceAppRoleAssignment -ObjectId $appSp.ObjectId `
            -PrincipalId $appSp.ObjectId `
            -ResourceId $graphSp.ObjectId `
            -Id $permId | Out-Null
        
        Write-Host "  ✅ $permName" -ForegroundColor Green
        $permissionsGranted++
    }
    catch {
        if ($_.Exception.Message -Contains "already exists") {
            Write-Host "  ⏭️  $permName (already granted)" -ForegroundColor Gray
            $permissionsGranted++
        }
        else {
            Write-Host "  ⚠️  $permName - Error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n✅ Permission grant complete: $permissionsGranted/$($permissions.Count) permissions`n" -ForegroundColor Green

Write-Host "📌 IMPORTANT:" -ForegroundColor Cyan
Write-Host "  - Permissions have been granted for admin consent"
Write-Host "  - You can now create Graph API subscriptions"
Write-Host "  - Run the subscribe script to create the calendar change subscription"
Write-Host "  - Command: npm run subscribe (in nobots-eventhub directory)"
