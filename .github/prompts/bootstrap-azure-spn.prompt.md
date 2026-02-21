# Bootstrap Azure Service Principal

**Purpose**: Create and configure Azure Service Principals for infrastructure deployments and local development.

**When to use**: Initial Azure infrastructure setup, local development environment, or service principal rotation.

**⚠️ IMPORTANT - Security Update (Feb 2026)**: The Terraform deployment SPN **does NOT need Graph API permissions**. The azure-ad module uses hard-coded app role IDs to eliminate this requirement. See [AZURE_SPN_SECURITY.md](../../docs/AZURE_SPN_SECURITY.md) for details.

**Prerequisites**:

- Azure CLI installed (`az --version`)
- **Privileged Role Administrator or Global Administrator** on Azure AD tenant (to assign directory roles to SPN)
- Contributor role on Azure subscription (or Owner to grant additional RBAC roles)
- GitHub account with repo admin rights (for secrets)

---

## Step 1: Authenticate with Azure

```bash
# Login to Azure
az login

# List available subscriptions
az account list --output table

# Set default subscription for this project
az account set --subscription "<SUBSCRIPTION_ID>"

# Verify active subscription
az account show --query "{name: name, id: id, tenantId: tenantId}"
```

---

## Step 2: Create Service Principal for Local Development

```bash
# Create SPN with Contributor role (for local development)
az ad sp create-for-rbac \
  --name "teams-meeting-fetcher-dev" \
  --role "Contributor" \
  --scopes "/subscriptions/<SUBSCRIPTION_ID>"

# Output will include:
# {
#   "appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
#   "displayName": "teams-meeting-fetcher-dev",
#   "password": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
#   "tenant": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
# }
```

**⚠️ Save this output immediately. Password shown only once.**

---

## Step 3: Save Local Development Credentials to .env.local

```bash
# Create or update .env.local with SPN credentials
cat >> .env.local << 'EOF'

# Azure Service Principal (Local Development)
AZURE_TENANT_ID=<TENANT_ID_FROM_OUTPUT>
AZURE_CLIENT_ID=<APP_ID_FROM_OUTPUT>
AZURE_CLIENT_SECRET=<PASSWORD_FROM_OUTPUT>
AZURE_SUBSCRIPTION_ID=<SUBSCRIPTION_ID>
EOF

# Verify credentials are set
grep AZURE .env.local
```

**Important**: Never commit `.env.local` to git.

---

## Step 4: Create Service Principal for CI/CD (GitHub Actions)

```bash
# Create separate SPN for GitHub Actions workflows
az ad sp create-for-rbac \
  --name "teams-meeting-fetcher-cicd" \
  --role "Contributor" \
  --scopes "/subscriptions/<SUBSCRIPTION_ID>" \
  --sdk-auth

# Output will be JSON suitable for GitHub secrets (AZURE_CREDENTIALS)
# Save the entire JSON output
```

---

## Step 5: Configure GitHub Secrets for Azure Deployment

```bash
# Ensure you're logged in to GitHub CLI
gh auth status

# Set GitHub secret for CI/CD credentials
# Paste the JSON from Step 4 when prompted
gh secret set AZURE_CREDENTIALS < <(cat)
# Paste the JSON output from Step 4, then Ctrl+D

# Set other required Azure secrets
gh secret set AZURE_SUBSCRIPTION_ID --body "<SUBSCRIPTION_ID>"
gh secret set EXPECTED_TENANT_ID --body "<TENANT_ID>"

# Verify secrets are set
gh secret list
```

---

## Step 6: Assign Additional Roles (if needed)

```bash
# For accessing Key Vault secrets
az role assignment create \
  --assignee "<APP_ID>" \
  --role "Key Vault Secrets Officer" \
  --scope "/subscriptions/<SUBSCRIPTION_ID>"

# For accessing Storage accounts
az role assignment create \
  --assignee "<APP_ID>" \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/<SUBSCRIPTION_ID>"

# For managing App Insights
az role assignment create \
  --assignee "<APP_ID>" \
  --role "Monitoring Contributor" \
  --scope "/subscriptions/<SUBSCRIPTION_ID>"

# Verify role assignments
az role assignment list --assignee "<APP_ID>" --query "[].roleDefinitionName"
```

---

## Step 7: Create Certificate-Based Authentication (Optional for Enhanced Security)

```bash
# Generate self-signed certificate (valid for 365 days)
openssl req -new -x509 -days 365 -nodes \
  -out cert.pem -keyout private.key \
  -subj "/CN=teams-meeting-fetcher-dev"

# Create certificate credential
az ad sp credential create \
  --id "<APP_ID>" \
  --cert "cert.pem"

# Store certificate securely (not in git)
# Update .env.local to use certificate instead of password:
# AZURE_CERTIFICATE_PATH=./private.key
# AZURE_CERTIFICATE_THUMBPRINT=<thumbprint_from_above>

# Remove temporary cert files
rm cert.pem private.key
```

---

## Step 8: Test Service Principal Authentication

```bash
# Test SPN authentication locally
az login --service-principal \
  -u "<APP_ID>" \
  -p "<PASSWORD>" \
  --tenant "<TENANT_ID>"

# Verify access to subscription
az account show

# Verify can list resource groups
az group list --output table

# Logout from SPN
az logout

# Re-login with user account
az login
```

---

## Step 9: Create Key Vault for Storing Secrets

```bash
# Create Key Vault for storing application secrets
az keyvault create \
  --name "tmf-kv-dev" \
  --resource-group "teams-meeting-fetcher-dev" \
  --location eastus

# Set access policy for SPN
az keyvault set-policy \
  --name "tmf-kv-dev" \
  --object-id "<OBJECT_ID>" \
  --secret-permissions get list set delete

# Store secrets in Key Vault
az keyvault secret set \
  --vault-name "tmf-kv-dev" \
  --name "botAppPassword" \
  --value "<BOT_APP_PASSWORD>"

az keyvault secret set \
  --vault-name "tmf-kv-dev" \
  --name "graphApiKey" \
  --value "<GRAPH_API_KEY>"

# Retrieve secret
az keyvault secret show \
  --vault-name "tmf-kv-dev" \
  --name "botAppPassword" --query value
```

---

## Step 10: Configure Application Insights (Optional)

```bash
# Create Application Insights resource
az monitor app-insights component create \
  --app "teams-meeting-fetcher-dev" \
  --location eastus \
  --resource-group "teams-meeting-fetcher-dev" \
  --kind web

# Get instrumentation key
az monitor app-insights component show \
  --app "teams-meeting-fetcher-dev" \
  --resource-group "teams-meeting-fetcher-dev" \
  --query "instrumentationKey"

# Add to .env.local
echo "APPINSIGHTS_INSTRUMENTATIONKEY=<KEY_FROM_ABOVE>" >> .env.local
```

---

## Step 11: Set Up Resource Group Tags

```bash
# Tag resources for cost tracking and organization
az group update \
  --name "teams-meeting-fetcher-dev" \
  --tags \
    environment=dev \
    project=teams-meeting-fetcher \
    team=platform \
    costcenter=engineering

# Apply tags to all resources in group
az resource tag \
  --resource-group "teams-meeting-fetcher-dev" \
  --tags \
    environment=dev \
    project=teams-meeting-fetcher
```

---

## Step 12: Verify All Credentials Work

```bash
# Test each credential type

# 1. User principal (your account)
az account show

# 2. Service Principal (if using password)
az login --service-principal \
  -u "<APP_ID>" \
  -p "<PASSWORD>" \
  --tenant "<TENANT_ID>"
az account show
az logout

# 3. Test from Terraform (if using terraform locally)
cd iac/azure
terraform init
terraform plan

# Verify no authentication errors
cd ../..
```

---

## Environment Variable Summary

After completing all steps, `.env.local` should contain:

```bash
# Azure Service Principal
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_SUBSCRIPTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Key Vault (if created)
AZURE_KEYVAULT_NAME=tmf-kv-dev
AZURE_KEYVAULT_ENDPOINT=https://tmf-kv-dev.vault.azure.net/

# Application Insights (if created)
APPINSIGHTS_INSTRUMENTATIONKEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# For GitHub Actions
# (GitHub Secrets instead of .env.local)
# AZURE_CREDENTIALS (entire JSON from Step 4)
# AZURE_SUBSCRIPTION_ID
# EXPECTED_TENANT_ID
```

---

## Troubleshooting

### "Insufficient permissions to create service principal"

```bash
# Verify your role
az role assignment list --query "[?principalName=='<your-email>']"

# If not Owner or higher, contact subscription admin
```

### "Service principal authentication fails"

```bash
# Verify SPN exists
az ad sp list --query "[?displayName=='teams-meeting-fetcher-dev']"

# Verify credentials in .env.local match created SPN
az ad sp show --id "<APP_ID>"

# Reset password if needed
az ad sp credential reset --id "<APP_ID>"
```

### "Key Vault access denied"

```bash
# Verify SPN has access policy
az keyvault show-deleted \
  --vault-name "tmf-kv-dev" \
  --query "properties.accessPolicies"

# Re-apply access policy
az keyvault set-policy \
  --name "tmf-kv-dev" \
  --object-id "<OBJECT_ID>" \
  --secret-permissions get list set delete
```

### "Resource group not found"

```bash
# Create resource group if it doesn't exist
az group create \
  --name "teams-meeting-fetcher-dev" \
  --location eastus

# Verify creation
az group show --name "teams-meeting-fetcher-dev"
```

---

## Cleanup & Rotation

### Rotate Service Principal Password

```bash
# Generate new password
az ad sp credential reset --id "<APP_ID>"

# Update .env.local with new password
# Update GitHub secret AZURE_CREDENTIALS

# Verify new credentials work
az login --service-principal \
  -u "<APP_ID>" \
  -p "<NEW_PASSWORD>" \
  --tenant "<TENANT_ID>"
```

### Delete Service Principal (when no longer needed)

```bash
# Only delete when completely sure it's no longer needed
az ad sp delete --id "<APP_ID>"

# Verify deletion
az ad sp list --query "[?displayName=='teams-meeting-fetcher-dev']"
# Should return empty array []
```

---

## Verification Checklist

- [ ] Azure CLI installed and authenticated
- [ ] Subscription set as default
- [ ] Development SPN created (`teams-meeting-fetcher-dev`)
- [ ] `.env.local` has AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID
- [ ] CI/CD SPN created (`teams-meeting-fetcher-cicd`)
- [ ] GitHub secrets configured (AZURE_CREDENTIALS, AZURE_SUBSCRIPTION_ID, EXPECTED_TENANT_ID)
- [ ] Additional roles assigned (Key Vault, Storage, Monitoring)
- [ ] SPN authentication tested and working
- [ ] Key Vault created (optional)
- [ ] Application Insights created (optional)
- [ ] Resource Group tags applied
- [ ] Terraform plan succeeds in `iac/azure/`

---

## Next Steps

1. **Deploy Infrastructure**: Run `cd iac/azure && terraform apply`
2. **Configure GitHub Actions**: Use credentials to enable automated deployments
3. **Set Up Monitoring**: Configure Application Insights alerts and dashboards
4. **Document Credentials**: Maintain inventory of created SPNs and their purposes
5. **Schedule Rotation**: Set calendar reminder to rotate credentials every 90 days
