# Bootstrap GitHub Workflow Credentials

**Purpose**: Set up all GitHub repository secrets and environment variables required for CI/CD workflows to deploy to AWS and Azure.

**When to use**: Initial GitHub Actions setup, credential rotation, or migrating to new GitHub organization.

**Prerequisites**:

- GitHub repository admin access
- GitHub CLI installed and authenticated (`gh auth login`)
- AWS credentials (Access Key ID + Secret Access Key)
- Azure Service Principal created (see `bootstrap-azure-spn.prompt.md`)
- Terraform authentication set up locally

---

## Step 1: Verify GitHub CLI Authentication

```bash
# Check GitHub CLI status
gh auth status

# If not logged in:
gh auth login
# Select: GitHub.com
# Select: HTTPS
# Select: Y (Authenticate with GitHub token)
# Generate token at https://github.com/settings/tokens/new (repo scope)
```

---

## Step 2: List Required Secrets

```bash
# View all repository secrets
gh secret list

# Should eventually have:
# AWS_ACCESS_KEY_ID
# AWS_SECRET_ACCESS_KEY
# AZURE_CREDENTIALS
# AZURE_SUBSCRIPTION_ID
# EXPECTED_TENANT_ID
# (Optional) GRAPH_API_KEY
# (Optional) SLACK_WEBHOOK_URL
```

---

## Step 3: Create AWS IAM User for CI/CD

```bash
# Create IAM user for GitHub Actions
aws iam create-user --user-name github-actions-tmf --profile tmf-dev

# Create access key for user
aws iam create-access-key --user-name github-actions-tmf --profile tmf-dev

# Output will include:
# - AccessKeyId
# - SecretAccessKey
# Save both securely
```

---

## Step 4: Attach AWS Policies to IAM User

```bash
# Attach AdministratorAccess policy (or more restrictive if preferred)
aws iam attach-user-policy \
  --user-name github-actions-tmf \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess \
  --profile tmf-dev

# Verify policy attached
aws iam list-attached-user-policies \
  --user-name github-actions-tmf \
  --profile tmf-dev
```

---

## Step 5: Store AWS Credentials in GitHub Secrets

```bash
# Set AWS_ACCESS_KEY_ID secret
gh secret set AWS_ACCESS_KEY_ID \
  --body "<ACCESS_KEY_ID_FROM_STEP_3>"

# Set AWS_SECRET_ACCESS_KEY secret
gh secret set AWS_SECRET_ACCESS_KEY \
  --body "<SECRET_ACCESS_KEY_FROM_STEP_3>"

# For specific org repo:
# gh secret set AWS_ACCESS_KEY_ID \
#   --repo <owner>/<repo> \
#   --body "<ACCESS_KEY_ID>"

# Verify secrets are set (don't show values)
gh secret list | grep AWS
```

---

## Step 6: Store Azure Credentials in GitHub Secrets

```bash
# Ensure you have the JSON output from `bootstrap-azure-spn.prompt.md` Step 4
# (Or follow that prompt first to create SPN)

# Set AZURE_CREDENTIALS with full JSON (for GitHub Actions)
gh secret set AZURE_CREDENTIALS \
  --body '<PASTE_ENTIRE_JSON_FROM_STEP_4_OF_AZURE_BOOTSTRAP>'

# Example JSON format:
# {
#   "clientId": "...",
#   "clientSecret": "...",
#   "subscriptionId": "...",
#   "tenantId": "..."
# }

# Set AZURE_SUBSCRIPTION_ID
gh secret set AZURE_SUBSCRIPTION_ID \
  --body "<SUBSCRIPTION_ID>"

# Set EXPECTED_TENANT_ID (for mandatory tenant verification)
gh secret set EXPECTED_TENANT_ID \
  --body "<TENANT_ID>"

# Verify Azure secrets
gh secret list | grep AZURE
```

---

## Step 7: Create GitHub Personal Access Token for Workflows

```bash
# Create PAT at https://github.com/settings/tokens/new
# Select scopes:
#   - repo (full repository access)
#   - workflow (update GitHub Actions)
#   - admin:repo_hook (manage webhooks)

# Set as Github Actions secret (if workflows need to trigger other workflows)
gh secret set GH_TOKEN \
  --body "<PERSONAL_ACCESS_TOKEN>"

# Note: GitHub automatically provides GITHUB_TOKEN in workflows
# Only use GH_TOKEN if you need cross-repo access or elevated permissions
```

---

## Step 8: Configure Optional Secrets for Notifications

```bash
# Create Slack webhook for CI/CD notifications (optional)
# 1. Go to https://api.slack.com/apps
# 2. Create new app
# 3. Enable Incoming Webhooks
# 4. Add webhook for your channel
# 5. Copy webhook URL

# Set Slack webhook secret
gh secret set SLACK_WEBHOOK_URL \
  --body "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# Create PagerDuty integration token (optional)
gh secret set PAGERDUTY_TOKEN \
  --body "<PAGERDUTY_INTEGRATION_TOKEN>"
```

---

## Step 9: Set Repository Secrets as Environment

```bash
# Create development environment
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/environments \
  -X POST \
  -F name=development

# Set environment-specific secrets
gh secret set AWS_ACCOUNT_ID \
  --env development \
  --body "<DEV_AWS_ACCOUNT_ID>"

# Create production environment (if separate)
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/environments \
  -X POST \
  -F name=production

# Production environment secrets can be more restricted
```

---

## Step 10: Use Automation Scripts for Setup

Instead of manual setup, use the provided automation scripts:

```bash
# For AWS IAM setup
./scripts/setup/setup-github-aws-iam.ps1  # Windows PowerShell
# or
./scripts/setup/setup-github-aws-iam.sh   # Bash/Linux/macOS

# For Azure SPN setup
./scripts/setup/setup-github-azure-spn.ps1  # Windows PowerShell
# or
./scripts/setup/setup-github-azure-spn.sh   # Bash/Linux/macOS

# Verify all secrets are set
./scripts/verify/verify-github-secrets.ps1  # Windows PowerShell
# or
./scripts/verify/verify-github-secrets.sh   # Bash/Linux/macOS
```

---

## Step 11: Encrypt Secrets with GitHub CLI

```bash
# Get repository public key (for local encryption)
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/secrets/public-key

# Securely store sensitive values
# Never commit .env files with secrets to git
# Use .env.local (in .gitignore) for local development

# Verify .env.local is in .gitignore
grep ".env.local" .gitignore
```

---

## Step 12: Test GitHub Actions with Secrets

```bash
# Create a simple test workflow to verify secrets work
cat > .github/workflows/test-secrets.yml << 'EOF'
name: Test Secrets

on:
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Check AWS secret exists
        run: |
          if [ -z "${{ secrets.AWS_ACCESS_KEY_ID }}" ]; then
            echo "❌ AWS_ACCESS_KEY_ID not set"
            exit 1
          fi
          echo "✓ AWS_ACCESS_KEY_ID is set"

      - name: Check Azure secret exists
        run: |
          if [ -z "${{ secrets.AZURE_CREDENTIALS }}" ]; then
            echo "❌ AZURE_CREDENTIALS not set"
            exit 1
          fi
          echo "✓ AZURE_CREDENTIALS is set"

      - name: Run verification script
        run: |
          echo "Secrets configured successfully ✓"
EOF

# Commit and push
git add .github/workflows/test-secrets.yml
git commit -m "ci: add workflow to verify secrets"
git push

# Manually trigger workflow to verify
gh workflow run test-secrets.yml

# Check workflow run
gh run list --workflow test-secrets.yml
```

---

## Step 13: Set Branch Protection Rules with Required Checks

```bash
# Enable branch protection on main/develop
gh repo edit \
  --enable-auto-merge \
  --require-code-review \
  --dismiss-stale-reviews \
  --require-status-checks

# Require specific workflow status checks before merge
# (Configure via GitHub UI or API)
# Navigate to: Settings > Branches > Branch protection rules

# Required status checks should include:
# - test-and-lint
# - terraform-validate
# - security-scan
```

---

## Step 14: Configure Secrets Rotation Schedule

```bash
# Create a reminder to rotate credentials every 90 days
# In issue tracker or calendar:
# - AWS Access Key rotation
# - Azure SPN password/certificate rotation
# - GitHub Personal Access Token renewal

# For AWS key rotation:
# 1. Create new access key: aws iam create-access-key ...
# 2. Update GitHub secret: gh secret set AWS_ACCESS_KEY_ID ...
# 3. Delete old key: aws iam delete-access-key ...

# For Azure SPN rotation:
# 1. Create new password: az ad sp credential reset ...
# 2. Update GitHub secret: gh secret set AZURE_CREDENTIALS ...
# 3. Verify new credentials work
# 4. Delete old credential if desired
```

---

## Step 15: Document Secrets in README

```bash
# Add secrets documentation to .github/GITHUB_WORKFLOWS_SETUP.md
# Include:
# - List of all required secrets
# - Explanation of each secret's purpose
# - Instructions for updating each secret
# - How often credentials should be rotated
# - Links to automation scripts

# Example documentation template:
cat >> .github/GITHUB_WORKFLOWS_SETUP.md << 'EOF'

## GitHub Repository Secrets

### Required for AWS Deployment
- **AWS_ACCESS_KEY_ID**: AWS IAM user access key (from `setup-github-aws-iam.sh`)
- **AWS_SECRET_ACCESS_KEY**: AWS IAM user secret key (from `setup-github-aws-iam.sh`)

### Required for Azure Deployment
- **AZURE_CREDENTIALS**: Full JSON SPN object (from `setup-github-azure-spn.sh`)
- **AZURE_SUBSCRIPTION_ID**: Azure subscription ID for deployments
- **EXPECTED_TENANT_ID**: Azure tenant ID (for safety verification)

### Optional Notifications
- **SLACK_WEBHOOK_URL**: Slack incoming webhook for deployment notifications
- **GH_TOKEN**: GitHub Personal Access Token for cross-repo workflows

EOF

git add .github/GITHUB_WORKFLOWS_SETUP.md
git commit -m "docs: document GitHub repository secrets"
git push
```

---

## Secrets Inventory

Track all secrets in a secure location (not in git):

```text
SECRET NAME                    | SOURCE                  | ROTATION SCHEDULE
AWS_ACCESS_KEY_ID              | AWS IAM console        | Every 90 days
AWS_SECRET_ACCESS_KEY          | AWS IAM console        | Every 90 days
AZURE_CREDENTIALS              | Azure CLI / Portal     | Every 90 days
AZURE_SUBSCRIPTION_ID          | Azure Portal           | No rotation needed
EXPECTED_TENANT_ID             | Azure Portal           | No rotation needed
SLACK_WEBHOOK_URL              | Slack API console      | When changing webhooks
GH_TOKEN                        | GitHub Settings        | Every 90 days
```

---

## Troubleshooting

### "Secret not found in workflow"

```bash
# Verify secret is set at repository level
gh secret list

# Verify workflow references secret correctly
grep 'secrets\.' .github/workflows/*.yml

# Secrets must be referenced as:
# ${{ secrets.SECRET_NAME }}
# (Case-sensitive, exact match required)
```

### "AWS credentials rejected in workflow"

```bash
# Verify IAM user policy has required permissions
aws iam list-attached-user-policies \
  --user-name github-actions-tmf \
  --profile tmf-dev

# Verify access key is active
aws iam list-access-keys \
  --user-name github-actions-tmf \
  --profile tmf-dev

# Rotate key if needed
aws iam delete-access-key \
  --user-name github-actions-tmf \
  --access-key-id "<OLD_KEY_ID>" \
  --profile tmf-dev

aws iam create-access-key \
  --user-name github-actions-tmf \
  --profile tmf-dev
```

### "Azure authentication fails in workflow"

```bash
# Verify SPN credentials in AZURE_CREDENTIALS JSON
gh secret list | grep AZURE

# Verify tenant ID matches
echo $EXPECTED_TENANT_ID

# Test authentication locally
az login --service-principal \
  -u "<CLIENT_ID>" \
  -p "<CLIENT_SECRET>" \
  --tenant "<TENANT_ID>"
```

### "Workflow runs but can't find secrets"

```bash
# Check if environment limits secret access
# Workflows in PR from forks can't access secrets!
# Configure branch protection to require reviews before merge

# Verify secret has correct scope (repository vs. environment)
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/secrets
```

---

## Verification Checklist

- [ ] GitHub CLI installed and authenticated
- [ ] AWS IAM user `github-actions-tmf` created
- [ ] AWS Access Key created and saved securely
- [ ] AWS_ACCESS_KEY_ID GitHub secret set
- [ ] AWS_SECRET_ACCESS_KEY GitHub secret set
- [ ] Azure SPN created (`bootstrap-azure-spn.prompt.md`)
- [ ] AZURE_CREDENTIALS GitHub secret set (full JSON)
- [ ] AZURE_SUBSCRIPTION_ID GitHub secret set
- [ ] EXPECTED_TENANT_ID GitHub secret set
- [ ] Optional secrets set (Slack, etc.)
- [ ] Test workflow executed successfully
- [ ] Branch protection rules configured
- [ ] Secrets rotation schedule documented
- [ ] All 9 workflows available and working

---

## Next Steps

1. **Run Deploy Workflows**: Trigger `deploy-unified.yml` (unified infrastructure) and `deploy-azure.yml` (Azure-only) manually to verify credentials work
2. **Set Up Branch Protection**: Require status checks and code reviews before merging to main
3. **Enable Notifications**: Configure Slack/email alerts for workflow failures
4. **Document Credentials**: Maintain secure record of all service accounts in secrets manager
5. **Schedule Rotation**: Set calendar reminders for 90-day credential rotation
6. **Audit Secrets**: Monthly review of which secrets are actively used and who can access them
