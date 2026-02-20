# Copilot Instructions for Teams Meeting Fetcher

# DO NOT

- Add emojis to commit messages or PR titles or documentation or scripts unless specified explicitly in the instructions.

## ⚠️ CRITICAL: Unified Deployment Only

**ALWAYS use `iac/` folder for Terraform deployments.** This is the ONLY source of truth for infrastructure.

### DO NOT USE:

- ❌ `iac/aws/` subfolder - MODULES ONLY (use iac/ root for deployment)
- ❌ `iac/azure/` subfolder - MODULES ONLY (use iac/ root for deployment)

The `iac/azure` and `iac/aws` subfolders are **module libraries only**. The root `iac/` folder contains the unified deployment orchestration.

**SEE: [../DEPLOYMENT_RULES.md](../DEPLOYMENT_RULES.md) for mandatory rules**

## Unified Deployment Structure

```
iac/                          ← DEPLOY FROM HERE (orchestration + all modules)
├── main.tf                     Calls: ./azure + ./aws
├── terraform.tfvars            Single configuration file
├── terraform.tfstate           Unified state for all resources
│
├── azure/                      Module subdirectory
│   ├── main.tf
│   └── modules/
│
└── aws/                        Module subdirectory
    ├── main.tf
    └── modules/
```

## Tenant Validation Rule

**Before running ANY Azure CLI (`az`), Azure PowerShell, or Terraform command that modifies Azure resources, ALWAYS verify the active tenant:**

```bash
az account show --query "tenantId" --output tsv
```

The expected tenant ID is `62837751-4e48-4d06-8bcb-57be1a669b78` (GRAPH_TENANT_ID in .env).

- If the tenant does NOT match, **STOP** and ask the user to log in to the correct tenant.
- Do NOT proceed with any Azure modifications on the wrong tenant.
- The AWS profile for this project is `tmf-dev` (us-east-1).

## Graph Subscriptions Setup

**CRITICAL:** Before creating Graph subscriptions, read: [docs/GRAPH_SUBSCRIPTIONS_SETUP.md](../docs/GRAPH_SUBSCRIPTIONS_SETUP.md)

**Key rules:**

- ✅ Subscriptions MUST target GROUP resource: `/groups/5e7708f8-b0d2-467d-97f9-d9da4818084a`
- ❌ Never use individual user paths: `/users/user@domain.com/events`
- ✅ Event Hub URL format MUST include `/eventhubname/` path segment and `?tenantId=<domain>`
- ❌ Missing `/eventhubname/` or `tenantId` will cause 400 ValidationError from Graph API
- Graph Change Tracking SPN must have:
  - "Azure Event Hubs Data Sender" role on Event Hub namespace
  - "Storage Blob Data Contributor" role on storage account (for rich notifications)

**If creating subscriptions, always:**

1. Verify tenant is correct
2. Ensure resource is a group path, not user path
3. Use exact Event Hub URL format (see GRAPH_SUBSCRIPTIONS_SETUP.md)
4. Restart processor after subscription created: `npm run process`

## Deployment Checklist

Always deploy from the root `iac/` folder:

```bash
# ✅ CORRECT ALWAYS
cd iac
terraform plan
terraform apply

# ❌ WRONG - These are just modules
cd iac/azure
terraform apply

# ❌ WRONG - These are just modules
cd iac/aws
terraform apply
```

## Key Resource IDs (from iac/ deployment)

- **Graph API App ID**: `1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8`
- **Tenant ID**: `62837751-4e48-4d06-8bcb-57be1a669b78`
- **Allowed Group ID**: `5e7708f8-b0d2-467d-97f9-d9da4818084a`
- **Event Hub Namespace**: `tmf-ehns-eus-6an5wk`
- **Event Hub Name**: `tmf-eh-eus-6an5wk`

## Architecture

- **Runtime**: AWS Lambda (Node.js 18) behind API Gateway (REST) + Azure Bot Service
- **Orchestration**: Single Terraform deployment in `iac/` manages both clouds
- **Infrastructure**: 19 Azure resources + 74 AWS resources (unified deployment)
- **State**: Single `iac/terraform.tfstate` for all resources

## Preventing Duplicate Deployments

✅ **Always**: `cd iac` before running terraform commands (root folder, not subfolders)
✅ **Always**: Run `terraform plan` before `terraform apply`
✅ **Always**: Check the output matches your deployment goals
❌ **Never**: `cd iac/aws`, `cd iac/azure`, or deploy from module subdirectories
❌ **Never**: Deploy Azure or AWS separately

See [../DEPLOYMENT_RULES.md](../DEPLOYMENT_RULES.md) for complete rules.

## Security and Commit Best Practices

**CRITICAL: Always scan for secrets before committing code.**

### Pre-Commit Security Checklist

Before running `git commit`, ALWAYS perform these checks:

1. **Check what files will be committed**:

   ```bash
   git status
   ```

2. **Scan for exposed secrets** (client secrets, passwords, tokens):

   ```bash
   # PowerShell
   Get-ChildItem -Path . -Include *.py,*.js,*.ts,*.md -Recurse |
     Where-Object { $_.FullName -notmatch "\.git|\.venv|node_modules|backup-before" } |
     Select-String "client_secret.*:|CLIENT_SECRET.*=" |
     Select-Object -First 20
   ```

3. **Verify no hardcoded credentials** in files being added:
   - Client secrets (Azure/AWS)
   - API keys
   - Connection strings
   - Tenant IDs used as defaults
   - Resource names used as defaults

### Python Security Pattern (REQUIRED)

All Python scripts MUST use environment variables for configuration:

```python
# ✅ CORRECT - Secure pattern
import os
from dotenv import load_dotenv

load_dotenv()  # Loads from .env file

CONFIG = {
    'tenant_id': os.getenv('GRAPH_TENANT_ID'),
    'client_id': os.getenv('GRAPH_CLIENT_ID'),
    'client_secret': os.getenv('GRAPH_CLIENT_SECRET'),
}

# Validate required variables
if not all(CONFIG.values()):
    raise ValueError("Missing required environment variables")
```

```python
# ❌ WRONG - Never hardcode credentials or defaults
CONFIG = {
    'tenant_id': '62837751-4e48-4d06-8bcb-57be1a669b78',
    'client_id': '1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8',
    'client_secret': 'Cql8Q~...',  # NEVER DO THIS
}

# ❌ WRONG - Don't use defaults that expose infrastructure
EVENTHUB_NAMESPACE = os.getenv('EVENTHUB_NAMESPACE', 'tmf-ehns-eus-6an5wk')
```

### Files Protected by .gitignore

These directories are gitignored and won't be committed (verify with `git status`):

- `nobots-eventhub/` - Local testing directory with credentials
- `nobots/` - Local development files
- `temp-lambda/` - Temporary Lambda builds
- `.env`, `.env.*` - Environment variable files
- `*.tfvars` - Terraform variable files (except .example files)

### Common Secret Patterns to Avoid

Never commit files containing:

- `client_secret = '...'` or `'client_secret': '...'`
- Hard-coded tenant IDs: `62837751-4e48-4d06-8bcb-57be1a669b78`
- Hard-coded client IDs: `1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8`
- Event Hub connection strings
- Azure Storage connection strings
- AWS access keys or secret keys
- Hard-coded Event Hub names/namespaces used as defaults

### Documentation Security

When creating documentation with code examples:

```python
# ✅ CORRECT - Show environment variable pattern
GRAPH_CONFIG = {
    'tenant_id': os.getenv('GRAPH_TENANT_ID'),
    'client_id': os.getenv('GRAPH_CLIENT_ID'),
    'client_secret': os.getenv('GRAPH_CLIENT_SECRET'),
}

# ❌ WRONG - Never include actual secrets in comments
GRAPH_CONFIG = {
    'client_secret': '<from-terraform-output>',  # Cql8Q~... (NEVER DO THIS)
}
```

### If Secrets Were Committed

If secrets were previously committed to git history:

1. **Rotate credentials immediately**:
   - Azure: Regenerate service principal client secret
   - AWS: Rotate access keys
   - Update `.env` files with new credentials

2. **Update infrastructure**:

   ```bash
   cd iac
   terraform apply  # Update with new credentials
   ```

3. **Consider cleaning git history** (optional, complex):
   - Use `git-filter-repo` to remove secrets from history
   - Force push to remote (requires team coordination)

### Commit Message Format

- No emojis in commit messages
- Use conventional commit format: `type(scope): description`
- Examples:
  - `feat(graph): add subscription monitoring`
  - `fix(lambda): handle missing event properties`
  - `docs(setup): add Graph subscription guide`
  - `security(scripts): remove hardcoded credentials`
