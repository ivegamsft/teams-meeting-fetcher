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

### Production Checklist

- [ ] Create `.env` file with all required variables
- [ ] Ensure HTTPS is configured (required for webhooks)
- [ ] Test webhook delivery with sample payload
- [ ] Configure log rotation
- [ ] Set up monitoring/alerting
- [ ] Backup database periodically
- [ ] Plan for subscription renewal (29-day TTL on webhooks)
- [ ] If using Azure: Review [Infrastructure Terraform Specification](./specs/infrastructure-terraform-spec.md) for security best practices

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

