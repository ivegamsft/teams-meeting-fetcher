# Teams Meeting Fetcher

Automatically record Microsoft Teams meetings and fetch transcriptions with webhook-based notifications. Deploy on-premises, self-hosted, or to Azure with Terraform.

## Overview

This project provides a distributed system to:

- 🎥 **Record Teams meetings** (organizer-initiated)
- 📝 **Auto-fetch transcriptions** via Microsoft Graph API
- 🔔 **Receive webhook notifications** for meeting events
- 🔐 **Secure webhook delivery** with Bearer token authentication
- 👥 **Monitor specific Entra groups** rather than all organization meetings
- 🌐 **Deploy anywhere** - on-premises, self-hosted cloud, or Azure with IaC

## Quick Start

### Interactive Workflow (Recommended for Development)

Use the **[Teams Meeting Fetcher Workflow Notebook](./Teams-Meeting-Fetcher-Workflow.ipynb)** for an interactive, step-by-step guide through:

1. ✅ Verify setup and permissions
2. 🔔 Create webhook subscriptions
3. 👥 Manage group memberships
4. 📅 Create test meetings with transcripts enabled
5. 🔌 Test webhook delivery
6. 📝 Poll for and download transcripts

**Quick Start with Notebook:**

```bash
# Install Python dependencies
pip install msal requests python-dotenv

# Open the notebook
jupyter notebook Teams-Meeting-Fetcher-Workflow.ipynb

# Or open in VS Code
code Teams-Meeting-Fetcher-Workflow.ipynb
```

### Graph API Scripts

Individual scripts in `scripts/graph/` for automation:

- `01-verify-setup.py` - Verify environment and permissions
- `02-create-webhook-subscription.py` - Manage Graph webhook subscriptions
- `03-create-test-meeting.py` - Create Teams meetings with transcripts
- `04-poll-transcription.py` - Download meeting transcripts
- `05-manage-group.py` - Add/remove users from target group
- `06-test-webhook.py` - Test webhook delivery

**Run scripts individually:**

```bash
cd scripts/graph
python 01-verify-setup.py
python 02-create-webhook-subscription.py
# ... etc
```

### Prerequisites

- Node.js 18+
- Microsoft Entra tenant with admin access
- Target Entra group created
- Server with HTTPS capability (for webhooks)

### 1. Create App Registration

See [Setup Guide](./specs/setup-guide.md) for detailed instructions.

```bash
# After App Registration:
export GRAPH_TENANT_ID=your-tenant-id
export GRAPH_CLIENT_ID=your-client-id
export GRAPH_CLIENT_SECRET=your-client-secret
export ENTRA_GROUP_ID=your-group-id
export WEBHOOK_AUTH_SECRET=$(openssl rand -hex 32)
```

### 2. Install & Run

```bash
# Clone and install
git clone <repo>
cd teams-meeting-fetcher
npm install

# Build
npm run build

# Start
npm start
```

### 3. Deploy Teams App

Copy `teams-app/manifest.json` and deploy to Teams App catalog.

### 4. Test Webhook

```bash
curl -X POST http://localhost:3000/api/webhooks/graph \
  -H "Authorization: Bearer $WEBHOOK_AUTH_SECRET" \
  -H "Content-Type: application/json" \
  -d @test-webhook-payload.json
```

---

## Project Structure

```
teams-meeting-fetcher/
├── apps/
│   ├── aws-lambda/            # AWS Lambda webhook processor
│   │   ├── handler.js          # Lambda handler (S3 writer)
│   │   ├── test-event.json     # Local test event
│   │   └── sample-webhook.json # Sample Graph payload
│   └── azure-service/         # Azure Container App service
├── iac/
│   ├── azure/                 # Azure Terraform deployment
│   └── aws/                   # AWS Terraform deployment
├── specs/
│   ├── system-specification.md   # Complete system specification
│   ├── setup-guide.md            # Detailed setup guide
│   └── docs/
│       ├── api-reference.md      # API documentation
│       ├── webhook-specification.md  # Webhook implementation
│       └── usage-examples.md     # Code examples
├── README.md                     # This file
│
├── external-app/
│   ├── src/
│   │   ├── index.ts             # Express server setup
│   │   ├── server.ts            # HTTP server configuration
│   │   ├── config.ts            # Environment configuration
│   │   ├── database.ts          # SQLite initialization
│   │   ├── graph-service.ts     # Microsoft Graph client
│   │   ├── webhook-handler.ts   # Webhook processing logic
│   │   ├── transcription-polling.ts  # Poll for transcriptions
│   │   ├── auth-middleware.ts   # Bearer token validation
│   │   ├── routes/
│   │   │   ├── webhooks.ts      # POST /api/webhooks/graph
│   │   │   ├── meetings.ts      # GET /api/meetings
│   │   │   ├── transcriptions.ts # GET /api/transcriptions
│   │   │   ├── config.ts        # GET/PUT /api/config
│   │   │   └── health.ts        # GET /health
│   │   ├── types/
│   │   │   └── index.ts         # TypeScript interfaces
│   │   └── utils/
│   │       ├── logger.ts        # Logging utility
│   │       ├── errors.ts        # Error handling
│   │       └── validators.ts    # Input validation
│   │
│   ├── public/
│   │   ├── index.html           # Management UI
│   │   ├── css/
│   │   │   └── style.css
│   │   └── js/
│   │       └── app.js           # Frontend logic
│   │
│   ├── test/
│   │   ├── unit/
│   │   │   ├── graph-service.test.ts
│   │   │   ├── auth-middleware.test.ts
│   │   │   └── validators.test.ts
│   │   ├── integration/
│   │   │   ├── webhook.test.ts
│   │   │   ├── api.test.ts
│   │   │   └── database.test.ts
│   │   └── mocks/
│   │       ├── graph-api.mock.ts
│   │       ├── webhook-payloads.ts
│   │       └── entra-mock.ts
│   │
│   ├── .env.example              # Environment variables template
│   ├── .env.test                 # Test environment variables
│   ├── package.json
│   ├── tsconfig.json
│   ├── jest.config.js            # Jest testing configuration
│   └── Dockerfile
│
├── teams-app/
│   ├── manifest.json             # Teams app manifest
│   ├── manifest-dev.json         # Development manifest
│   ├── public/
│   │   ├── icon-outline.png      # App icon (outline)
│   │   └── icon-color.png        # App icon (color)
│   └── README.md                 # Teams app setup
│
├── docs/
│   ├── ARCHITECTURE.md           # Detailed architecture diagrams (TBD)
│   └── TROUBLESHOOTING.md        # Common issues & solutions (TBD)
│
└── .github/
    └── workflows/
        ├── test.yml              # Run tests on PR
        └── build.yml             # Build on release
```

---

## API Endpoints

### Webhooks

- `POST /api/webhooks/graph` - Microsoft Graph change notifications

### Meetings

- `GET /api/meetings` - List meetings with optional filters
- `GET /api/meetings/:id` - Get single meeting details
- `GET /api/meetings/:id/transcription` - Get transcription

### Configuration

- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update configuration

### Health

- `GET /health` - Server health check

See [API Documentation](./specs/docs/api-reference.md) for complete reference.

---

## Webhook Security

All webhooks **must** include a Bearer token in the `Authorization` header:

```bash
Authorization: Bearer <WEBHOOK_AUTH_SECRET>
```

The token is validated against the environment variable `WEBHOOK_AUTH_SECRET` (32+ characters, random).

**Example webhook delivery from Graph API**:

```json
{
  "value": [
    {
      "subscriptionId": "string",
      "changeType": "created|updated",
      "resource": "/me/events/{id}",
      "clientState": "random-state-value"
    }
  ]
}
```

**Our validation**:

1. Extract `Authorization` header
2. Verify format: `Bearer <token>`
3. Compare token to `WEBHOOK_AUTH_SECRET`
4. If mismatch → return 401 Unauthorized
5. If valid → process notification

---

## Configuration

### Environment Variables

Create a `.env` file in the `external-app/` directory:

```bash
# Microsoft Graph API
GRAPH_TENANT_ID=00000000-0000-0000-0000-000000000000
GRAPH_CLIENT_ID=00000000-0000-0000-0000-000000000000
GRAPH_CLIENT_SECRET=your-very-secret-value

# Target Group
ENTRA_GROUP_ID=00000000-0000-0000-0000-000000000000

# Webhook Security
WEBHOOK_AUTH_SECRET=random-secure-token-minimum-32-characters

# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
EXTERNAL_WEBHOOK_URL=https://your-domain.com/api/webhooks/graph

# Database
DATABASE_PATH=./data/meetings.db

# Graph Polling
TRANSCRIPTION_POLL_INTERVAL_MS=30000
TRANSCRIPTION_MAX_RETRIES=40
WEBHOOK_SUBSCRIPTION_TTL_DAYS=29
```

See `.env.example` for all options.

---

## Development

### Local Setup

```bash
cd external-app
npm install

# Create .env.test for testing
cp .env.example .env.test

# Run tests
npm run test

# Run in dev mode with auto-reload
npm run dev
```

### Build & Run

```bash
npm run build
npm start
```

### Docker

```bash
# Build image
docker build -t teams-meeting-fetcher .

# Run container with env vars
docker run -d \
  -e GRAPH_TENANT_ID=... \
  -e GRAPH_CLIENT_ID=... \
  -e GRAPH_CLIENT_SECRET=... \
  -e ENTRA_GROUP_ID=... \
  -e WEBHOOK_AUTH_SECRET=... \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  teams-meeting-fetcher
```

---

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage

# Watch mode (development)
npm run test:watch
```

---

## Deployment

### Deployment Options

- **On-Premises or Self-Hosted**: Use [Setup Guide](./specs/setup-guide.md) with Docker or systemd
- **Azure (Recommended for Production)**: Use [Infrastructure Terraform Specification](./specs/infrastructure-terraform-spec.md) for enterprise-grade deployment with:
  - Virtual Network with private endpoints
  - Container Apps for managed compute
  - Key Vault for secrets management
  - Storage for logs and transcriptions
  - Application Insights monitoring
  - RBAC-only security (no keys in code)
- **Minimal Serverless (AWS + Azure Event Grid)**: Use [Minimal Serverless Specification](./specs/infrastructure-minimal-serverless-spec.md) with Terraform code under [iac/aws/](./iac/aws/) for low-cost, event-driven deployments

### Azure Deployment with Terraform

The Azure infrastructure uses Terraform to provision:

- Azure AD app registration with Microsoft Graph API permissions
- Service principal for the application
- Admin security group
- Key Vault (RBAC-enabled) for secrets storage
- Storage Account (RBAC-only, no key-based authentication)
- Blob container for webhook payloads
- Role assignments for proper RBAC access

#### Prerequisites

1. Azure CLI installed and authenticated
2. Terraform >= 1.0 installed
3. Azure subscription with permissions to:
   - Create Azure AD applications and service principals
   - Assign Azure AD API permissions (requires Application.ReadWrite.All, Group.ReadWrite.All)
   - Create Azure resources (Contributor role on subscription)
4. **Service Principal (SPN) requires additional Azure AD permission:**
   - `Domain.Read.All` - Required to read tenant domains for automatic test user creation
   - Grant via: Azure Portal → Azure AD → App registrations → Your SPN → API permissions → Add permission → Microsoft Graph → Application permissions → Domain.Read.All → Grant admin consent

#### Deploy Azure Infrastructure

```bash
cd iac/azure

# Copy terraform.tfvars.example to terraform.tfvars
# Update with your subscription ID, tenant ID, and service principal credentials
# Add your public IPs to allowed_ip_addresses for Key Vault and Storage firewall access

terraform init
terraform plan
terraform apply
```

The deployment creates a unique 6-character suffix for all resources (e.g., `abc123`) to ensure globally unique names.

#### Create Test User (Optional)

The Terraform configuration can optionally create a test user for development:

```hcl
# Add to terraform.tfvars

# Option 1: Automatic domain (uses default verified domain)
create_test_user              = true
test_user_display_name        = "TMF Test User"
test_user_password            = "YourComplexPassword123!"
# test_user_principal_name is optional - will auto-generate as tmftestuser@<default-domain>

# Option 2: Specify custom UPN
create_test_user              = true
test_user_principal_name      = "customuser@yourdomain.onmicrosoft.com"
test_user_display_name        = "TMF Test User"
test_user_password            = "YourComplexPassword123!"
```

The test user will be:

- Created in Azure AD with UPN using default verified domain (if not specified)
- Added to the monitored meetings group automatically
- Available for creating test meetings
- Can be used with the workflow notebook

**How it works:**

- If `test_user_principal_name` is not provided, Terraform fetches the default verified domain and creates: `tmftestuser@yourtenant.onmicrosoft.com`
- If provided, uses the specified UPN

⚠️ **Important**: The test user requires a Microsoft 365 license for Teams functionality (including meetings and transcription).

#### Retrieve App Client Secret

After deployment, the client secret is stored in Key Vault:

```bash
# Get the Key Vault name from Terraform output
az keyvault secret show \
  --vault-name <keyvault-name> \
  --name app-client-secret \
  --query value -o tsv
```

Update `.env.local.azure` with this value.

#### Grant Admin Consent

The app registration requires admin consent for Microsoft Graph API permissions:

1. Navigate to Azure Portal → Azure AD → App registrations
2. Find your app (e.g., "Teams Meeting Fetcher (dev)")
3. Go to API permissions
4. Click "Grant admin consent for [Your Tenant]"

Required permissions:

- `Calendars.Read` (Application)
- `OnlineMeetings.Read.All` (Application)
- `Group.Read.All` (Application)
- `Application.ReadWrite.All` (Application)

#### Generate Environment File

```powershell
# PowerShell
./scripts/generate-azure-env.ps1
```

```bash
# Bash
./scripts/generate-azure-env.sh
```

This creates `.env.local.azure` with all necessary configuration from Terraform outputs.

#### Complete Environment Configuration

After generating the environment file, populate the remaining secrets:

**1. Retrieve the client secret from Key Vault:**

```bash
# Get Key Vault name from Terraform outputs (or check .env.local.azure)
cd iac/azure
terraform output key_vault_name

# Get the client secret (stored during deployment)
az keyvault secret show \
  --vault-name <key-vault-name> \
  --name app-client-secret \
  --query value -o tsv
```

If you need to grant yourself Key Vault permissions first:

```bash
# Grant yourself read access to secrets
# Replace <subscription-id> and <key-vault-name> with your values
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee $(az ad signed-in-user show --query id -o tsv) \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group-name>/providers/Microsoft.KeyVault/vaults/<key-vault-name>
```

**2. Generate a webhook authentication secret:**

```powershell
# PowerShell - generates a 64-character random string
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

```bash
# Bash - generates a 64-character hex string
openssl rand -hex 32
```

**3. Update `.env.local.azure`:**

Replace the placeholder values:

- `GRAPH_CLIENT_SECRET=<GET_FROM_KEY_VAULT>` → paste the value from step 1
- `WEBHOOK_AUTH_SECRET=<REPLACE_ME>` → paste the value from step 2

Your `.env.local.azure` is now complete with:

- ✅ Application credentials (tenant ID, client ID, client secret)
- ✅ Event Grid endpoint and key
- ✅ Application Insights instrumentation key
- ✅ Key Vault configuration
- ✅ Storage account details
- ✅ Webhook authentication secret

#### Security Notes

- **RBAC-Only**: Storage account uses Azure AD authentication only (no access keys)
- **Key Vault**: All secrets stored in Key Vault with RBAC access control
- **Managed Identity**: Deployment uses service principal authentication
- **No Keys in Code**: All credentials loaded from environment variables or Key Vault

---

### AWS Lambda Deployment

The AWS Lambda webhook processor is deployed with Terraform:

```bash
cd iac/aws

# Configure AWS CLI with profile (recommended)
aws configure --profile tmf-dev

# Update terraform.tfvars with your AWS configuration

terraform init
terraform plan
terraform apply
```

This creates:

- S3 bucket for webhook payloads
- Lambda function to process incoming webhooks
- API Gateway endpoint for webhook delivery
- IAM roles and policies

After deployment:

```powershell
./scripts/generate-aws-env.ps1  # PowerShell
```

```bash
./scripts/generate-aws-env.sh   # Bash
```

Test the webhook endpoint:

```powershell
$body = '{"value":[{"subscriptionId":"test","changeType":"created","resource":"/users/test/events/123"}]}'
Invoke-WebRequest -Uri "https://<api-gateway-url>/dev/graph" -Method POST -Body $body -ContentType "application/json"
```

---

### Production Checklist

- [ ] Create `.env` file with all required variables
- [ ] Ensure HTTPS is configured (required for webhooks)
- [ ] Test webhook delivery with sample payload
- [ ] Configure log rotation
- [ ] Set up monitoring/alerting
- [ ] Backup database periodically
- [ ] Plan for subscription renewal (29-day TTL on webhooks)
- [ ] If using Azure: Review [Infrastructure Terraform Specification](./specs/infrastructure-terraform-spec.md) for security best practices
- [ ] If using Azure: Grant admin consent for Graph API permissions
- [ ] If using Azure: Retrieve client secret from Key Vault

### Recommended: HTTPS via Reverse Proxy

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Documentation

- **[Full Specification](./specs/system-specification.md)** - Complete system design
- **[Setup Guide](./specs/setup-guide.md)** - Step-by-step configuration
- **[API Reference](./specs/docs/api-reference.md)** - Endpoint documentation
- **[Webhook Specification](./specs/docs/webhook-specification.md)** - Webhook implementation
- **[Usage Examples](./specs/docs/usage-examples.md)** - Code samples
- **[Architecture](./docs/ARCHITECTURE.md)** - Component diagrams (TBD)
- **[Troubleshooting](./docs/TROUBLESHOOTING.md)** - Common issues (TBD)

### Environment Generation (IaC)

After applying Terraform, generate local env files:

```powershell
./scripts/generate-aws-env.ps1
./scripts/generate-azure-env.ps1
```

```bash
./scripts/generate-aws-env.sh
./scripts/generate-azure-env.sh
```

---

## Workflow Overview

```
1. Schedule Meeting
   ↓ (Organizer schedules in Teams)
   ↓
2. Graph Notification Sent
   ↓ (Microsoft sends event to webhook)
   ↓
3. External App Receives Webhook
   ↓ (validates Bearer token)
   ↓
4. Fetch Event Details
   ↓ (verify organizer in target Entra group)
   ↓
5. Store Meeting Record
   ↓ (database)
   ↓
6. Meeting Recorded
   ↓ (organizer records meeting in Teams)
   ↓
7. Graph Notification - Recording Available
   ↓
8. Poll for Transcription
   ↓ (every 30 seconds)
   ↓
9. Transcription Ready
   ↓
10. Fetch & Store Transcription
    ↓ (from Graph API)
    ↓
11. UI Shows Transcription
    ↓ (ready for view/download)
```

---

## FAQ

**Q: Do I need Azure?**  
A: No, Azure is optional. We only use Microsoft Graph API, authenticated with Entra credentials. However, for production deployments, the [Infrastructure Terraform Specification](./specs/infrastructure-terraform-spec.md) provides enterprise-grade Azure infrastructure with networking, security, monitoring, and managed identities.

**Q: Can I run this on-premises?**  
A: Yes. Deploy the Docker container or Node.js app on any server with outbound HTTPS access to Graph API. See [Setup Guide](./specs/setup-guide.md) for details.

**Q: What if a webhook is missed?**  
A: Transcriptions are polled every 30 seconds as backup. Webhooks are best-effort; polling ensures we don't miss anything.

**Q: How are webhooks secured?**  
A: Bearer token in `Authorization` header, validated on every request. HTTPS required.

**Q: Can I watch all meetings or just specific groups?**  
A: Specific Entra groups. You can add multiple groups by modifying the configuration.

**Q: Where are transcriptions stored?**  
A: SQLite database (local file). Optional: export to external storage or database.

---

## Support

For issues, questions, or contributions:

1. Check [Setup Guide](./specs/setup-guide.md) troubleshooting section
2. Review [Usage Examples](./specs/docs/usage-examples.md)
3. Open an issue on GitHub

---

## License

MIT

---

## Roadmap

- [x] Specification
- [x] Architecture design
- [ ] Backend implementation
- [ ] UI dashboard
- [ ] Integration tests
- [ ] Deployment guides
- [ ] Multi-tenant support (future)
- [ ] Email notifications (future)
