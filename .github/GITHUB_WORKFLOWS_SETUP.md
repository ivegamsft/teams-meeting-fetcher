# GitHub Workflows Setup Guide

This guide walks you through setting up the required credentials (AWS IAM & Azure Service Principal) so GitHub Actions workflows can deploy to both AWS and Azure.

## Overview

The GitHub workflows require:

- **AWS**: OIDC role for GitHub Actions
- **Azure**: Service Principal with Contributor role on your subscription
- GitHub Actions secrets and variables for cloud auth and Terraform state

## Prerequisites

- AWS Account with sufficient permissions to create IAM users
- Azure Subscription with Owner or slightly-elevated permissions
- GitHub repository (this one!)
- GitHub CLI (`gh`) installed, or access to GitHub UI for adding secrets

---

## Part 1: AWS OIDC Setup

### Step 1a: Create AWS OIDC Role

1. Go to **AWS Management Console** → **IAM** → **Identity providers**
2. Add an OIDC provider for GitHub (`https://token.actions.githubusercontent.com`)
3. Create an IAM role for GitHub Actions
4. Use a trust policy scoped to your repository
5. Attach required policies (least privilege preferred)

**Optional: Granular Policies instead of AdministratorAccess**

If you want tighter permissions, attach only what's needed:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "apigateway:*",
        "iam:*",
        "s3:*",
        "dynamodb:*",
        "sns:*",
        "logs:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["sts:GetCallerIdentity"],
      "Resource": "*"
    }
  ]
}
```

### Step 1b: Save to GitHub Secrets

Using GitHub CLI:

```bash
gh secret set AWS_ROLE_ARN --body "<your-role-arn>"
```

Or manually in GitHub UI:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add `AWS_ROLE_ARN` with the value

✅ **AWS OIDC setup complete!**

---

## Part 2: Azure Service Principal Setup

### Option A: Using Azure CLI (Recommended)

**Prerequisite**: Install [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)

**Step 2a: Get your Subscription ID**

```bash
az account show --query "id" -o tsv
```

Save this value — you'll need it.

**Step 2b: Create Service Principal**

```bash
# Set these variables
export SUBSCRIPTION_ID="<your-subscription-id-from-above>"
export SP_NAME="tmf-github-actions"
export RESOURCE_GROUP="teams-meeting-fetcher"  # optional, can be empty initially

# Create the service principal
az ad sp create-for-rbac --name $SP_NAME \
  --role Contributor \
  --scopes /subscriptions/$SUBSCRIPTION_ID \
  --json-auth
```

**Output will look like:**

```json
{
  "clientId": "00000000-0000-0000-0000-000000000000",
  "clientSecret": "your-secret-value",
  "subscriptionId": "00000000-0000-0000-0000-000000000000",
  "tenantId": "00000000-0000-0000-0000-000000000000",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  "activeDirectoryGraphResourceId": "https://graph.windows.net/",
  "sqlManagementEndpointUrl": "https://management.core.windows.net:8443/",
  "galleryEndpointUrl": "https://gallery.azure.com/",
  "managementEndpointUrl": "https://management.core.windows.net/"
}
```

**Save this output securely!** You'll use it in the next step.

### Option B: Using Azure Portal

1. Go to **Azure Portal** → **Entra ID** → **App registrations**
2. Click **New registration**
3. Name: `Teams Meeting Fetcher - GitHub Actions`
4. Click **Register**
5. Go to **Certificates & secrets**
6. Click **New client secret**
7. Description: `GitHub Actions`
8. Expiry: 24 months (set a reminder to renew!)
9. Click **Add**
10. **Copy the secret value immediately** (only shown once)
11. Back on the app registration page, copy:
    - Application (client) ID
    - Directory (tenant) ID
12. Go to **Subscriptions** → select your subscription
13. Click **Access control (IAM)**
14. Click **Add** → **Add role assignment**
15. Select **Contributor** role
16. Search for your app name and select it
17. Click **Review + assign**

### Step 2c: Save to GitHub Secrets

Using GitHub CLI:

```bash
# Using the JSON output from Step 2b
gh secret set AZURE_CREDENTIALS --body '{
  "clientId": "YOUR_CLIENT_ID",
  "clientSecret": "YOUR_CLIENT_SECRET",
  "subscriptionId": "YOUR_SUBSCRIPTION_ID",
  "tenantId": "YOUR_TENANT_ID",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  "activeDirectoryGraphResourceId": "https://graph.windows.net/",
  "sqlManagementEndpointUrl": "https://management.core.windows.net:8443/",
  "galleryEndpointUrl": "https://gallery.azure.com/",
  "managementEndpointUrl": "https://management.core.windows.net/"
}'

gh secret set AZURE_CLIENT_ID --body "YOUR_CLIENT_ID"
gh secret set AZURE_CLIENT_SECRET --body "YOUR_CLIENT_SECRET"
gh secret set AZURE_SUBSCRIPTION_ID --body "YOUR_SUBSCRIPTION_ID"
gh secret set EXPECTED_TENANT_ID --body "YOUR_TENANT_ID"
```

Or manually in GitHub UI:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** for each:
   - `AZURE_CREDENTIALS` - The complete JSON from Step 2b
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_SUBSCRIPTION_ID`
   - `EXPECTED_TENANT_ID`

✅ **Azure setup complete!**

---

## Part 3: Terraform State Settings

Store Terraform backend configuration in GitHub **variables** and the IP allowlist in **secrets**.

### Variables

```bash
gh variable set TF_STATE_BUCKET --body "<state-bucket-name>"
gh variable set TF_STATE_KEY --body "<state-key-path>"
gh variable set TF_STATE_REGION --body "<state-region>"
gh variable set TF_STATE_LOCK_TABLE --body "<state-lock-table>"
gh variable set AWS_REGION --body "<aws-region>"
```

### Secrets

```bash
gh secret set TF_STATE_IP_CIDR --body "<your-ip-cidr>"
```

---

## Part 4: Graph API Secrets (for testing workflows)

These are optional but needed if your workflows run Graph API tests.

```bash
# Add your Graph API credentials
gh secret set GRAPH_TENANT_ID --body "YOUR_GRAPH_TENANT_ID"
gh secret set GRAPH_CLIENT_ID --body "YOUR_GRAPH_CLIENT_ID"
gh secret set GRAPH_CLIENT_SECRET --body "YOUR_GRAPH_CLIENT_SECRET"
```

---

## Part 5: Verify Secrets and Variables in GitHub

```bash
# List all secrets (values hidden)
gh secret list
```

You should see:

- `AWS_ROLE_ARN`
- `AZURE_CREDENTIALS`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_SUBSCRIPTION_ID`
- `EXPECTED_TENANT_ID`
- (optional) `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`

And variables:

- `AWS_REGION`
- `TF_STATE_BUCKET`
- `TF_STATE_KEY`
- `TF_STATE_REGION`
- `TF_STATE_LOCK_TABLE`

---

## Part 6: Test the Workflows

### Trigger a test workflow:

```bash
# Test Terraform validation
gh workflow run terraform-validate.yml

# Test security scan
gh workflow run security-scan.yml

# Test AWS deployment (requires approval)
gh workflow run deploy-aws.yml

# Monitor workflow
gh run list --workflow=deploy-aws.yml
gh run view <run-id> --log
```

Or manually:

1. Go to **Actions** tab in GitHub
2. Select a workflow
3. Click **Run workflow**
4. Choose branch and click **Run**

---

## Part 6: Cleanup & Rotation

### AWS Access Keys

Rotate access keys every 90 days:

```bash
# Delete old key
aws iam delete-access-key --access-key-id <OLD_KEY_ID>

# Create new key (see Step 1b)
aws iam create-access-key --user-name tmf-github-actions

# Update GitHub secret
gh secret set AWS_SECRET_ACCESS_KEY --body "NEW_SECRET_KEY"
```

### Azure Service Principal

Rotate client secrets every 6-12 months:

```bash
# Create a new client secret
az ad app credential reset --id <CLIENT_ID> --append

# Copy the new secret, then update GitHub
gh secret set AZURE_CLIENT_SECRET --body "NEW_SECRET"

# Delete old secret (wait a few minutes for propagation first)
```

---

## Troubleshooting

### "TENANT MISMATCH" error in deploy-azure workflow

This is intentional! The workflow blocks if you're on the wrong Azure tenant. Fix:

```bash
# Verify your tenant
az account show --query "tenantId" -o tsv

# Update EXPECTED_TENANT_ID secret if needed
gh secret set EXPECTED_TENANT_ID --body "CORRECT_TENANT_ID"
```

### "Access Denied" in AWS workflow

Verify the IAM user has these permissions:

```bash
aws iam list-attached-user-policies --user-name tmf-github-actions
```

Should include `AdministratorAccess` or the custom policy from Step 1a.

### "Invalid client ID" in Azure workflow

Check that:

- `AZURE_CLIENT_ID` is the **Application** ID (not object ID)
- `EXPECTED_TENANT_ID` matches your Azure tenant
- The service principal has **Contributor** or higher role

```bash
# Verify
az ad sp show --id <CLIENT_ID> --query "appId"
```

---

## Next Steps

Once secrets are configured:

1. Push changes to trigger CI workflows
2. Create a test meeting to validate Graph API access
3. Run `deploy-aws.yml` or `deploy-azure.yml` to deploy infrastructure
4. Monitor logs in GitHub Actions

See `.github/workflows/` for workflow definitions and `.github/prompts/` for manual operation guides.
