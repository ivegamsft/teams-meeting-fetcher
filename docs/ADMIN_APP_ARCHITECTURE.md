# Admin App Architecture

Architecture documentation for the Teams Meeting Fetcher admin app (`apps/admin-app/`).

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Component Overview](#component-overview)
3. [Authentication Flow](#authentication-flow)
4. [Data Flow](#data-flow)
5. [Pipeline Integration](#pipeline-integration)
6. [Deployment Model](#deployment-model)
7. [API Endpoint Reference](#api-endpoint-reference)
8. [Environment Variables Reference](#environment-variables-reference)

---

## High-Level Architecture

```
                                 +---------------------+
                                 |   Browser / Client   |
                                 +----------+----------+
                                            |
                                   HTTPS (port 3000)
                                            |
                        +-------------------v-------------------+
                        |          ECS Fargate Task             |
                        |     (tmf-admin-app-8akfpg)            |
                        |                                       |
                        |   +-------------------------------+   |
                        |   |     Express.js Application     |   |
                        |   |                               |   |
                        |   |  +----------+ +-----------+   |   |
                        |   |  | Passport | |  Helmet   |   |   |
                        |   |  | (OIDC)   | |  CORS     |   |   |
                        |   |  +----------+ +-----------+   |   |
                        |   |                               |   |
                        |   |  +-------------------------+  |   |
                        |   |  |    Route Handlers       |  |   |
                        |   |  | /health /api/* /auth/*  |  |   |
                        |   |  +----------+--------------+  |   |
                        |   |             |                 |   |
                        |   |  +----------v--------------+  |   |
                        |   |  |    Services Layer       |  |   |
                        |   |  | meeting, transcript,    |  |   |
                        |   |  | subscription, sanitize  |  |   |
                        |   |  +----------+--------------+  |   |
                        |   |             |                 |   |
                        |   |  +----------v--------------+  |   |
                        |   |  |    Store Layer          |  |   |
                        |   |  | (DynamoDB Data Access)  |  |   |
                        |   |  +-------------------------+  |   |
                        |   +-------------------------------+   |
                        +-------------------+-------------------+
                                            |
                    +-----------------------+-----------------------+
                    |                       |                       |
           +--------v--------+    +--------v--------+    +--------v--------+
           |    DynamoDB      |    |       S3         |    |  Microsoft     |
           |                  |    |                  |    |  Graph API     |
           | - subscriptions  |    | - raw transcripts|    |                |
           | - meetings       |    | - sanitized      |    | - Entra groups |
           | - transcripts    |    |   transcripts    |    | - Meetings     |
           | - config         |    |                  |    | - Transcripts  |
           +-----------------+    +-----------------+    | - Subscriptions|
                                                          +-----------------+
```

---

## Component Overview

### Routes (`src/routes/`)

Route handlers define the REST API surface. Each route file handles a single resource domain.

| File | Prefix | Responsibility |
|------|--------|----------------|
| `index.ts` | `/api` | Router aggregation, applies `dashboardAuth` middleware |
| `auth.ts` | `/auth` | Entra OIDC login/callback/logout/status |
| `configRoute.ts` | `/api/config` | App config read/update, detailed health check |
| `subscriptions.ts` | `/api/subscriptions` | Graph webhook subscription CRUD, group sync |
| `meetings.ts` | `/api/meetings` | Meeting listing/detail, transcript access/download |
| `transcripts.ts` | `/api/transcripts` | Transcript listing and detail |
| `webhooks.ts` | `/api/webhooks` | Graph change notification ingestion |

### Services (`src/services/`)

Services implement business logic and coordinate between stores and external APIs.

| Module | Responsibility |
|--------|----------------|
| `meetingService.ts` | Meeting listing with filters, notification processing |
| `transcriptService.ts` | Transcript retrieval, S3 content fetching (raw/sanitized) |
| `graphSubscriptionService.ts` | Graph subscription lifecycle (create, renew, delete), Entra group sync |
| `sanitizationService.ts` | PII redaction using regex rules (email, phone, SSN, credit card, IP) |

### Stores (`src/services/*Store.ts`)

Stores are the data access layer. Each store wraps DynamoDB operations for a single table.

| Module | DynamoDB Table | Operations |
|--------|----------------|------------|
| `configStore.ts` | `tmf-config` | Get, put, update Entra group ID, update last webhook timestamp |
| `subscriptionStore.ts` | `graph-subscriptions` | CRUD, update last notification timestamp |
| `meetingStore.ts` | `tmf-meetings` | CRUD, scan with filters (status, organizer, date range) |
| `transcriptStore.ts` | `tmf-transcripts` | CRUD, query by meeting ID |

### Config (`src/config/`)

| Module | Purpose |
|--------|---------|
| `index.ts` | Central configuration from environment variables (dotenv) |
| `dynamodb.ts` | DynamoDB Document Client initialization |
| `s3.ts` | S3 Client initialization |
| `graph.ts` | Graph API token acquisition (client credentials) and client setup |

### Middleware (`src/middleware/`)

| Module | Purpose |
|--------|---------|
| `auth.ts` | Three auth strategies: `webhookAuth`, `dashboardAuth`, `optionalAuth` |
| `entraAuth.ts` | Passport.js Entra ID OIDC strategy configuration |
| `errorHandler.ts` | Global Express error handler |

### Models (`src/models/`)

TypeScript interfaces for domain objects: `Meeting`, `Subscription`, `Transcript`, `AppConfig`.

---

## Authentication Flow

The admin app supports two authentication methods:

### 1. API Key Authentication

For programmatic access and scripts. The client sends the API key in the `x-api-key` header.

```
Client                         Admin App
  |                                |
  |  GET /api/meetings             |
  |  x-api-key: <API_KEY>         |
  |------------------------------->|
  |                                |-- dashboardAuth middleware
  |                                |-- Compare header to config.auth.apiKey
  |                                |
  |  200 OK (meetings data)        |
  |<-------------------------------|
```

### 2. Entra ID OIDC (Browser)

For interactive dashboard access. Uses Passport.js with the `passport-azure-ad` OIDC strategy.

```
Browser                        Admin App                    Entra ID (Azure AD)
  |                                |                              |
  |  GET /auth/login               |                              |
  |------------------------------->|                              |
  |                                |  302 Redirect                |
  |  <redirect to Entra login>     |----------------------------->|
  |------------------------------->|                              |
  |                                |                              |
  |  <user authenticates>          |                              |
  |                                |  POST /auth/callback         |
  |                                |<-----------------------------|
  |                                |-- Validate ID token          |
  |                                |-- Create session             |
  |  302 Redirect to /             |                              |
  |<-------------------------------|                              |
  |                                |                              |
  |  GET /api/meetings             |                              |
  |  Cookie: session               |                              |
  |------------------------------->|                              |
  |                                |-- dashboardAuth middleware   |
  |                                |-- req.isAuthenticated()      |
  |  200 OK                        |                              |
  |<-------------------------------|                              |
```

### 3. Webhook Authentication

Graph webhook notifications use Bearer token validation:

```
Microsoft Graph                Admin App
  |                                |
  |  POST /api/webhooks/graph      |
  |  Authorization: Bearer <token> |
  |------------------------------->|
  |                                |-- webhookAuth middleware
  |                                |-- Compare to WEBHOOK_AUTH_SECRET
  |                                |
  |  200 OK                        |
  |<-------------------------------|
```

### Auth Middleware Decision Tree

```
Request arrives
  |
  +-- Path is /health or /api/auth/status?
  |     YES --> Allow (no auth required)
  |
  +-- Path starts with /api/webhooks?
  |     YES --> webhookAuth: check Bearer token
  |
  +-- Path starts with /api/?
        YES --> dashboardAuth:
                  1. Check x-api-key header
                  2. Check req.isAuthenticated() (OIDC session)
                  3. Neither? --> 401
```

---

## Data Flow

### Webhook Notification Processing

```
Graph API
  |
  |  POST /api/webhooks/graph
  |  { value: [{ subscriptionId, changeType, resource, clientState }] }
  |
  v
webhookAuth (Bearer token validation)
  |
  v
Webhook Route Handler
  |
  +-- Validate clientState matches expected value
  |
  +-- For each notification:
  |     |
  |     +-- subscriptionStore.updateLastNotification()  --> DynamoDB
  |     |
  |     +-- meetingService.processNotification()
  |           |
  |           +-- Fetch meeting details from Graph API
  |           +-- meetingStore.put()                     --> DynamoDB
  |           +-- Fetch transcript from Graph API
  |           +-- Store raw transcript                   --> S3
  |           +-- sanitizationService.sanitize()
  |           +-- Store sanitized transcript             --> S3
  |           +-- transcriptStore.put()                  --> DynamoDB
  |
  +-- configStore.updateLastWebhook()                   --> DynamoDB
```

### Transcript Retrieval

```
Client
  |
  |  GET /api/meetings/:id/transcript?type=sanitized
  |
  v
dashboardAuth
  |
  v
Meeting Route Handler
  |
  +-- transcriptService.getTranscriptByMeetingId()      --> DynamoDB
  |
  +-- transcriptService.getTranscriptContent(transcript, 'sanitized')
  |     |
  |     +-- Read from S3 (sanitized bucket)
  |
  +-- Return transcript metadata + content
```

---

## Pipeline Integration

The admin app is one component in the Teams Meeting Fetcher pipeline:

```
+------------------+      +------------------+      +------------------+
|  Teams Meeting   |      |  Microsoft Graph |      |  AWS Lambda      |
|  (User records)  |----->|  Notifications   |----->|  Webhook Handler |
+------------------+      +------------------+      +--------+---------+
                                   |                          |
                                   |                          v
                                   |                 +--------+---------+
                                   |                 |  DynamoDB / S3   |
                                   |                 +--------+---------+
                                   |                          ^
                                   v                          |
                          +--------+---------+                |
                          |   Admin App      |----------------+
                          |   (ECS Fargate)  |
                          +------------------+
                                   |
                                   v
                          +------------------+
                          |  Dashboard UI    |
                          |  (Browser)       |
                          +------------------+
```

The admin app serves as the operational dashboard:

- **Reads** meetings, subscriptions, transcripts, and config from DynamoDB
- **Reads** raw and sanitized transcript content from S3
- **Writes** new subscriptions to DynamoDB and creates them via Graph API
- **Receives** webhook notifications from Graph API for real-time processing
- **Provides** a web UI for operators to monitor and manage the pipeline

---

## Deployment Model

### Infrastructure

| Resource | Value |
|----------|-------|
| Platform | AWS ECS Fargate |
| ECR repository | `tmf-admin-app-8akfpg` |
| ECS cluster | `tmf-admin-app-8akfpg` |
| ECS service | `tmf-admin-app-8akfpg` |
| Container port | 3000 |
| Network | Public IP (no ALB) |
| Base image | `node:20-alpine` |
| Health check | `GET /health` (30s interval) |

### Container

The Dockerfile uses a multi-stage build:

1. **Builder stage**: Install all deps, compile TypeScript
2. **Production stage**: Install production deps only, copy compiled output, run as non-root user

```
node:20-alpine (builder)
  npm ci
  tsc (compile)
         |
         v
node:20-alpine (production)
  npm ci --omit=dev
  COPY dist/ + public/
  USER appuser (1001)
  CMD ["node", "dist/server.js"]
```

### Deployment Flow

1. Build Docker image: `docker build -t tmf-admin-app .`
2. Tag for ECR: `docker tag tmf-admin-app <account>.dkr.ecr.<region>.amazonaws.com/tmf-admin-app-8akfpg:latest`
3. Push to ECR: `docker push ...`
4. ECS service auto-deploys new task from latest image

---

## API Endpoint Reference

### Public Endpoints (No Auth)

| Method | Path | Response |
|--------|------|----------|
| GET | `/health` | `{ status, timestamp, uptime, version }` |
| GET | `/auth/status` | `{ authenticated, user? }` |
| GET | `/auth/login` | 302 redirect to Entra login |
| GET/POST | `/auth/callback` | OIDC callback, 302 redirect to `/` |
| GET | `/auth/logout` | Session destroy, redirect to Entra logout |

### Webhook Endpoint (Bearer Token)

| Method | Path | Request | Response |
|--------|------|---------|----------|
| POST | `/api/webhooks/graph` | Graph notification payload | `{ success, processed }` |
| POST | `/api/webhooks/graph?validationToken=X` | Subscription validation | `200 text/plain: X` |

### Protected Endpoints (API Key or OIDC Session)

**Config:**

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/config` | -- | AppConfig object |
| PUT | `/api/config` | `{ entraGroupId }` | Updated AppConfig |
| GET | `/api/config/health` | -- | `{ status, graphApi, database, webhookUrl }` |

**Subscriptions:**

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/api/subscriptions` | -- | `{ subscriptions, totalCount }` |
| GET | `/api/subscriptions/:id` | -- | Subscription object |
| POST | `/api/subscriptions` | `{ userId, userEmail, userDisplayName, resource?, changeType? }` | 201 Subscription |
| PATCH | `/api/subscriptions/:id/renew` | -- | Renewed Subscription |
| DELETE | `/api/subscriptions/:id` | -- | `{ success, message }` |
| POST | `/api/subscriptions/sync-group` | -- | `{ success, added, removed, details }` |

**Meetings:**

| Method | Path | Query Params | Response |
|--------|------|-------------|----------|
| GET | `/api/meetings` | `status`, `organizer`, `from`, `to`, `page`, `pageSize` | `{ meetings, totalCount, page, pageSize }` |
| GET | `/api/meetings/:id` | -- | Meeting object |
| GET | `/api/meetings/:id/transcript` | `type` (raw/sanitized) | Transcript with content |
| GET | `/api/meetings/:id/transcript/download` | `type` (raw/sanitized) | VTT file download |

**Transcripts:**

| Method | Path | Query Params | Response |
|--------|------|-------------|----------|
| GET | `/api/transcripts` | `status` | `{ transcripts, totalCount }` |
| GET | `/api/transcripts/:id` | -- | Transcript object |

---

## Environment Variables Reference

### Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | Environment (development, test, production) |

### AWS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_REGION` | No | `us-east-1` | AWS region |
| `DYNAMODB_SUBSCRIPTIONS_TABLE` | No | `graph-subscriptions` | Subscriptions table |
| `DYNAMODB_MEETINGS_TABLE` | No | `tmf-meetings` | Meetings table |
| `DYNAMODB_TRANSCRIPTS_TABLE` | No | `tmf-transcripts` | Transcripts table |
| `DYNAMODB_CONFIG_TABLE` | No | `tmf-config` | Config table |
| `S3_RAW_TRANSCRIPT_BUCKET` | No | `tmf-raw-transcripts` | Raw transcript storage |
| `S3_SANITIZED_TRANSCRIPT_BUCKET` | No | `tmf-sanitized-transcripts` | Sanitized transcript storage |
| `SQS_NOTIFICATION_QUEUE_URL` | No | -- | SQS queue URL (optional) |
| `GRAPH_SECRET_NAME` | No | `tmf/graph-credentials` | Secrets Manager secret name |

### Microsoft Graph API

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GRAPH_TENANT_ID` | Yes | -- | Azure AD tenant ID |
| `GRAPH_CLIENT_ID` | Yes | -- | App registration client ID |
| `GRAPH_CLIENT_SECRET` | Yes | -- | App registration client secret |
| `ENTRA_GROUP_ID` | Yes | -- | Monitored security group ID |

### Webhook

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WEBHOOK_AUTH_SECRET` | Yes | -- | Bearer token for webhook validation |
| `WEBHOOK_CLIENT_STATE` | No | -- | Expected clientState in notifications |
| `WEBHOOK_NOTIFICATION_URL` | No | -- | Webhook callback URL |

### Dashboard Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | Yes | `change-me-in-production` | Express session secret |
| `API_KEY` | No | -- | API key for programmatic access |

### Entra ID OIDC

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENTRA_TENANT_ID` | No* | -- | Entra tenant for OIDC login |
| `ENTRA_CLIENT_ID` | No* | -- | Entra app client ID |
| `ENTRA_CLIENT_SECRET` | No* | -- | Entra app client secret |
| `ENTRA_REDIRECT_URI` | No* | -- | OIDC redirect URI |

*Required only if Entra OIDC browser login is enabled.

### Sanitization

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SANITIZATION_ENABLED` | No | `true` | Enable PII sanitization |
| `SANITIZATION_MODE` | No | `simulated` | Sanitization mode |
