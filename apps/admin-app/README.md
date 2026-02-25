# Admin App -- Teams Meeting Fetcher

Express.js/TypeScript backend for the Teams Meeting Fetcher admin dashboard. Provides a web UI and REST API for managing Graph webhook subscriptions, viewing meetings and transcripts, and monitoring pipeline health.

## Quick Start

```bash
cd apps/admin-app

# Install dependencies
npm install

# Create env file from template
cp .env.example .env.development

# Run in development mode (auto-reload)
npm run dev

# Build for production
npm run build
npm start
```

The app listens on port 3000 by default. Open `http://localhost:3000` for the dashboard UI.

---

## Architecture

See [docs/ADMIN_APP_ARCHITECTURE.md](../../docs/ADMIN_APP_ARCHITECTURE.md) for detailed architecture, data flow, and component diagrams.

### Key Components

| Layer | Directory | Purpose |
|-------|-----------|---------|
| Routes | `src/routes/` | Express route handlers (REST API endpoints) |
| Services | `src/services/` | Business logic: meetings, transcripts, subscriptions, sanitization |
| Stores | `src/services/*Store.ts` | Data access layer (DynamoDB read/write) |
| Config | `src/config/` | Environment config, DynamoDB/S3/Graph client setup |
| Middleware | `src/middleware/` | Auth (API key, Entra OIDC, webhook Bearer), error handling |
| Models | `src/models/` | TypeScript interfaces for domain objects |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check (status, uptime, version) |
| GET | `/api/config` | API key / OIDC | Get app configuration |
| PUT | `/api/config` | API key / OIDC | Update configuration |
| GET | `/api/config/health` | API key / OIDC | Detailed health (Graph, DynamoDB) |
| GET | `/api/subscriptions` | API key / OIDC | List Graph webhook subscriptions |
| GET | `/api/subscriptions/:id` | API key / OIDC | Get subscription by ID |
| POST | `/api/subscriptions` | API key / OIDC | Create new subscription |
| PATCH | `/api/subscriptions/:id/renew` | API key / OIDC | Renew subscription |
| DELETE | `/api/subscriptions/:id` | API key / OIDC | Delete subscription |
| POST | `/api/subscriptions/sync-group` | API key / OIDC | Sync Entra group members |
| GET | `/api/meetings` | API key / OIDC | List meetings (filterable) |
| GET | `/api/meetings/:id` | API key / OIDC | Get meeting by ID |
| GET | `/api/meetings/:id/transcript` | API key / OIDC | Get meeting transcript |
| GET | `/api/meetings/:id/transcript/download` | API key / OIDC | Download transcript as VTT |
| GET | `/api/transcripts` | API key / OIDC | List transcripts |
| GET | `/api/transcripts/:id` | API key / OIDC | Get transcript by ID |
| POST | `/api/webhooks/graph` | Bearer token | Receive Graph change notifications |
| GET | `/auth/login` | None | Initiate Entra OIDC login |
| GET/POST | `/auth/callback` | None | OIDC callback |
| GET | `/auth/logout` | None | Logout and redirect |
| GET | `/auth/status` | None | Check authentication status |

---

## Configuration

Copy `.env.example` and populate with your values. See [CONFIGURATION.md](../../CONFIGURATION.md) for the full configuration reference.

Key environment variables:

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `NODE_ENV` | Environment: development, test, production |
| `API_KEY` | API key for dashboard authentication |
| `GRAPH_TENANT_ID` | Microsoft Graph tenant ID |
| `GRAPH_CLIENT_ID` | Graph app client ID |
| `GRAPH_CLIENT_SECRET` | Graph app client secret |
| `ENTRA_GROUP_ID` | Monitored Entra security group |
| `DYNAMODB_*` | DynamoDB table names |
| `S3_*` | S3 bucket names for transcripts |
| `ENTRA_TENANT_ID` | Entra ID tenant for OIDC login |
| `ENTRA_CLIENT_ID` | Entra ID app client ID |

---

## Testing

The admin app has comprehensive test coverage across three layers. See **[TESTING.md](./TESTING.md)** for the full testing guide.

### Quick Commands

```bash
cd apps/admin-app

# Run all tests with coverage
npm test

# Unit tests only
npx jest --testPathPattern=unit

# Integration tests only
npx jest --testPathPattern=integration

# Single test file
npx jest test/unit/services/sanitizationService.test.ts

# Watch mode
npx jest --watch
```

### Test Summary

| Layer | Tests | Suites | What is tested |
|-------|-------|--------|----------------|
| Unit | 193 | 9 | Services, stores, middleware |
| Integration | 64 | 7 | All route endpoints via supertest |
| E2E | Scripts | -- | Live deployed app on ECS |

---

## Deployment

The admin app is deployed to AWS ECS Fargate as a Docker container.

- **ECR repository**: `tmf-admin-app-8akfpg`
- **ECS cluster/service**: `tmf-admin-app-8akfpg`
- **Port**: 3000 (public IP, no ALB)

### Build Docker Image

```bash
cd apps/admin-app
docker build -t tmf-admin-app .
```

### Run Locally with Docker

```bash
docker run -p 3000:3000 --env-file .env.development tmf-admin-app
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with ts-node-dev (auto-reload) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled app from `dist/` |
| `npm run lint` | Type-check with `tsc --noEmit` |
| `npm test` | Run all tests with coverage |
| `npm run test:integration` | Run integration tests only |
