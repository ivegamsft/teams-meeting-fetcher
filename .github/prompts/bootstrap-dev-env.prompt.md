# Bootstrap Dev Environment

**Purpose**: Set up a fresh development environment from scratch with all dependencies, credentials, and local configurations.

**When to use**: New developer joining the project, local machine refresh, or clean environment setup.

**Prerequisites**:

- Node.js 18+ installed (`node --version`)
- Python 3.10+ installed (`python --version`)
- Git installed and authenticated
- AWS account access (for tmf-dev profile)
- Azure subscription access
- GitHub account with repo access

---

## Step 1: Clone Repository & Navigate

```bash
# Clone the repo (if not already done)
git clone https://github.com/ivegamsft/teams-meeting-fetcher.git
cd teams-meeting-fetcher

# Verify you're in the correct directory
pwd  # Should end with: teams-meeting-fetcher
```

---

## Step 2: Install Node.js Dependencies

```bash
# Install npm packages for root and all app subdirectories
npm install

# Verify installation
npm list --depth=0

# Install workspace dependencies
npm run build
```

---

## Step 3: Install Python Dependencies

```bash
# Create Python virtual environment (if not exists)
python -m venv .venv

# Activate virtual environment
# On macOS/Linux:
source .venv/bin/activate
# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

# Install Python dependencies
pip install -r test/requirements.txt
pip install -r scripts/requirements.txt

# Verify installation
pip list | grep -E "azure|msgraph|requests"
```

---

## Step 4: Configure AWS Credentials

```bash
# Ensure AWS CLI is installed
aws --version

# Configure AWS profile for this project
aws configure --profile tmf-dev
# When prompted:
# - AWS Access Key ID: [Enter your AWS access key]
# - AWS Secret Access Key: [Enter your AWS secret key]
# - Default region: us-east-1
# - Default output format: json

# Verify AWS configuration
aws sts get-caller-identity --profile tmf-dev

# Output should show your AWS account ID, User ARN, etc.
```

**Important**: Store AWS credentials securely. Never commit `.aws/credentials` to git.

---

## Step 5: Create Azure Service Principal

```bash
# Install Azure CLI (if not already installed)
az --version

# Login to Azure
az login

# Set default subscription
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"

# Verify subscription
az account show

# Create Service Principal for local development
az ad sp create-for-rbac \
  --name "teams-meeting-fetcher-dev" \
  --role "Contributor" \
  --scopes /subscriptions/<YOUR_SUBSCRIPTION_ID>

# Save the output JSON containing:
# - appId (client ID)
# - password (client secret)
# - tenant (tenant ID)
```

**⚠️ Warning**: Save this output securely. The password is shown only once.

---

## Step 6: Create Local Environment Files

```bash
# Create .env.local for local development
cat > .env.local << 'EOF'
# AWS Configuration
AWS_PROFILE=tmf-dev
AWS_REGION=us-east-1

# Azure Configuration
AZURE_TENANT_ID=<FROM_SPN_OUTPUT>
AZURE_CLIENT_ID=<FROM_SPN_OUTPUT>
AZURE_CLIENT_SECRET=<FROM_SPN_OUTPUT>
AZURE_SUBSCRIPTION_ID=<YOUR_SUBSCRIPTION_ID>

# Graph API Configuration
GRAPH_TENANT_ID=<YOUR_TENANT_ID>
GRAPH_CLIENT_ID=<BOT_APP_ID>

# Bot Configuration
BOT_APP_ID=<BOT_APP_ID>
BOT_APP_PASSWORD=<BOT_APP_PASSWORD>

# Teams Configuration
ALLOWED_GROUP_ID=<ALLOWED_GROUP_ID>

# Webhook Configuration
WEBHOOK_BASE_URL=https://localhost:3000

# Database (if using local)
DATABASE_URL=sqlite:./dev.db

# Logging
LOG_LEVEL=debug
EOF

# Replace placeholders with actual values
# Do not commit this file
```

**Note**: Never commit `.env.local` to git. It's in `.gitignore` by default.

---

## Step 7: Initialize Infrastructure Code

```bash
# Navigate to infrastructure directory
cd iac/aws

# Initialize Terraform for AWS
terraform init

# Verify AWS configuration
terraform validate

# Review what would be created
terraform plan -out=tfplan

# Back to root directory
cd ../..
```

```bash
# Repeat for Azure
cd iac/azure

terraform init
terraform validate
terraform plan -out=tfplan

cd ../..
```

---

## Step 8: Create Teams Security Group

```bash
# Run setup script to create Azure AD security group
python scripts/graph/create-security-group.py

# When prompted:
# - Group name: teams-meeting-fetcher-dev
# - Group description: Development group for Teams Meeting Fetcher

# Save the returned Group ID to .env.local as ALLOWED_GROUP_ID
```

---

## Step 9: Initialize Database (if applicable)

```bash
# Run database migrations
npm run db:migrate

# Optionally seed test data
npm run db:seed

# Verify database is created
ls -la *.db  # Should show dev.db or similar
```

---

## Step 10: Verify All Dependencies

```bash
# Check Node.js, npm, and Python
node --version
npm --version
python --version

# Verify AWS credentials work
aws sts get-caller-identity --profile tmf-dev

# Verify Azure credentials work
az account show

# Verify environment variables are set
env | grep -E "AZURE|AWS|GRAPH|BOT" | head -20

# Run initial test suite
npm test -- --testPathPattern="unit" --passWithNoTests
```

---

## Step 11: Run Development Server Locally

```bash
# Start development server
npm run dev

# In another terminal, run log watcher
npm run tail-logs

# Visit http://localhost:3000/health to verify it's running
```

---

## Troubleshooting

### "AWS credentials not found"

```bash
# Verify profile is configured
aws configure list --profile tmf-dev

# If not, reconfigure
aws configure --profile tmf-dev

# Test access
aws sts get-caller-identity --profile tmf-dev
```

### "Azure authentication failed"

```bash
# Re-login to Azure
az logout
az login

# Verify SPN credentials in .env.local are correct
cat .env.local | grep AZURE_

# Test SPN authentication
az account show --subscription <SUB_ID>
```

### "Port 3000 already in use"

```bash
# Find and kill process on port 3000
# On macOS/Linux:
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# On Windows (PowerShell):
Get-Process | Where-Object {$_.Handles -match 'port 3000'} | Stop-Process
```

### "Module not found" errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### "Python venv not activated"

```bash
# Ensure you're in the correct directory
cd teams-meeting-fetcher

# Activate again
source .venv/bin/activate  # macOS/Linux
# or
.\.venv\Scripts\Activate.ps1  # Windows PowerShell
```

---

## Next Steps

1. **Register Teams Bot**: Run `scripts/graph/01-verify-setup.py` to register the bot in Teams
2. **Create Webhook Subscription**: Run `scripts/graph/02-create-webhook-subscription.py`
3. **Create Teams App Package**: Run the App Studio package creation steps
4. **Deploy to Dev Environment**: Use `deploy-unified.yml` (creates all infrastructure) or `deploy-azure.yml` (Azure-only) workflows
5. **Run E2E Tests**: Execute `npm run test:e2e` to verify end-to-end integration

---

## Verification Checklist

- [ ] All npm packages installed (`npm list --depth=0` shows no errors)
- [ ] Python venv created and activated
- [ ] AWS profile configured and verified with `aws sts get-caller-identity`
- [ ] Azure SPN created and credentials in `.env.local`
- [ ] Terraform initialized for both AWS and Azure
- [ ] Teams security group created
- [ ] Database migrations run successfully
- [ ] Dev server starts without errors (`npm run dev`)
- [ ] Health check passes (`curl http://localhost:3000/health`)
- [ ] Tests pass (`npm test -- --testPathPattern="unit"`)
