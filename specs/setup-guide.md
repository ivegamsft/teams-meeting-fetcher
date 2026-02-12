# Teams Meeting Fetcher - Setup Guide

This guide walks you through setting up the Teams Meeting Fetcher from scratch.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Create App Registration in Entra](#step-1-create-app-registration)
3. [Configure App Permissions](#step-2-configure-permissions)
4. [Create Entra Group](#step-3-create-entra-group)
5. [Generate Secrets](#step-4-generate-secrets)
6. [Deploy External App](#step-5-deploy-external-app)
7. [Deploy Teams App](#step-6-deploy-teams-app)
8. [Verify Setup](#step-7-verify-setup)

---

## Prerequisites

- **Microsoft 365 tenant** with admin access
- **Entra ID admin role** (to create app registrations)
- **Teams admin role** (to deploy Teams app)
- **Server or hosting provider** for external application
- **HTTPS certificate** (Let's Encrypt recommended)
- **Node.js 18+** installed locally or on server
- **Domain name** pointing to your server
- **Docker** (optional, recommended for deployment)

---

## Step 1: Create App Registration

### 1.1 Sign in to Entra Admin Center

1. Go to https://entra.microsoft.com
2. Sign in with your admin account
3. Navigate to **Manage → Applications → App registrations**

### 1.2 Create New Registration

1. Click **+ New registration**
2. Fill in:
   - **Name**: `Teams Meeting Fetcher` (or your choice)
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI**: Leave blank for now
3. Click **Register**

### 1.3 Save Credentials

After registration, you'll see the app details. **Save these values** (you'll need them):

```bash
# Copy these from the Overview page
GRAPH_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx     # Directory (tenant) ID
GRAPH_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx     # Application (client) ID
```

### 1.4 Generate Client Secret

1. In the app registration, go to **Manage → Certificates & secrets**
2. Click **+ New client secret**
3. Set:
   - **Description**: `Meeting Fetcher Webhook Secret`
   - **Expires**: `24 months`
4. Click **Add**
5. **Immediately copy** the secret value (shown once)

```bash
GRAPH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **Important**: This secret is shown only once. Store it securely.

---

## Step 2: Configure Permissions

### 2.1 Add API Permissions

1. In the app registration, go to **Manage → API permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph**

### 2.2 Add Each Permission

Repeat for each permission below:

**Permission**: Calendar.Read
1. Click **+ Add a permission**
2. Select **Microsoft Graph**
3. Select **Delegated permissions** (or Application)
4. Search for `Calendar`
5. Check `Calendar.Read`
6. Click **Add permissions**

**Permission**: Calls.AccessMedia.Read
1. Same flow, search `Calls`
2. Check `Calls.AccessMedia.Read`
3. Add permission

**Permission**: OnlineMeetingArtifact.Read.All
1. Same flow, search `OnlineMeeting`
2. Check `OnlineMeetingArtifact.Read.All`
3. Add permission

**Permission**: TeamsAppInstallation.ReadWrite.All
1. Same flow, search `Teams`
2. Check `TeamsAppInstallation.ReadWrite.All`
3. Add permission

### 2.3 Grant Admin Consent

1. After adding all permissions, click **Grant admin consent for [Tenant Name]**
2. Confirm the dialog

✅ All permissions should now show as **Granted** (green checkmark)

### 2.4 Verify Required Permissions

You should see:
```
✓ Calendar.Read
✓ Calls.AccessMedia.Read
✓ OnlineMeetingArtifact.Read.All
✓ TeamsAppInstallation.ReadWrite.All
```

---

## Step 3: Create Entra Group

The system monitors all **calendar events for members of a specific Entra group**.

### 3.1 Create Group

1. In Entra Admin Center, navigate to **Manage → Groups → All groups**
2. Click **+ New group**
3. Fill in:
   - **Group type**: `Microsoft 365` (or `Security` for simpler case)
   - **Group name**: `Teams Meeting Monitors` (or your choice)
   - **Group email address**: `teams-meeting-monitors@yourtenant.onmicrosoft.com`
   - **Description**: `Members' meetings are monitored for recording & transcription`
4. Click **Create**

### 3.2 Add Members

1. Open the newly created group
2. Go to **Members**
3. Click **+ Add members**
4. Search and add users whose meetings you want to monitor
5. Click **Assign**

⚠️ **Important**: These should be the **meeting organizers** whose meetings you want to monitor.

### 3.3 Save Group ID

1. Go back to the group overview
2. Copy the **Object ID** from the page details

```bash
ENTRA_GROUP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## Step 4: Generate Secrets

Generate the webhook authentication secret (random, secure token):

### 4.1 Generate on macOS/Linux

```bash
# Option 1: OpenSSL
export WEBHOOK_AUTH_SECRET=$(openssl rand -hex 32)
echo $WEBHOOK_AUTH_SECRET

# Option 2: Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 4.2 Generate on Windows (PowerShell)

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
$rng.GetBytes($bytes)
$WEBHOOK_AUTH_SECRET = [BitConverter]::ToString($bytes).Replace('-', '').ToLower()
Write-Host $WEBHOOK_AUTH_SECRET
```

Save this value:

```bash
WEBHOOK_AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Step 5: Deploy External App with API Manager

### 5.1 Clone Repository

```bash
git clone <repository-url>
cd teams-meeting-fetcher
cd external-app
```

### 5.0 Set Up API Manager for Webhook Bearer Token Validation

The webhook endpoint requires Bearer token validation. Choose your approach:

#### Option A: Use Existing Corporate API Manager (Kong, AWS API Gateway, Azure APIM, etc.)

1. Configure API Manager to validate `Authorization: Bearer` header against your webhook secret
2. Point it to your Node.js app (localhost:3000 or internal network)
3. Proceed to Step 5.2

#### Option B: Docker with nginx (Development/Self-Hosted)

Create `docker-compose.yml` in project root:

```yaml
version: '3.8'
services:
  nginx:
    image: nginx:alpine
    container_name: teams-meeting-fetcher-nginx
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro  # Mount certs
    environment:
      - WEBHOOK_AUTH_SECRET=${WEBHOOK_AUTH_SECRET}
    networks:
      - internal
    depends_on:
      - app

  app:
    build: ./external-app
    container_name: teams-meeting-fetcher-app
    ports:
      - "3000:3000"
    environment:
      - GRAPH_TENANT_ID=${GRAPH_TENANT_ID}
      - GRAPH_CLIENT_ID=${GRAPH_CLIENT_ID}
      - GRAPH_CLIENT_SECRET=${GRAPH_CLIENT_SECRET}
      - ENTRA_GROUP_ID=${ENTRA_GROUP_ID}
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - ./data:/app/data
    networks:
      - internal

networks:
  internal:
    driver: bridge
```

Create `nginx.conf` for Bearer token validation:

```nginx
http {
    map $http_authorization $auth_header {
        ~^Bearer\ (.+)$ $1;
    }

    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

        # Webhook endpoint with Bearer token validation
        location /api/webhooks/graph {
            # Validate Bearer token
            if ($http_authorization !~ ^Bearer\ ${WEBHOOK_AUTH_SECRET}$) {
                return 401 "Unauthorized";
            }

            proxy_pass http://app:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # All other endpoints (no auth required)
        location / {
            proxy_pass http://app:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
}
```

Run with docker-compose:

```bash
# Create .env file with secrets
cat > .env <<EOF
GRAPH_TENANT_ID=your-tenant-id
GRAPH_CLIENT_ID=your-client-id
GRAPH_CLIENT_SECRET=your-client-secret
ENTRA_GROUP_ID=your-group-id
WEBHOOK_AUTH_SECRET=your-webhook-secret
EOF

# Start services
docker-compose up -d

# View logs
docker-compose logs -f app
docker-compose logs -f nginx
```
### 5.2 Create `.env` File

Create `external-app/.env` with all values from previous steps:

```bash
# Microsoft Graph API
GRAPH_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GRAPH_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GRAPH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Target Group
ENTRA_GROUP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Webhook Security
WEBHOOK_AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Server Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
EXTERNAL_WEBHOOK_URL=https://your-domain.com/api/webhooks/graph

# Database
DATABASE_PATH=./data/meetings.db

# Graph Polling Configuration
TRANSCRIPTION_POLL_INTERVAL_MS=30000
TRANSCRIPTION_MAX_RETRIES=40
WEBHOOK_SUBSCRIPTION_TTL_DAYS=29
```

⚠️ **Important**: 
- Replace `your-domain.com` with your actual domain
- Never commit `.env` to git (already in `.gitignore`)
- Keep webhook auth secret secure

### 5.3 Install Dependencies

```bash
npm install
```

### 5.4 Build Application

```bash
npm run build
```

### 5.5 Test Locally

```bash
npm start
```

You should see:
```
✓ Server running on port 3000
✓ Database initialized
✓ Subscriptions renewed (or created)
```

### 5.6 Deploy to Production

#### Option A: Docker (Recommended)

```bash
# From project root
docker build -t teams-meeting-fetcher .

# Run container
docker run -d \
  --name teams-meeting-fetcher \
  -e GRAPH_TENANT_ID=... \
  -e GRAPH_CLIENT_ID=... \
  -e GRAPH_CLIENT_SECRET=... \
  -e ENTRA_GROUP_ID=... \
  -e WEBHOOK_AUTH_SECRET=... \
  -e EXTERNAL_WEBHOOK_URL=https://your-domain.com/api/webhooks/graph \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  teams-meeting-fetcher
```

#### Option B: Node.js Service (Linux with Systemd)

1. Create `/opt/teams-meeting-fetcher/` directory
2. Copy built files and `package.json`
3. Create systemd service file `/etc/systemd/system/teams-meeting-fetcher.service`:

```ini
[Unit]
Description=Teams Meeting Fetcher
After=network.target

[Service]
Type=simple
User=appuser
WorkingDirectory=/opt/teams-meeting-fetcher
EnvironmentFile=/opt/teams-meeting-fetcher/.env
ExecStart=/usr/bin/node /opt/teams-meeting-fetcher/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

4. Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable teams-meeting-fetcher
sudo systemctl start teams-meeting-fetcher

# Check status
sudo systemctl status teams-meeting-fetcher
```

#### Option C: Microsoft Azure App Service

If you prefer cloud hosting (optional):

```bash
az webapp up --name teams-meeting-fetcher --runtime "node|18"
```

This is optional but gives you managed HTTPS and easy scaling.

### 5.7 Set Up HTTPS with API Manager

Your webhook endpoint **must be HTTPS**. 

#### For docker-compose Setup

Certificates are already mounted in docker-compose.yml. Generate them:

```bash
# Using Let's Encrypt certbot
sudo certbot certonly --standalone -d your-domain.com

# Then docker-compose mounts them at /etc/letsencrypt
docker-compose up -d
```

#### For Standalone API Manager

Configure your API Manager (Kong, AWS API Gateway, etc.) with HTTPS and Bearer token validation.

### 5.8 Verify Deployment

```bash
# Check health endpoint
curl https://your-domain.com/health

# Expected response:
# {
#   "status": "healthy",
#   "graphApi": "connected",
#   "database": "connected"
# }
```

---

## Step 6: Deploy Teams App

### 6.1 Prepare Teams App Manifest

Edit `teams-app/manifest.json`:

```json
{
  "version": "1.0.0",
  "manifestVersion": "1.13",
  "id": "12345678-1234-1234-1234-123456789abc",
  "name": {
    "short": "Meeting Fetcher",
    "full": "Teams Meeting Fetcher"
  },
  "description": {
    "short": "Record and transcribe Teams meetings",
    "full": "Automatically records Teams meetings and fetches transcriptions."
  },
  "webApplicationInfo": {
    "id": "<GRAPH_CLIENT_ID>",
    "resource": "api://your-domain.com/<GRAPH_CLIENT_ID>"
  },
  "composeExtensions": [...],
  "menus": {...},
  "permissions": ["identity", "identity.user"],
  "validDomains": ["your-domain.com"],
  "icons": {
    "color": "public/icon-color.png",
    "outline": "public/icon-outline.png"
  }
}
```

Replace:
- `<GRAPH_CLIENT_ID>` with your client ID
- `your-domain.com` with your domain
- Generate a unique UUID for `id` field

### 6.2 Upload to Teams Admin Center

1. Go to https://admin.teams.microsoft.com
2. Navigate to **Manage apps → Upload a custom app**
3. Select `teams-app/manifest.json`
4. Choose how to distribute:
   - **Whole organization** (recommended for testing)
   - **Specific teams/users**
5. Click **Publish**

### 6.3 Install in Teams

Users can now:
1. Open Microsoft Teams
2. Go to **Apps**
3. Search for "Meeting Fetcher"
4. Click **Add** or **Open**

---

## Step 7: Verify Setup

### 7.1 Check Webhook Subscription

```bash
curl https://your-domain.com/health

# Response should show:
{
  "status": "healthy",
  "graphApi": "connected",
  "database": "connected",
  "webhookUrl": "https://your-domain.com/api/webhooks/graph"
}
```

### 7.2 Test Webhook via API Manager

Test that Bearer token validation works:

```bash
# Test with correct token (API Manager validates, forwards to app)
curl -X POST "https://your-domain.com/api/webhooks/graph" \
  -H "Authorization: Bearer YOUR_WEBHOOK_AUTH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"value": [{"subscriptionId": "test-123"}]}'

# Expected: 200 OK

# Test with wrong token (API Manager rejects)
curl -X POST "https://your-domain.com/api/webhooks/graph" \
  -H "Authorization: Bearer wrong-token" \
  -H "Content-Type: application/json" \
  -d '{"value": []}'

# Expected: 401 Unauthorized (from API Manager/nginx)

# For docker-compose, use docker exec:
docker exec teams-meeting-fetcher-nginx curl http://app:3000/health
```

### 7.3 Schedule a Test Meeting

1. Have a member of the Entra group schedule a Teams meeting
2. Start the meeting and enable recording
3. Wait for transcription (may take several minutes)
4. Check the UI at `https://your-domain.com`

### 7.4 Verify in Database

```bash
# SSH into server
sqlite3 /opt/teams-meeting-fetcher/data/meetings.db

# List meetings
SELECT subject, status, transcription_status FROM meetings;

# List transcriptions
SELECT id, status FROM transcriptions;
```

### 7.5 Check Logs

```bash
# If using systemd
journalctl -u teams-meeting-fetcher -f

# If using Docker
docker logs -f teams-meeting-fetcher

# If running locally
npm start
```

---

## Troubleshooting

### Issue: "401 Unauthorized" on webhook

**Cause**: Bearer token mismatch

**Solution**:
1. Verify `WEBHOOK_AUTH_SECRET` in `.env`
2. Verify Microsoft Graph is sending correct header
3. Check logs for token validation error

### Issue: Transcription not fetching

**Cause**: Transcription not yet available from Graph API

**Solution**:
1. Wait 2-5 minutes after meeting ends
2. Check logs for polling errors
3. Verify Graph permissions (Calls.AccessMedia.Read, OnlineMeetingArtifact.Read.All)

### Issue: Webhook never received

**Cause**: Subscription not created or HTTPS not accessible

**Solution**:
1. Check `GET /health` endpoint reachability
2. Verify HTTPS certificate is valid
3. Check firewall/network ACLs
4. Review logs for subscription creation errors
5. Verify webhook URL in app registration

### Issue: "Insufficient permissions" error

**Cause**: Graph API permissions not granted

**Solution**:
1. Go back to Step 2
2. Verify all 4 permissions are added and granted
3. Wait 5 minutes for permissions to propagate
4. Restart the application

### Issue: Entra group members not monitored

**Cause**: ENTRA_GROUP_ID incorrect

**Solution**:
1. Verify group exists in Entra
2. Copy exact Object ID
3. Update `.env` 
4. Restart application
5. Check logs for subscription creation

---

## Post-Deployment

### Monitoring

Set up alerts for:
- Application crashes (systemd or Docker)
- Webhook delivery failures
- Database connection issues
- Graph API quota exceeded

### Backups

```bash
# Backup database daily
0 2 * * * sqlite3 /opt/teams-meeting-fetcher/data/meetings.db ".backup '/backup/meetings-$(date +\%Y\%m\%d).db'"
```

### Renewal

- **Graph API subscriptions**: Auto-renewed every 28 days (check logs)
- **SSL certificates**: Auto-renewed via certbot
- **Secrets**: Rotate WEBHOOK_AUTH_SECRET annually

### Scaling

For many concurrent meetings:
- Move database to PostgreSQL (modify code)
- Add reverse proxy load balancer
- Deploy multiple app instances

---

## Next Steps

1. ✅ Configure user permissions in the UI
2. ✅ Set up monitoring/alerting
3. ✅ Plan backup strategy
4. ✅ Document your deployment
5. ✅ Train users on the Teams app

---

## Getting Help

- Check [Troubleshooting](../docs/TROUBLESHOOTING.md)
- Review [Examples](../docs/EXAMPLES.md)
- Check application logs
- Create an issue on GitHub

---

## Security Checklist

- [ ] `.env` file is in `.gitignore`
- [ ] WEBHOOK_AUTH_SECRET is 32+ characters
- [ ] HTTPS certificate is valid and auto-renewing
- [ ] Graph API permissions are minimal (least privilege)
- [ ] Database file has restricted permissions (600)
- [ ] Application runs as non-root user
- [ ] Logs don't contain sensitive data
- [ ] Backup includes encrypted secrets

