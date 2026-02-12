# Configuration Guide for Teams Meeting Fetcher

Complete guide to configuring Teams Meeting Fetcher for development and production environments.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Files](#environment-files)
3. [Graph API Configuration](#graph-api-configuration)
4. [Server Configuration](#server-configuration)
5. [Database Configuration](#database-configuration)
6. [Azure Integration](#azure-integration)
7. [AWS Integration](#aws-integration)
8. [Security Best Practices](#security-best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Development Setup

```bash
# Clone repository
git clone <repo>
cd teams-meeting-fetcher

# Install dependencies
npm install

# Create development environment file
cp .env.example .env.development.local

# Edit with your test tenant values
nano .env.development.local

# Start development server
npm run dev
```

### 2. Production Setup

```bash
# Create production environment file
cp .env.example .env

# Edit with your production values
nano .env

# Install production dependencies
npm install --production

# Build and start
npm run build
npm start
```

---

## Environment Files

### Hierarchy

Environment files are loaded in this order (later overrides earlier):

1. `.env` (base configuration)
2. `.env.{NODE_ENV}` (e.g., `.env.development`, `.env.production`)
3. `.env.local` (local overrides)
4. `.env.{NODE_ENV}.local` (e.g., `.env.development.local`)

### Examples Provided

- **`.env.example`** - All possible configuration options with descriptions
- **`.env.development.example`** - Dev-friendly defaults (shorter polling, verbose logging)
- **`.env.local.template`** - Local overrides for AWS deployments (generated values + secrets)
- **`.env.local.azure.template`** - Local overrides for Azure deployments (generated values + secrets)

### Never Commit

These files **must NEVER be committed**:

```
.env
.env.*.local
```

They contain secrets and are already in `.gitignore`.

---

## Graph API Configuration

### Prerequisites

1. Entra tenant with admin access
2. App registration created (see `Setup Guide`)
3. Graph API permissions granted (admin consent)

### Required Variables

```bash
# Your Azure tenant ID
GRAPH_TENANT_ID=12345678-1234-1234-1234-123456789012

# Your app registration client ID
GRAPH_CLIENT_ID=87654321-4321-4321-4321-210987654321

# Your app registration client secret
GRAPH_CLIENT_SECRET=super-secret-value

# Target Entra group ID (whose members' meetings to track)
ENTRA_GROUP_ID=11111111-1111-1111-1111-111111111111
```

### Finding These Values

**Tenant ID**:

```bash
az account show --query tenantId
```

**Client ID & Client Secret**:

- Azure Portal → Azure AD → App registrations → Your app
- Copy: Application (client) ID
- Client secret is shown only once during creation

**Group ID**:

```bash
az ad group show --group "Group Name" --query id
```

### Testing Configuration

```bash
# Test Graph API authentication
npm run test:graph-auth

# This will verify credentials and permissions
```

---

## Server Configuration

### Port and Protocol

```bash
# Server port (default: 3000)
PORT=3000

# Enable HTTPS (required for production webhooks)
HTTPS_ENABLED=true
HTTPS_CERT_PATH=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
HTTPS_KEY_PATH=/etc/letsencrypt/live/yourdomain.com/privkey.pem

# For local development without HTTPS:
HTTPS_ENABLED=false
```

### Logging

```bash
# Log level (debug, info, warn, error)
LOG_LEVEL=info

# For development, use detailed logging:
LOG_LEVEL=debug
LOG_FORMAT=text

# For production, use structured logging:
LOG_LEVEL=info
LOG_FORMAT=json

# Log file paths
LOG_FILE_PATH=./logs/app.log
LOG_MAX_FILES=10
LOG_MAX_SIZE=10m
```

### Node Environment

```bash
# Affects performance, error handling, and features
NODE_ENV=production  # or: development, staging

# Production adds:
# - Stricter error handling
# - Optimized performance
# - Security headers
# - Structured logging
```

---

## Database Configuration

### SQLite (Default, Development)

```bash
DATABASE_ENGINE=sqlite
DATABASE_PATH=./data/meetings.db

# SQLite uses file-based storage, suitable for:
# - Development
# - Single-server deployments
# - < 1GB data
```

### PostgreSQL (Production)

```bash
DATABASE_ENGINE=postgresql
DATABASE_URL=postgresql://user:password@localhost:5432/teams_meetings

# Or individual components:
DATABASE_HOST=db.example.com
DATABASE_PORT=5432
DATABASE_NAME=teams_meetings
DATABASE_USER=app_user
DATABASE_PASSWORD=secure_password
DATABASE_SSL=true
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

### MySQL/MariaDB

```bash
DATABASE_ENGINE=mysql
DATABASE_HOST=db.example.com
DATABASE_PORT=3306
DATABASE_NAME=teams_meetings
DATABASE_USER=app_user
DATABASE_PASSWORD=secure_password
```

### Database Initialization

```bash
# Migrations run automatically on startup
npm run db:migrate

# Manual migration if needed
npm run db:migrate:up
npm run db:migrate:down
```

---

## Azure Integration

### Event Grid (optional)

For publishing transcript-ready events to Azure Event Grid:

```bash
# Enable Event Grid integration
EVENTGRID_ENABLED=true

# Event Grid topic details
EVENTGRID_URI=https://tmf-events.eventgrid.azure.net/api/events
EVENTGRID_KEY=your-event-grid-access-key

# Get these from Azure Portal after deploying Event Grid
```

Generate `.env.local.azure` from Terraform outputs:

```powershell
./scripts/generate-azure-env.ps1
```

```bash
./scripts/generate-azure-env.sh
```

### Key Vault (for secure credential storage)

Instead of storing secrets in `.env`, use Azure Key Vault:

```bash
# Enable Key Vault integration
AZURE_KEYVAULT_ENABLED=true

# Key Vault URL
AZURE_KEYVAULT_URL=https://your-keyvault.vault.azure.net/

# Requires: Managed Identity or Service Principal credentials
AZURE_TENANT_ID=12345678-1234-1234-1234-123456789012
AZURE_CLIENT_ID=87654321-4321-4321-4321-210987654321
AZURE_CLIENT_SECRET=your-secret-or-use-managed-identity

# When using Key Vault, these are retrieved automatically:
# - graph-client-secret
# - entra-group-id
# - webhook-auth-secret
# - eventgrid-key
```

---

## AWS Integration

### Lambda Integration

For webhook processing via AWS Lambda + API Gateway:

```bash
# AWS Lambda webhook endpoint
AWS_WEBHOOK_ENDPOINT=https://random.execute-api.us-east-1.amazonaws.com/prod/graph

# Authentication for Event Grid → AWS
AWS_API_KEY=your-api-gateway-api-key
AWS_REGION=us-east-1
```

Generate `.env.local` from Terraform outputs:

```powershell
./scripts/generate-aws-env.ps1
```

```bash
./scripts/generate-aws-env.sh
```

### AWS Credentials

Lambda will use IAM role-based credentials automatically. No explicit credentials needed in `.env`.

---

## Webhook Configuration

### Webhook Security

```bash
# Bearer token for webhook authentication
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
WEBHOOK_AUTH_SECRET=random-32-char-token-here

# Algorithm (only Bearer supported)
WEBHOOK_AUTH_ALGORITHM=bearer
```

### Webhook Endpoint

The webhook runs at:

```
POST https://yourdomain.com/api/webhooks/graph
Authorization: Bearer {WEBHOOK_AUTH_SECRET}

# In Graph API subscriptions, configure:
# notificationUrl: https://yourdomain.com/api/webhooks/graph
# clientState: (Graph will echo this back in notifications for validation)
```

### Testing Webhook Locally

Use ngrok to expose local server:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Create ngrok tunnel
ngrok http 3000

# Terminal 3: Send test webhook
curl -X POST https://random.ngrok.io/api/webhooks/graph \
  -H "Authorization: Bearer $WEBHOOK_AUTH_SECRET" \
  -H "Content-Type: application/json" \
  -d @test-webhook-payload.json
```

---

## Polling Configuration

### Transcription Polling

```bash
# How often to check if transcription is ready (milliseconds)
TRANSCRIPTION_POLL_INTERVAL_MS=30000  # 30 seconds (production)
TRANSCRIPTION_POLL_INTERVAL_MS=10000  # 10 seconds (development)

# Maximum number of retry attempts
TRANSCRIPTION_MAX_RETRIES=40  # ~20 minutes with 30-second interval

# Stop polling if timeout or error
TRANSCRIPTION_POLL_TIMEOUT_MS=1200000  # 20 minutes
```

### Membership Polling

```bash
# How often to check for group membership changes
GROUP_MEMBERSHIP_CHECK_INTERVAL_MS=86400000  # 24 hours
```

---

## Security Best Practices

### 1. Secrets Management

**Never store in `.env`:**

- Production credentials
- API keys
- Client secrets

**Use instead:**

- ✅ Azure Key Vault (Azure deployments)
- ✅ AWS Secrets Manager (AWS deployments)
- ✅ HashiCorp Vault (self-hosted)
- ✅ GitHub Secrets (CI/CD pipelines)

### 2. HTTPS/TLS

```bash
# Production MUST use HTTPS
HTTPS_ENABLED=true

# Use Let's Encrypt free certificates
# Install certbot and auto-renew
```

### 3. Bearer Token

```bash
# Generate strong random token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Rotate quarterly
WEBHOOK_AUTH_SECRET=new-random-token
```

### 4. Database Credentials

```bash
# Never hardcode in code
# Use environment variables only
# Rotate credentials regularly
```

### 5. Entra Group Permissions

```bash
# Only expose necessary permissions to Graph API
# Application permissions (not delegated) ensure:
# - Service reads group calendar events
# - No user impersonation
# - Audit trail in Azure AD

# Permissions granted:
# - GroupMember.Read.All (enumerate members)
# - Calendars.Read.All (read member calendars)
# - OnlineMeetingRecording.Read.All (access recordings)
# - CallTranscripts.Read.All (access transcripts)
```

### 6. Monitoring & Alerts

```bash
# Enable error tracking
SENTRY_ENABLED=true
SENTRY_DSN=https://key@sentry.io/your-project

# Enable application monitoring
APPINSIGHTS_ENABLED=true
APPINSIGHTS_INSTRUMENTATION_KEY=your-key

# Email alerts
SLACK_NOTIFICATIONS_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK
```

---

## Environment-Specific Examples

### Development (Local Machine)

```bash
NODE_ENV=development
PORT=3000
HTTPS_ENABLED=false
LOG_LEVEL=debug
LOG_FORMAT=text
DATABASE_ENGINE=sqlite
DATABASE_PATH=./data/meetings-dev.db
TRANSCRIPTION_POLL_INTERVAL_MS=10000
```

### Staging (Pre-production)

```bash
NODE_ENV=staging
PORT=3000
HTTPS_ENABLED=true
LOG_LEVEL=info
LOG_FORMAT=json
DATABASE_ENGINE=postgresql
TRANSCRIPTION_POLL_INTERVAL_MS=30000
SENTRY_ENABLED=true
APPINSIGHTS_ENABLED=true
```

### Production (Azure Container Apps)

```bash
NODE_ENV=production
PORT=3000
HTTPS_ENABLED=true
LOG_LEVEL=warn
LOG_FORMAT=json
DATABASE_ENGINE=postgresql
DATABASE_URL=postgresql://user:pass@prod-db:5432/teams_meetings
AZURE_KEYVAULT_ENABLED=true
EVENTGRID_ENABLED=true
SENTRY_ENABLED=true
APPINSIGHTS_ENABLED=true
```

### Production (AWS Lambda)

```bash
NODE_ENV=production
LOG_LEVEL=warn
LOG_FORMAT=json
AWS_REGION=us-east-1
DATABASE_ENGINE=postgresql
# Use AWS RDS for database
# Use AWS Secrets Manager for secrets
# Use CloudWatch for logs (automatic)
```

---

## Troubleshooting

### "Invalid credentials" error

```bash
# Verify Graph credentials
export GRAPH_TENANT_ID=...
export GRAPH_CLIENT_ID=...
export GRAPH_CLIENT_SECRET=...

# Test with Azure CLI
az login --service-principal -u $GRAPH_CLIENT_ID -p $GRAPH_CLIENT_SECRET --tenant $GRAPH_TENANT_ID
```

### "Webhook authentication failed"

```bash
# Check Bearer token in request
# Should be: Authorization: Bearer {value}

# Test locally:
curl -X POST http://localhost:3000/api/webhooks/graph \
  -H "Authorization: Bearer YOUR_WEBHOOK_AUTH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### "Group not found"

```bash
# Verify group exists and user has access
az ad group show --group "Group Name"

# Get group members
az ad group member list --group "Group Name"
```

### "Event Grid connection failed"

```bash
# Check Event Grid credentials
EVENTGRID_URI=...
EVENTGRID_KEY=...

# Test connectivity
curl -X POST $EVENTGRID_URI \
  -H "aeg-sas-key: $EVENTGRID_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"eventType": "test", "dataVersion": "1.0", "data": {}}]'
```

### "Database connection failed"

```bash
# For PostgreSQL
psql postgresql://user:password@host:port/database

# For MySQL
mysql -h host -u user -p database

# Check connection string format
# postgresql://user:password@host:port/database
```

---

## Configuration Validation

Validate configuration on startup:

```bash
# Runs automatically:
npm start

# Or manually test:
npm run validate:config

# This checks:
# ✓ Required environment variables set
# ✓ Graph API credentials valid
# ✓ Database connection working
# ✓ HTTPS certificates valid
# ✓ Event Grid accessible
# ✓ AWS credentials valid
```

---

## Updating Configuration

### Without Restarting

Some settings can be updated without restarting:

- Log level
- Webhook auth secret (after next Graph subscription check)
- Polling intervals

### Requires Restart

Database connection, server port, HTTPS certificates require application restart.

### Via Dashboard

For future UI dashboard, configuration can be updated via management UI for non-critical settings.
