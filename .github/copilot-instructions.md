# Copilot Instructions for Teams Meeting Fetcher

# DO NOT

- Add emojis to commit messages or PR titles or documentation or scripts unless specified explicitly in the instructions.

## PowerShell Best Practices (Windows)

**When using PowerShell on Windows, follow these critical rules:**

### Command Execution in Terminal

❌ **NEVER** pipe PowerShell output in `run_in_terminal` commands:

- Don't use: `| Out-Null`, `2>&1 | Out-Null`, `| Out-String`, `| Select-Object`
- Piping causes parsing issues and unexpected failures
- Exception: Piping is OK in multi-line scripts or `.ps1` files, just not in single terminal commands

✅ **DO** use proper Windows PowerShell syntax:

- Use backticks (`` ` ``) for line continuation, not backslashes
- Quote variables properly: `"$variable"` not `$variable`
- Escape special characters: `` `< ``, `` `> ``, `` `& ``
- Test angle brackets don't trigger operators: `<app-id>` in quotes → `"<app-id>"`

❌ **NEVER** use emojis in PowerShell scripts:

- PowerShell console on Windows has encoding issues with emojis
- Use text markers instead: `[INFO]`, `[ERROR]`, `[SUCCESS]`

✅ **DO** handle errors properly:

- Use `-ErrorAction Stop` for git commands
- Wrap in try/catch blocks when needed
- Don't suppress errors unless intentional

### Examples

```powershell
# ❌ WRONG - Piping in terminal
run_in_terminal: git commit -m "message" 2>&1 | Out-Null

# ✅ CORRECT - No piping in terminal
run_in_terminal: git commit -m "message"

# ❌ WRONG - Emoji in PowerShell
Write-Host "✅ Success!" -ForegroundColor Green

# ✅ CORRECT - Text marker
Write-Host "[SUCCESS] Operation complete" -ForegroundColor Green

# ❌ WRONG - Angle brackets not escaped
git commit -m "Use -BotAppId <app-id> parameter"

# ✅ CORRECT - Proper escaping
git commit -m "Use -BotAppId parameter"
```

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
- `.env`, `.env.*` - Environment variable files
- `*.tfvars` - Terraform variable files (except .example files)

### Security Coding Standards (MANDATORY)

**CRITICAL: Never hardcode secrets, credentials, or infrastructure identifiers in source code or comments.**

#### What NEVER to Include in Code

❌ **Secrets and Credentials**:

- Client secrets: `'client_secret': 'Cql8Q~...'`
- API keys: `'api_key': 'sk-...'`
- Passwords: `'password': '...'`
- Connection strings: `'DefaultEndpointsProtocol=https;AccountName=...'`
- Access tokens: `'access_token': 'eyJ...'`
- AWS access keys: `'AWS_ACCESS_KEY_ID': 'AKIA...'`
- Private keys or certificates

❌ **Infrastructure Identifiers**:

- Tenant IDs: `'62837751-4e48-4d06-8bcb-57be1a669b78'`
- Application/Client IDs: `'1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8'`
- Subscription IDs: `'12345678-1234-1234-1234-123456789abc'`
- Resource group names: `'tmf-resources-prod'`
- Storage account names: `'tmfstorageeus6an5wk'`
- Database names and endpoints
- Event Hub namespaces: `'tmf-ehns-eus-6an5wk'`

❌ **NEVER in Comments or Documentation Examples**:

```python
# ❌ WRONG - Real secrets in comments
client_secret = os.getenv('CLIENT_SECRET')  # Cql8Q~abc123...

# ❌ WRONG - Real IDs in comments
app_id = os.getenv('APP_ID')  # 1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8
```

#### What TO DO Instead

✅ **Use Configuration Priority Pattern**:

```python
# 1. Explicit parameters (command-line arguments)
# 2. Environment variables
# 3. Configuration files (gitignored)
# 4. Secure vaults (Azure Key Vault, AWS Secrets Manager)
# 5. Error with clear instructions if not found

import os
from dotenv import load_dotenv

load_dotenv()  # Load from .env (gitignored)

def get_config(key, required=True):
    value = os.getenv(key)
    if required and not value:
        raise ValueError(f"Missing required config: {key}. Set via environment variable.")
    return value

tenant_id = get_config('GRAPH_TENANT_ID')
client_id = get_config('GRAPH_CLIENT_ID')
client_secret = get_config('GRAPH_CLIENT_SECRET')
```

✅ **Use Placeholders in Documentation**:

```python
# ✅ CORRECT - Placeholders in comments
client_secret = os.getenv('CLIENT_SECRET')  # From .env file

# ✅ CORRECT - Generic examples
app_id = os.getenv('APP_ID')  # e.g., '<your-app-id>'

# ✅ CORRECT - Descriptive placeholders
connection_string = os.getenv('STORAGE_CONNECTION_STRING')  # Format: DefaultEndpointsProtocol=https;...
```

✅ **PowerShell Configuration Pattern**:

```powershell
# ✅ CORRECT - Parameters with fallback
param(
    [string]$AppId,
    [string]$TenantId
)

# Try parameter, then env var, then config file
if (-not $AppId) { $AppId = $env:APP_ID }
if (-not $AppId) { $AppId = Get-Content ./.app-id -ErrorAction SilentlyContinue }
if (-not $AppId) {
    Write-Error "APP_ID required. Provide via -AppId parameter or APP_ID env var"
    exit 1
}
```

✅ **TypeScript/JavaScript Configuration Pattern**:

```typescript
// ✅ CORRECT - Environment variables
const config = {
  tenantId: process.env.GRAPH_TENANT_ID || throwError('GRAPH_TENANT_ID required'),
  clientId: process.env.GRAPH_CLIENT_ID || throwError('GRAPH_CLIENT_ID required'),
  clientSecret: process.env.GRAPH_CLIENT_SECRET || throwError('GRAPH_CLIENT_SECRET required'),
};

function throwError(message: string): never {
  throw new Error(message);
}
```

### Common Secret Patterns to Avoid

Never commit files containing:

- `client_secret = '...'` or `'client_secret': '...'`
- Hard-coded tenant IDs: `62837751-4e48-4d06-8bcb-57be1a669b78`
- Hard-coded client IDs: `1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8`
- Event Hub connection strings
- Azure Storage connection strings
- AWS access keys or secret keys
- Hard-coded Event Hub names/namespaces used as defaults
- Real secrets in comments: `# secret: Cql8Q~...`
- Real IDs in documentation examples

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
