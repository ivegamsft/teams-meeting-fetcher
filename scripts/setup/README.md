# Setup Scripts

Automation scripts for bootstrapping the Teams Meeting Fetcher infrastructure and cleaning up excessive permissions.

## Bootstrap Scripts (Initial Setup)

Use these scripts when setting up the project for the first time or creating new service principals.

### `bootstrap-azure-spn.ps1` / `bootstrap-azure-spn.sh`

Creates the Terraform deployment Service Principal (`tmf-terraform-deploy-spn`) with correct permissions.

**Usage**:

```powershell
# PowerShell (Windows/Linux/macOS)
.\scripts\setup\bootstrap-azure-spn.ps1

# Bash (Linux/macOS)
./scripts/setup/bootstrap-azure-spn.sh
```

**What it does**:

1. ✅ Creates `tmf-terraform-deploy-spn` Service Principal
2. ✅ Assigns Azure RBAC roles:
   - Contributor (manage Azure resources)
   - User Access Administrator (assign RBAC roles)
3. ✅ Assigns Azure AD directory roles:
   - Application Administrator (create App Registrations)
   - Groups Administrator (create Security Groups)
4. ✅ **Skips Graph API permissions** (not needed - uses hard-coded role IDs)
5. ✅ Optionally writes credentials to `iac/terraform.tfvars`

**Prerequisites**:

- Azure CLI logged in (`az login`)
- Privileged Role Administrator or Global Administrator role
- Contributor role on target subscription

**Security Note**: As of Feb 2026, this script no longer adds Graph API permissions to the Terraform SPN. The azure-ad Terraform module uses hard-coded app role IDs to eliminate the need for Directory.Read.All permission. See [AZURE_SPN_SECURITY.md](../../docs/AZURE_SPN_SECURITY.md) for details.

---

## Security Cleanup Scripts (Existing Deployments)

Use these scripts to fix existing service principals that were created with excessive permissions.

### `remove-terraform-spn-graph-permissions.ps1`

Removes unnecessary Graph API permissions from existing Terraform deployment SPN.

**Usage**:

```powershell
# Default SPN name (tmf-terraform-deploy-spn)
.\scripts\setup\remove-terraform-spn-graph-permissions.ps1

# Custom SPN name
.\scripts\setup\remove-terraform-spn-graph-permissions.ps1 -SpnName "my-custom-spn"

# With environment variable
$env:TERRAFORM_SPN_NAME = "my-custom-spn"
.\scripts\setup\remove-terraform-spn-graph-permissions.ps1
```

**What it does**:

1. ✅ Finds `tmf-terraform-deploy-spn` by name
2. ✅ Lists current Graph API permissions
3. ✅ Removes ALL Graph API permissions:
   - Calendars.Read
   - Directory.Read.All
   - OnlineMeetingTranscript.Read.All
   - Application.ReadWrite.All
   - AppCatalog.ReadWrite.All
   - OnlineMeetings.Read.All
   - OnlineMeetings.ReadWrite
   - Group.Read.All
   - User.Read.All
   - Domain.Read.All
4. ✅ Verifies permissions were removed
5. ✅ Confirms Terraform still works without Graph API access

**When to use**:

- You have an existing Terraform SPN with Graph API permissions
- You want to apply the Feb 2026 security hardening
- You're following the principle of least privilege

**Prerequisites**:

- Azure CLI logged in (`az login`)
- Permissions to modify app registrations (Application Administrator or higher)

**After running**: Test Terraform deployment with `cd iac && terraform plan` to confirm it still works.

---

### `regrant-bot-app-consent.ps1`

Re-grants admin consent for the Teams Meeting Fetcher Bot after permission changes.

**Usage**:

```powershell
# Automatic (loads from Terraform outputs)
.\scripts\setup\regrant-bot-app-consent.ps1

# With explicit App ID
.\scripts\setup\regrant-bot-app-consent.ps1 -BotAppId "a77b8ed1-1ff5-4bcb-bd9b-e4901de03cf4"

# With environment variable
$env:BOT_APP_ID = "a77b8ed1-1ff5-4bcb-bd9b-e4901de03cf4"
.\scripts\setup\regrant-bot-app-consent.ps1
```

**What it does**:

1. ✅ Finds `Teams Meeting Fetcher Bot` by App ID (from Terraform outputs, env var, or parameter)
2. ✅ Verifies 5 Graph API permissions are configured:
   - OnlineMeetings.ReadWrite.All
   - OnlineMeetingTranscript.Read.All
   - OnlineMeetingRecording.Read.All
   - Group.Read.All
   - User.Read.All
3. ✅ Grants admin consent for these permissions
4. ✅ Verifies consent was granted successfully

**Bot App ID Sources** (checked in order):

1. `-BotAppId` parameter (highest priority)
2. `$env:BOT_APP_ID` or `$env:AZURE_BOT_APP_ID` environment variables
3. Terraform output `azure_bot_app_id` from `iac/` directory (automatic)

**When to use**:

- After running `terraform apply` that modifies Bot app permissions
- After security hardening (reduced from 7 to 5 permissions)
- When Bot fails with "consent_required" or "forbidden" errors

**Prerequisites**:

- Azure CLI logged in (`az login`)
- Global Administrator or Cloud Application Administrator role (to grant admin consent)

**After running**: Test Bot functionality with `python scripts/graph/03-create-test-meeting.py`

---

## GitHub OIDC Bootstrap (Recommended)

### `bootstrap-github-oidc.ps1` / `bootstrap-github-oidc.sh`

**RECOMMENDED**: Sets up secure OpenID Connect (OIDC) authentication for GitHub Actions without storing long-lived credentials in secrets.

**Usage**:

```powershell
# PowerShell - Setup both Azure and AWS OIDC
.\scripts\setup\bootstrap-github-oidc.ps1

# PowerShell - Azure OIDC only
.\scripts\setup\bootstrap-github-oidc.ps1 -AzureOnly

# PowerShell - AWS OIDC only
.\scripts\setup\bootstrap-github-oidc.ps1 -AwsOnly

# Bash - Setup both
bash scripts/setup/bootstrap-github-oidc.sh

# Bash - Custom repository
bash scripts/setup/bootstrap-github-oidc.sh --repository myorg/myrepo
```

**What it does**:

**Azure OIDC**:

- Creates Service Principal: `tmf-github-actions-oidc`
- Creates federated credential for GitHub (main branch)
- Assigns Azure RBAC roles: Contributor, User Access Administrator
- Outputs secrets to configure in GitHub

**AWS OIDC**:

- Creates OpenID Connect provider from GitHub
- Creates IAM role: `github-actions-oidc-role`
- Sets up trust policy for your GitHub repository
- Attaches policies for Lambda and infrastructure deployment

**Security Benefits** ✅:

- No long-lived credentials stored in GitHub
- Short-lived tokens (expire after workflow completes)
- Each workflow run gets a unique token
- Full audit trail in AWS CloudTrail and Azure logs
- Easier credential rotation (no manual secret updates)

**Prerequisites**:

- GitHub CLI (`gh --version`)
- Azure CLI (for Azure: `az login`)
- AWS CLI (for AWS: `aws configure`)
- GitHub repo admin rights

**After running**:

```bash
# Add secrets to GitHub (commands printed by script)
gh secret set AZURE_CLIENT_ID --body '<value>'
gh secret set AZURE_SUBSCRIPTION_ID --body '<value>'
gh secret set AWS_ROLE_ARN --body '<value>'

# Workflows automatically use OIDC (see: .github/workflows/*.yml)
# Test with: gh workflow run test-and-lint.yml
```

**Benefits over legacy approach**:
| Feature | OIDC | Legacy (IAM User) | Legacy (SPN) |
|---------|------|-------------------|--------------|
| Credentials expire | ✅ Per run | ✗ Until rotated | ✗ Until rotated |
| Audit trail | ✅ Full | ⚠️ Limited | ⚠️ Limited |
| Rotation needed | ✅ Never | ✗ Yearly | ✗ Yearly |
| Attack surface | ✅ Minimal | ✗ Large | ✗ Large |
| Compliance ready | ✅ Yes | ⚠️ For dev | ⚠️ For dev |

**Documentation**:

- Azure Workload Identity: https://learn.microsoft.com/entra/workload-id/
- AWS OIDC: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html
- GitHub OIDC: https://docs.github.com/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect

---

## Legacy GitHub Scripts

**Note**: The scripts below use long-lived credentials. Use **`bootstrap-github-oidc.ps1`** instead for better security.

### `setup-github-azure-spn.ps1` / `setup-github-azure-spn.sh`

**DEPRECATED**: Creates Service Principal with long-lived credentials. Use OIDC approach above.

**Usage**:

```powershell
# PowerShell
.\scripts\setup\setup-github-azure-spn.ps1

# Bash
./scripts/setup/setup-github-azure-spn.sh
```

**Prerequisites**:

- GitHub CLI installed (`gh --version`)
- Azure CLI logged in (`az login`)
- GitHub repo admin rights

---

### `setup-github-aws-iam.ps1` / `setup-github-aws-iam.sh`

**DEPRECATED**: Creates IAM user with long-lived credentials. Use OIDC approach above.

**Usage**:

```powershell
# PowerShell
.\scripts\setup\setup-github-aws-iam.ps1

# Bash
./scripts/setup/setup-github-aws-iam.sh
```

**Prerequisites**:

- AWS CLI installed (`aws --version`)
- AWS administrator access
- GitHub repo admin rights

---

## Teams Policy Scripts

### `setup-teams-policies.ps1`

Configures Microsoft Teams policies to allow the Bot to join meetings and enable transcription.

**Usage**:

```powershell
.\scripts\setup\setup-teams-policies.ps1
```

**Prerequisites**:

- Teams administrator role
- MicrosoftTeams PowerShell module installed

---

## Recommended Setup Sequence

### For New Deployments

1. **Bootstrap Azure SPN** (5 min):

   ```powershell
   .\scripts\setup\bootstrap-azure-spn.ps1
   ```

2. **Wait 5-10 minutes** for Azure AD permission propagation

3. **Deploy infrastructure** (10 min):

   ```powershell
   cd iac
   terraform init
   terraform plan -out=tfplan
   terraform apply tfplan
   ```

4. **Re-grant Bot app consent** (2 min):

   ```powershell
   .\scripts\setup\regrant-bot-app-consent.ps1
   ```

5. **Configure Teams policies** (5 min):

   ```powershell
   .\scripts\setup\setup-teams-policies.ps1
   ```

6. **Setup GitHub workflows** (optional, 5 min):

   ```powershell
   .\scripts\setup\setup-github-azure-spn.ps1
   .\scripts\setup\setup-github-aws-iam.ps1
   ```

### For Existing Deployments (Security Hardening)

If you have an existing deployment created before Feb 2026, apply security hardening:

1. **Remove Terraform SPN Graph permissions** (2 min):

   ```powershell
   .\scripts\setup\remove-terraform-spn-graph-permissions.ps1
   ```

2. **Verify Terraform still works** (2 min):

   ```powershell
   cd iac
   terraform plan
   ```

3. **Re-grant Bot app consent** (2 min):

   ```powershell
   .\scripts\setup\regrant-bot-app-consent.ps1
   ```

4. **Test Bot functionality** (5 min):

   ```powershell
   python scripts/graph/03-create-test-meeting.py
   python scripts/graph/04-poll-transcription.py
   ```

---

## Security Best Practices

### Principle of Least Privilege

All scripts follow the principle of least privilege:

- ✅ **Terraform SPN**: Only Azure RBAC + Azure AD roles, **NO Graph API permissions**
- ✅ **Bot app**: Only 5 Graph API permissions needed for current functionality
- ✅ **Lambda app**: Read-only access to Event Hub, no Graph API permissions

### Hard-Coded App Role IDs

The Terraform azure-ad module uses **hard-coded Microsoft Graph app role IDs** to avoid requiring Directory.Read.All permission on the Terraform SPN.

**File**: [iac/azure/modules/azure-ad/main.tf](../../iac/azure/modules/azure-ad/main.tf) (lines 11-37)

This design eliminates the need for the Terraform SPN to have any Graph API permissions, significantly reducing the attack surface.

### Permission Verification

After running any setup or cleanup script:

1. **Verify in Azure Portal**:
   - Go to: App registrations → [App Name] → API permissions
   - Confirm only expected permissions are present
   - Verify admin consent is granted (green checkmarks)

2. **Test functionality**:
   - Terraform: Run `terraform plan` to confirm it still works
   - Bot: Run test scripts to confirm meeting creation, transcript download

3. **Review audit logs**:
   - Azure AD: Sign-ins and audit logs
   - AWS: CloudTrail logs

---

## Troubleshooting

### "Insufficient privileges to complete the operation"

**Cause**: You don't have required Azure AD role to run the script.

**Solution**:

- Bootstrap scripts require: Privileged Role Administrator or Global Administrator
- Cleanup scripts require: Application Administrator or higher
- Contact your Azure AD administrator to grant the necessary role

### "Service Principal already exists"

**Cause**: Script attempted to create an SPN that already exists.

**Solution**:

- For bootstrap: Choose "reset credentials" when prompted
- For cleanup: Run `.\scripts\setup\remove-terraform-spn-graph-permissions.ps1` to clean existing SPN

### "Failed to grant admin consent"

**Cause**: You don't have permissions to grant admin consent.

**Solution**:

- Grant consent manually in Azure Portal:
  1. Go to: App registrations → [App Name] → API permissions
  2. Click: "Grant admin consent for [Your Tenant]"
  3. Confirm when prompted

### "Terraform plan fails after removing Graph permissions"

**Cause**: azure-ad module is not using hard-coded app role IDs.

**Solution**:

1. Pull latest code: `git pull origin main`
2. Verify locals block exists in [iac/azure/modules/azure-ad/main.tf](../../iac/azure/modules/azure-ad/main.tf)
3. Re-run: `cd iac && terraform init && terraform plan`

---

## References

- [Azure Service Principal Security Guidelines](../../docs/AZURE_SPN_SECURITY.md)
- [Bootstrap Documentation](./.github/prompts/bootstrap-azure-spn.prompt.md)
- [Microsoft Graph Permissions Reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Azure RBAC Built-in Roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles)
- [Azure AD Built-in Roles](https://learn.microsoft.com/en-us/azure/active-directory/roles/permissions-reference)
