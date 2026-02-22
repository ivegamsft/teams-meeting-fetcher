# Azure Service Principal Security Guidelines

## Overview

This document explains the **correct and minimal** permissions required for the Terraform deployment Service Principal (`tmf-terraform-deploy-spn`), how they were hardened, and why certain Graph API permissions are NOT needed.

## ⚠️ CRITICAL: Never Hardcode Secrets or Resource IDs

**All scripts and documentation MUST follow these security practices:**

### ✅ DO: Use Dynamic Configuration

```powershell
# Load from Terraform outputs (preferred)
$botAppId = (terraform output -json | ConvertFrom-Json).azure_bot_app_id.value

# Load from environment variables
$botAppId = $env:BOT_APP_ID
$tenantId = $env:GRAPH_TENANT_ID

# Accept as parameters
param(
    [Parameter(Mandatory=$false)]
    [string]$BotAppId
)
```

### ❌ DON'T: Hardcode Values

```powershell
# NEVER DO THIS - Exposes infrastructure details
$botAppId = "330412bb-4f99-40b7-b270-24ad440a2746"
$tenantId = "62837751-4e48-4d06-8bcb-57be1a669b78"
$clientSecret = "Cql8Q~..."  # NEVER EVER DO THIS
```

### Script Configuration Priority

All scripts should check for configuration in this order:

1. **Parameters** (highest priority) - Explicit override: `-BotAppId "..."`
2. **Environment variables** - Runtime configuration: `$env:BOT_APP_ID`
3. **Terraform outputs** - Automatic from IaC: `terraform output azure_bot_app_id`
4. **Error if not found** - Never use hardcoded defaults

### Why This Matters

- **Security**: Hardcoded IDs in git history can aid attackers in reconnaissance
- **Portability**: Scripts work across different tenants/environments
- **Auditing**: Clear source of truth for configuration values
- **Compliance**: Meets security scanning and secret detection requirements

See scripts in [`scripts/setup/`](../scripts/setup/) for reference implementations.

---

## Security Hardening Summary

**Date**: February 19, 2026  
**Changes**: Removed all Graph API permissions from Terraform deployment SPN

### Before Security Hardening

The Terraform SPN (`tmf-terraform-deploy-spn`) was created with **9 Graph API permissions**:

1. ❌ Application.ReadWrite.All
2. ❌ AppCatalog.ReadWrite.All
3. ❌ **Calendars.Read** ← Completely unnecessary
4. ❌ OnlineMeetings.Read.All
5. ❌ OnlineMeetings.ReadWrite
6. ❌ Group.Read.All
7. ❌ User.Read.All
8. ❌ Domain.Read.All
9. ❌ **Directory.Read.All** ← Was needed, now eliminated via hard-coded GUIDs

**Problem**: Terraform SPN had read access to calendars, transcripts, and directory data it never uses. This violates the principle of least privilege.

### After Security Hardening

The Terraform SPN now has **ZERO Graph API permissions**:

- ✅ Azure RBAC: **Contributor** (create/modify Azure resources)
- ✅ Azure RBAC: **User Access Administrator** (assign RBAC roles)
- ✅ Azure AD role: **Application Administrator** (create App Registrations)
- ✅ Azure AD role: **Groups Administrator** (create Security Groups)
- ✅ Graph API permissions: **NONE** ✅

## Why No Graph API Permissions?

### The Problem We Solved

Previously, the Terraform `azuread` provider needed `Directory.Read.All` permission to query the Microsoft Graph service principal object to get app role IDs (GUIDs) for permissions like `OnlineMeetings.ReadWrite.All`.

This required granting the Terraform SPN broad read access to the entire directory, which is a security risk.

### The Solution: Hard-Coded App Role IDs

We eliminated the need for `Directory.Read.All` by **hard-coding the Microsoft Graph app role GUIDs** directly in the Terraform module.

**File**: [iac/azure/modules/azure-ad/main.tf](../../iac/azure/modules/azure-ad/main.tf) (lines 11-37)

```hcl
locals {
  # Microsoft Graph API app role IDs (hard-coded to avoid requiring Directory.Read.All)
  # These are stable GUIDs that are the same across all Azure AD tenants
  graph_app_role_ids = {
    "OnlineMeetings.ReadWrite.All"         = "b8bb2037-6e08-44ac-a4ea-4674e010e2a4"
    "OnlineMeetingTranscript.Read.All"     = "a4a80d8d-0849-410b-b711-e25bb11ba43d"
    "OnlineMeetingRecording.Read.All"      = "a4a08342-1043-4ca2-8a54-4837bc001b64"
    "Calls.JoinGroupCall.All"              = "f6b49018-60ab-4f81-83bd-22caeabfed2d"
    "Calls.Initiate.All"                   = "284383ee-7f6e-4e40-a2a8-e85dcb029101"
    "Group.Read.All"                       = "5b567255-7703-4780-807c-7be8301ae99b"
    "User.Read.All"                        = "df021288-bdef-4463-88db-98f22de89214"
    "EventListener.Read.All"               = "0a8eba0d-0c41-4cc8-b060-b01346e0f8d6"
  }

  # Bot app uses 7 permissions (will be reduced to 5 in security hardening)
  bot_graph_app_role_ids = [
    local.graph_app_role_ids["OnlineMeetings.ReadWrite.All"],
    local.graph_app_role_ids["OnlineMeetingTranscript.Read.All"],
    local.graph_app_role_ids["OnlineMeetingRecording.Read.All"],
    local.graph_app_role_ids["Calls.JoinGroupCall.All"],          # Remove (not needed yet)
    local.graph_app_role_ids["Calls.Initiate.All"],               # Remove (not needed yet)
    local.graph_app_role_ids["Group.Read.All"],
    local.graph_app_role_ids["User.Read.All"],
  ]
}
```

**Key Insight**: Microsoft Graph app role IDs are **globally consistent** across all Azure AD tenants. This means we can hard-code them safely without needing to query the Graph API at runtime.

### Benefits of This Approach

1. ✅ **Zero Graph API permissions** needed on Terraform SPN
2. ✅ **Reduced attack surface** - SPN cannot read calendars, meetings, transcripts, or directory data
3. ✅ **Simpler bootstrap** - No admin consent required for Graph permissions
4. ✅ **Faster execution** - No runtime API calls to discover role IDs
5. ✅ **Clearer intent** - Explicitly states which permissions are used where

## Bot Application Security Hardening

The Teams Meeting Fetcher Bot (`tmf_bot_app`) was also hardened during this security review.

### Before Security Hardening

The Bot app had **7 Graph API permissions**:

1. ✅ OnlineMeetings.ReadWrite.All - Create meetings, enable recording
2. ✅ OnlineMeetingTranscript.Read.All - Download transcripts
3. ✅ OnlineMeetingRecording.Read.All - Download recordings
4. ❌ **Calls.JoinGroupCall.All** - For future auto-join functionality (not yet implemented)
5. ❌ **Calls.Initiate.All** - For future call initiation (not yet implemented)
6. ✅ Group.Read.All - Validate group membership for allow-list
7. ✅ User.Read.All - Read user profiles for webhook validation

### After Security Hardening

The Bot app now has **5 Graph API permissions** (removed 2 future-use permissions):

1. ✅ **OnlineMeetings.ReadWrite.All** - Create meetings, enable recording _(required)_
2. ✅ **OnlineMeetingTranscript.Read.All** - Download transcripts _(required)_
3. ✅ **OnlineMeetingRecording.Read.All** - Download recordings _(required)_
4. ✅ **Group.Read.All** - Validate group membership _(user confirmed needed)_
5. ✅ **User.Read.All** - Read user profiles _(user confirmed needed)_

**Removed permissions** (will be added back when needed):

- ❌ Calls.JoinGroupCall.All - Auto-join meetings (future functionality)
- ❌ Calls.Initiate.All - Initiate calls (future functionality)

**Rationale**: Only grant permissions for features that are currently implemented, not for future functionality.

## Correct Permission Model

### Terraform Deployment SPN (`tmf-terraform-deploy-spn`)

**Purpose**: Deploy and manage Azure infrastructure via Terraform

**Required Permissions**:

| Permission Type         | Role/Permission           | Scope        | Purpose                                                            |
| ----------------------- | ------------------------- | ------------ | ------------------------------------------------------------------ |
| Azure RBAC              | Contributor               | Subscription | Create/modify Azure resources (VMs, storage, networking, etc.)     |
| Azure RBAC              | User Access Administrator | Subscription | Assign RBAC roles to resources (e.g., grant Bot access to storage) |
| Azure AD Directory Role | Application Administrator | Tenant       | Create and manage App Registrations, Service Principals            |
| Azure AD Directory Role | Groups Administrator      | Tenant       | Create and manage Azure AD Security Groups                         |
| **Graph API**           | **NONE**                  | **N/A**      | **Not needed (uses hard-coded role IDs)**                          |

### Bot Application (`tmf_bot_app`)

**Purpose**: Join Teams meetings, enable recording, download transcripts/recordings

**Required Permissions**:

| Permission                       | Type        | Purpose                            |
| -------------------------------- | ----------- | ---------------------------------- |
| OnlineMeetings.ReadWrite.All     | Application | Create meetings, enable recording  |
| OnlineMeetingTranscript.Read.All | Application | Download transcripts after meeting |
| OnlineMeetingRecording.Read.All  | Application | Download recordings after meeting  |
| Group.Read.All                   | Application | Validate user is in allowed group  |
| User.Read.All                    | Application | Read user profile information      |

**Admin consent required**: Yes (after any permission change)

### Lambda EventHub Consumer (`tmf_lambda_app`)

**Purpose**: Read events from Azure Event Hub (notification delivery)

**Required Permissions**:

| Permission Type | Role/Permission                | Scope               | Purpose                         |
| --------------- | ------------------------------ | ------------------- | ------------------------------- |
| Azure RBAC      | Azure Event Hubs Data Receiver | Event Hub Namespace | Read messages from Event Hub    |
| Graph API       | NONE                           | N/A                 | Not needed (read-only consumer) |

## Applying Security Hardening

### For Existing Deployments

If you already have a Terraform SPN with excessive Graph API permissions, follow these steps:

#### 1. Remove Graph API Permissions from Terraform SPN

```powershell
# Run cleanup script
.\scripts\setup\remove-terraform-spn-graph-permissions.ps1
```

This script will:

- ✅ Find tmf-terraform-deploy-spn
- ✅ List current Graph API permissions
- ✅ Remove ALL Graph API permissions
- ✅ Verify permissions were removed successfully

#### 2. Re-grant Admin Consent for Bot App

```powershell
# Re-grant consent for Bot's reduced permissions
.\scripts\setup\regrant-bot-app-consent.ps1
```

This script will:

- ✅ Find Teams Meeting Fetcher Bot
- ✅ Verify 5 permissions are configured (OnlineMeetings, Transcript, Recording, Group, User)
- ✅ Grant admin consent for reduced permission set
- ✅ Verify consent was granted successfully

#### 3. Verify Terraform Still Works

```powershell
cd iac
terraform plan
```

Expected result: Plan succeeds without errors (azure-ad module uses hard-coded role IDs)

### For New Deployments

The bootstrap script has been updated to NOT add Graph API permissions:

```powershell
# Run updated bootstrap script
.\scripts\setup\bootstrap-azure-spn.ps1
```

The updated script:

- ✅ Creates tmf-terraform-deploy-spn
- ✅ Assigns Azure RBAC roles: Contributor, User Access Administrator
- ✅ Assigns Azure AD roles: Application Administrator, Groups Administrator
- ✅ **Skips Graph API permissions** (not needed)
- ✅ Displays warning explaining why Graph API is skipped

## Troubleshooting

### "Insufficient privileges to complete the operation"

If Terraform fails with this error after removing Graph API permissions:

1. **Verify hard-coded role IDs** are present in [iac/azure/modules/azure-ad/main.tf](../../iac/azure/modules/azure-ad/main.tf) (lines 11-37)
2. **Check Azure AD roles** are assigned: Application Administrator, Groups Administrator
3. **Verify RBAC roles** are assigned: Contributor, User Access Administrator
4. **Wait 5-10 minutes** for Azure AD role propagation

### "Bot cannot create meetings"

If Bot fails to create meetings after security hardening:

1. **Re-grant admin consent**: Run `.\scripts\setup\regrant-bot-app-consent.ps1`
2. **Verify 5 permissions** are present in Azure Portal:
   - Go to: App registrations → Teams Meeting Fetcher Bot → API permissions
   - Should see: 5 Microsoft Graph permissions with green checkmarks
3. **Wait 5 minutes** for permission propagation
4. **Test Bot**: Run `python scripts/graph/03-create-test-meeting.py`

### "Directory.Read.All is required"

If you see this error, it means the azure-ad module is NOT using hard-coded role IDs:

1. **Check Terraform version**: Must be using updated module
2. **Pull latest code**: `git pull origin main`
3. **Verify locals block** exists in [iac/azure/modules/azure-ad/main.tf](../../iac/azure/modules/azure-ad/main.tf)
4. **Re-run terraform**: `cd iac && terraform init && terraform plan`

## References

- [Microsoft Graph Application Permissions](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Azure RBAC Built-in Roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles)
- [Azure AD Built-in Roles](https://learn.microsoft.com/en-us/azure/active-directory/roles/permissions-reference)
- [Principle of Least Privilege](https://en.wikipedia.org/wiki/Principle_of_least_privilege)

## Change Log

| Date       | Change                                                 | Reason                                            |
| ---------- | ------------------------------------------------------ | ------------------------------------------------- |
| 2026-02-19 | Removed all Graph API permissions from Terraform SPN   | Unnecessary permissions, security hardening       |
| 2026-02-19 | Added hard-coded app role IDs to azure-ad module       | Eliminate Directory.Read.All requirement          |
| 2026-02-19 | Reduced Bot permissions from 7 to 5                    | Remove future-use permissions not yet implemented |
| 2026-02-19 | Updated bootstrap script to skip Graph API permissions | Automate correct permission setup                 |
| 2026-02-19 | Created cleanup scripts for existing deployments       | Enable security hardening on live systems         |
