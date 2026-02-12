# Teams Meeting Fetcher - System Specification

## 1. Executive Summary

A distributed system that enables automatic recording and transcription management of Microsoft Teams meetings. The system consists of:
- **Teams Recording App**: Installed in Teams to manage meeting recordings
- **External Service**: On-premises or cloud-hosted Node.js backend that receives webhook notifications and manages transcriptions
- **Management UI**: Simple dashboard to view transcriptions and configure settings

**No Azure Infrastructure Required** - Uses only Microsoft Graph API authenticated via App Registration.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Microsoft Teams                             │
│  ┌──────────────────────────────┐      ┌──────────────────────────┐ │
│  │   Teams Meeting Recording    │      │    Teams Calendar        │ │
│  │         (App)                │      │   (Entra Group Members)  │ │
│  └──────────────┬───────────────┘      └──────────────┬───────────┘ │
└─────────────────┼────────────────────────────────────┼──────────────┘
                  │ Recording Started/Completed        │ Calendar Events
                  │                                    │
          ┌───────▼────────────────────────────────────▼──────────┐
          │        Microsoft Graph API                             │
          │  (Change Notifications / Webhooks)                     │
          └────────────────────────┬─────────────────────────────┘
                                   │
                   ┌───────────────▼───────────────┐
                   │   External Node.js Service    │
                   │  (On-Prem or Cloud-Hosted)    │
                   │  ┌─────────────────────────┐  │
                   │  │ Webhook Handler         │  │
                   │  │ - Bearer Token Auth     │  │
                   │  │ - Process Notifications │  │
                   │  └─────────────────────────┘  │
                   │  ┌─────────────────────────┐  │
                   │  │ Graph Service Client    │  │
                   │  │ - Fetch Transcriptions  │  │
                   │  │ - Manage Recordings     │  │
                   │  └─────────────────────────┘  │
                   │  ┌─────────────────────────┐  │
                   │  │ Database/Storage        │  │
                   │  │ - Meeting Records       │  │
                   │  │ - Transcriptions        │  │
                   │  └─────────────────────────┘  │
                   └────────────┬──────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Management UI         │
                    │  (Browser Dashboard)   │
                    └────────────────────────┘
```

---

## 3. Component Specifications

### 3.1 Teams Recording App

**Purpose**: Installed in Teams to initiate or manage meeting recordings.

**Capabilities**:
- Installed as Teams App (tab or meeting app)
- Requests consent to:
  - Read user profile
  - Read calendar events (Entra group)
  - Record meetings
  - Access meeting transcript data

**Installation**:
- Manifest-based deployment
- Targets Entra Group members only
- Webhook endpoint configured in Graph API subscriptions (not in manifest)

**Configuration**:
- Organization ID
- Entra Group ID to monitor
- External webhook endpoint URL (provided by IT/API Manager)

---

### 3.2 External Node.js Service

**Purpose**: Handle webhooks, manage transcriptions, provide management UI.

**Responsibilities**:
1. **Webhook Server** - HTTP endpoint to receive Microsoft Graph change notifications
2. **Notification Processor** - Process meeting/transcription events
3. **Graph Client** - Fetch transcriptions and meeting details
4. **Data Persistence** - Store meeting records and transcriptions
5. **Management API** - REST endpoints for UI/external integrations
6. **Authentication** - Validate Bearer tokens for webhooks

**Technology Stack**:
- Node.js (LTS)
- Express.js
- TypeScript
- SQLite (lightweight, no external DB needed)
- Microsoft Graph SDK

**Deployment Options**:
- Docker container (recommended)
- Systemd service (Linux)
- IIS hosted (Windows)
- Any cloud provider (AWS, GCP, etc.) - no Azure-specific bindings

---

### 3.3 Management UI

**Purpose**: Simple dashboard to view meetings and transcriptions.

**Features**:
- ✅ List all monitored meetings
- ✅ View transcription status (pending/complete)
- ✅ Download/view transcripts
- ✅ Filter by date range, organizer, attendees
- ✅ Configuration panel (Entra Group ID, webhook URL)
- ✅ Basic authentication (API key or similar)

**Implementation**:
- Single-page application (HTML + vanilla JS)
- Served from Express.js
- No external dependencies (jQuery-free)
- API-based communication with backend

---

## 4. Authentication & Authorization

### 4.1 App Registration (Azure Entra)

**Required Permissions** (Microsoft Graph):
```
- Calendar.Read (read calendars for Entra group)
- Calls.AccessMedia.Read (access recording content)
- OnlineMeetingArtifact.Read.All (read meeting recordings/transcripts)
- TeamsAppInstallation.ReadWrite.All (manage Teams app installation)
```

**Authentication Method**: 
- Service Principal (Client Credentials Flow)
- Credentials stored in `.env` file (never committed)

**Environment Variables**:
```
GRAPH_TENANT_ID=<organization-id>
GRAPH_CLIENT_ID=<app-registration-id>
GRAPH_CLIENT_SECRET=<app-secret>
ENTRA_GROUP_ID=<target-group-id>
WEBHOOK_AUTH_SECRET=<random-token-for-bearer-auth>
```

### 4.2 Webhook Authorization via API Manager

**Architecture**: External API Manager (Kong, AWS API Gateway, Azure APIM, etc.) sits in front

**Bearer Token Validation**:
- API Manager intercepts `Authorization: Bearer <token>` header
- Validates token against configured secret
- Only forwards valid requests to internal Node.js app
- Node.js app receives pre-authenticated requests

**For Docker Development**: Can stub with nginx container (see Deployment)

**Note**: Microsoft Graph webhooks cannot send custom headers directly. API Manager provides this layer.

---

## 5. API Specifications

### 5.1 Webhook Endpoint

**POST** `/api/webhooks/graph`

**Headers**:
```
Authorization: Bearer <WEBHOOK_AUTH_SECRET>
Content-Type: application/json
```

**Request Body** (Microsoft Graph Change Notification):
```json
{
  "value": [
    {
      "subscriptionId": "string",
      "changeType": "created|updated|deleted",
      "clientState": "string",
      "resource": "/me/events/{id}",
      "resourceData": {
        "id": "meeting-id",
        "@odata.type": "#microsoft.graph.event"
      }
    }
  ]
}
```

**Response**:
```
200 OK
Content-Type: application/json

{
  "success": true,
  "processed": 1
}
```

**Processing Logic**:
1. Validate Bearer token
2. Check resource type (calendar event, recording, etc.)
3. Fetch full event details from Graph API
4. Check if organizer is in target Entra group
5. Store meeting record
6. If recording available, fetch transcription
7. Trigger transcription processing when complete

---

### 5.2 Meeting Records API

**GET** `/api/meetings`

**Query Parameters**:
- `status`: `scheduled|recording|transcript_pending|completed|failed`
- `from`: ISO 8601 date (filter by start date)
- `to`: ISO 8601 date
- `organizer`: email or user ID

**Response**:
```json
{
  "meetings": [
    {
      "id": "meeting-id",
      "subject": "Q1 Planning",
      "organizer": {
        "id": "user-id",
        "displayName": "John Doe",
        "email": "john@company.com"
      },
      "startTime": "2026-02-11T10:00:00Z",
      "endTime": "2026-02-11T11:00:00Z",
      "recording": {
        "url": "/api/meetings/{id}/recording",
        "status": "available"
      },
      "transcription": {
        "status": "transcript_pending|completed|failed",
        "id": "transcript-id",
        "createdAt": "2026-02-11T11:05:00Z"
      },
      "attendees": [
        {
          "id": "user-id",
          "displayName": "Jane Doe",
          "email": "jane@company.com"
        }
      ]
    }
  ],
  "totalCount": 42,
  "pageSize": 20,
  "page": 1
}
```

---

### 5.3 Transcription API

**GET** `/api/meetings/{meetingId}/transcription`

**Response**:
```json
{
  "id": "transcript-id",
  "meetingId": "meeting-id",
  "status": "completed|pending|failed",
  "content": "Full transcription text...",
  "createdAt": "2026-02-11T11:05:00Z",
  "updatedAt": "2026-02-11T11:30:00Z"
}
```

**GET** `/api/meetings/{meetingId}/transcription/download`
- Returns binary transcript file (TXT or PDF)

---

### 5.4 Configuration API

**GET** `/api/config`

**Response**:
```json
{
  "entraGroupId": "group-id",
  "tenantId": "tenant-id",
  "webhookUrl": "https://external-app.com/api/webhooks/graph",
  "monitoredMeetingsCount": 42,
  "lastWebhookReceived": "2026-02-11T12:30:00Z",
  "transcriptionsProcessed": 38,
  "transcriptionsPending": 4
}
```

**PUT** `/api/config`

**Request**:
```json
{
  "entraGroupId": "new-group-id"
}
```

**Response**: Updated config + subscriptions updated in Graph API

---

### 5.5 Health Check

**GET** `/health`

**Response**:
```json
{
  "status": "healthy|degraded",
  "timestamp": "2026-02-11T12:30:00Z",
  "graphApi": "connected|disconnected",
  "database": "connected|disconnected",
  "webhookUrl": "https://external-app.com/api/webhooks/graph",
  "uptime": 3600
}
```

---

## 6. Data Models

### 6.1 Meeting Record

```typescript
interface Meeting {
  id: string;                    // Graph meeting ID
  tenantId: string;
  subject: string;
  description: string;
  startTime: Date;
  endTime: Date;
  organizerId: string;           // Entra user ID (group member who created event)
  organizerEmail: string;
  organizerDisplayName: string;
  attendees: Attendee[];
  recordingUrl?: string;         // Graph URL to recording (null if not recorded)
  recordingStatus: 'scheduled' | 'recording' | 'transcript_pending' | 'completed' | 'failed';
  transcriptionId?: string;      // FK to Transcription
  subscriptionId: string;        // FK to WebhookSubscription (user's calendar subscription)
  createdAt: Date;
  updatedAt: Date;
}

interface Attendee {
  id: string;
  email: string;
  displayName: string;
  role: 'organizer' | 'required' | 'optional';
  status: 'accepted' | 'declined' | 'tentative' | 'notResponded';
}
```

### 6.2 Transcription Record

```typescript
interface Transcription {
  id: string;                    // UUID
  meetingId: string;             // FK to Meeting
  status: 'transcript_pending' | 'completed' | 'failed';
  content: string;               // Full transcription text (VTT format from Graph)
  language: string;              // ISO 639-1 code
  confidenceScore: number;       // 0-1 (if available)
  graphTranscriptId: string;     // callTranscript ID from Graph API
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### 6.3 Webhook Subscription

```typescript
interface WebhookSubscription {
  id: string;                    // Graph subscription ID
  userId: string;                // Entra user ID (group member)
  userEmail: string;             // User email for tracking
  resource: string;              // /users/{userId}/events (calendar)
  changeType: 'created' | 'updated' | 'deleted';
  notificationUrl: string;       // Our webhook endpoint
  clientState: string;           // Random secret for validation
  expirationDateTime: Date;      // Graph subscriptions expire (29 days)
  renewalReminderAt: Date;       // Alert 24 hours before expiry
  createdAt: Date;
  lastNotificationAt: Date;
  lastRenewalAt: Date;
}
```

**Purpose**: Tracks per-user calendar event subscriptions so all group member meetings are captured.

---

## 7. Workflow: Meeting Recording to Transcription

### 7.0 Startup: Subscribe to Entra Group Members

```
1. External app starts
2. Authenticate with Graph API (service principal, client credentials)
3. Query: GET /groups/{groupId}/members
   - Get all users in target Entra group
4. For each group member:
   - Create webhook subscription: POST /subscriptions
   - Resource: /users/{userId}/events
   - NotificationUrl: https://<external-app>/api/webhooks/graph
   - ChangeType: created, updated
5. Store subscription IDs in database (map: member → subscriptionId)
6. Schedule subscription renewal (every 28 days, 1 day before 29-day TTL)
7. Store is ready to receive webhook notifications
```

**Why Group Member Subscriptions?**
- Graph subscriptions bound to specific calendar (user or group)
- Group calendars may not have all member meetings
- Per-user subscriptions ensure all member meetings are captured
- Handles membership changes (add user → create subscription; remove user → delete subscription)

### 7.1 New Member Detected

```
1. Background job checks group membership daily (or on-demand)
2. New members added since last check
3. For each new member: create subscription (same as 7.0)
4. New member's meetings now tracked
```

### 7.2 Meeting Created or Updated

```
1. Organizer (group member) creates or updates meeting in Teams
2. Meeting created/updated in organizer's calendar
3. Graph API sends change notification
   - ChangeType: created OR updated
   - Resource: /users/{organizerId}/events
4. API Manager validates Bearer token
5. External app receives webhook notification
6. App checks if meeting already exists in DB:
   - If EXISTS: Go to step 7b (update)
   - If NEW: Go to step 7a (insert)

7a. NEW MEETING (created):
   - Fetch meeting details: GET /users/{organizerId}/events/{eventId}
   - Check if online meeting (isOnlineMeeting = true)
   - Check for recording: POST /users/{organizerId}/events/{eventId}/microsoft.graph.getOnlineMeetingRecordings()
   - If recording found: status = 'recording'
   - If no recording: status = 'scheduled'
   - Store meeting record in DB
   - Begin transcription polling if recorded

7b. EXISTING MEETING (updated):
   - Update meeting fields (title, time, attendees, etc.)
   - Check for recording again (may have been added)
   - Update recording status if found
   - If cancelled (isCancelled = true): Mark status = 'completed' with cancelled flag
   - Continue polling if status = 'recording'

7c. MEETING CANCELLED/DELETED:
   - If isCancelled = true or changeType = deleted:
   - Mark meeting status = 'completed' with cancellation reason
   - Stop polling for transcription
   - Preserve in DB for historical records
```

**Why re-check on every update?**
- Recordings are added asynchronously after meeting ends
- Update webhook ensures we catch recording availability
- Handles meeting rescheduling without creating duplicate records
- Preserves meeting history for audit/compliance

### 7.3 Recording Available

```
1. Meeting concludes, recording is processed by Teams
2. Graph API sends update notification
3. App receives webhook, checks for recording (step 7b above)
4. Recording detected: POST /users/{organizerId}/events/{eventId}/microsoft.graph.getOnlineMeetingRecordings()
5. App updates meeting status to: recording
6. App starts polling for transcript availability every 30 seconds
```

### 7.4 Transcription Available

```
1. App polls: GET /me/callTranscripts/{transcriptId}
2. When available (stops returning 404), app fetches content
3. App stores transcription in database
4. App updates meeting record (status: completed)
5. UI shows transcription ready for download
```

### 7.5 Failure Handling

- **Recording failed**: Mark as failed, log error, notify admin
- **Transcription unavailable**: Mark as pending, retry polling
- **Webhook delivery failed**: Graph API retries; we ensure idempotence
- **Member left group**: Delete subscription, archived meetings remain in database

---

### 7.6 AWS Integration: Event Grid for Transcript-Ready Events (Optional)

**Use Case**: Trigger AWS Lambda, SNS, SQS, or other AWS services when transcriptions are ready.

#### 7.6.1 Architecture

```
┌─────────────────────────┐
│  Teams Meeting Fetcher  │
│    (Node.js App)        │
│                         │
│  Event: Transcription   │
│  Ready (status:         │
│  completed + transcript)│
└────────────┬────────────┘
             │
             │ Publish to Azure Event Grid
             │
    ┌────────▼──────────────────┐
    │   Azure Event Grid Topic   │
    │  (Private Endpoint)        │
    │                            │
    │ Filter: Only "transcript   │
    │ ready" events              │
    └────────┬───────────────────┘
             │
             │ HTTP webhook to AWS
             │ (with AWS SigV4 auth OR Bearer token)
             │
    ┌────────▼──────────────────────────┐
    │  AWS API Gateway / Custom Endpoint │
    │                                    │
    │  Routes events to:                 │
    │  • Lambda (process transcript)     │
    │  • SNS (notify subscribers)        │
    │  • SQS (queue for batch process)   │
    │  • DynamoDB (store transcript)     │
    └────────────────────────────────────┘
```

#### 7.6.2 Event Grid Configuration

**Topic Setup** (in Terraform):
```hcl
resource "azurerm_eventgrid_topic" "transcription_ready" {
  name                = "evgt-transcriptions-ready"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  public_network_access_enabled = false  # Private endpoint only
}

# Private Endpoint for Event Grid
resource "azurerm_private_endpoint" "eventgrid" {
  # ... configuration ...
}
```

**Subscription Filter** (in Node.js app):
```javascript
// When publishing to Event Grid:
const event = {
  eventType: "transcription.ready",
  subject: `meetings/${meetingId}`,
  dataVersion: "1.0",
  data: {
    meetingId: meeting.id,
    meetingTitle: meeting.subject,
    organizerEmail: meeting.organizerEmail,
    transcriptionId: transcription.id,
    transcriptionUrl: `${process.env.APP_URL}/api/transcriptions/${transcription.id}`,
    recordingUrl: meeting.recordingUrl,
    startTime: meeting.startTime,
    endTime: meeting.endTime
  }
};

await eventGridClient.publishEvents([event]);
```

**AWS Endpoint Subscription** (Event Grid → AWS):
```hcl
resource "azurerm_eventgrid_event_subscription" "aws_transcription_ready" {
  name              = "sub-aws-transcriptions"
  scope             = azurerm_eventgrid_topic.transcription_ready.id
  event_delivery_schema = "EventGridSchema"
  
  webhook_endpoint {
    url = aws_apigateway_deployment.transcription_webhook.invoke_url
    base_url = aws_apigateway_deployment.transcription_webhook.invoke_url
    
    # Authentication
    active_directory_tenant_id = var.aws_webhook_auth_tenant_id  # If custom auth
    azure_function_single_header_values = {
      "X-API-Key" = var.aws_api_key  # Static key
    }
  }
  
  # Advanced filter: Only transcript-ready events
  advanced_filter {
    string_in {
      key    = "eventType"
      values = ["transcription.ready"]
    }
  }
  
  # Retry policy
  retry_policy {
    event_time_to_live_minutes = 1440  # 24 hours
    max_delivery_attempts       = 30
  }
  
  # Dead letter destination (optional)
  dead_letter_endpoint {
    storage_account_id         = azurerm_storage_account.main.id
    storage_blob_container_name = "deadletter"
  }
}
```

#### 7.6.3 Authentication: Event Grid → AWS

**Option 1: Bearer Token (Simpler)**
```javascript
// AWS Lambda authorizer
export const authorize = async (event) => {
  const token = event.authorizationToken;
  const expectedToken = process.env.EVENT_GRID_BEARER_TOKEN;
  
  return {
    principalId: "user",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: token === expectedToken ? "Allow" : "Deny",
          Resource: event.methodArn
        }
      ]
    }
  };
};
```

**Option 2: AWS SigV4 (More Secure)**
```javascript
// Node.js app signs request with AWS credentials
const { SignatureV4 } = require("@aws-sdk/signature-v4");
const { HttpRequest } = require("@aws-sdk/protocol-http");

const signer = new SignatureV4({
  service: "execute-api",
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  sha256: crypto.createHash
});

const request = new HttpRequest({
  method: "POST",
  hostname: process.env.AWS_WEBHOOK_HOST,
  path: "/transcriptions/ready",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(event)
});

const signed = await signer.sign(request);
// Send signed request to AWS
```

**Option 3: Event Grid Validation Token (Best Practice)**
- Event Grid sends `validationToken` parameter on first subscription
- AWS Lambda responds with `validationResponse` containing the token
- Event Grid validates before sending events
- No additional auth headers needed

```javascript
// AWS Lambda handler
export const handler = async (event) => {
  const body = JSON.parse(event.body);
  
  // Handle validation handshake
  if (body[0].eventType === "Microsoft.EventGrid.SubscriptionValidationEvent") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        validationResponse: body[0].data.validationCode
      })
    };
  }
  
  // Handle transcript-ready events
  for (const item of body) {
    if (item.eventType === "transcription.ready") {
      console.log("Transcript ready:", item.data.transcriptionId);
      // Process transcript
      // Store in DynamoDB, trigger Lambda, etc.
    }
  }
  
  return { statusCode: 200, body: "OK" };
};
```

#### 7.6.4 AWS Lambda: Process Transcription

**Example: Download, process, store in S3**
```javascript
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

export const handler = async (event) => {
  const body = JSON.parse(event.body);
  
  for (const item of body) {
    if (item.eventType === "transcription.ready") {
      const { meetingId, transcriptionUrl, organizerEmail } = item.data;
      
      try {
        // 1. Download transcript from Teams Meeting Fetcher
        const response = await fetch(transcriptionUrl, {
          headers: { "Authorization": `Bearer ${process.env.TMF_API_KEY}` }
        });
        const transcriptContent = await response.text();
        
        // 2. Store in S3
        await s3.putObject({
          Bucket: process.env.S3_BUCKET,
          Key: `transcriptions/${meetingId}/transcript.vtt`,
          Body: transcriptContent,
          ContentType: "text/plain"
        }).promise();
        
        // 3. Store metadata in DynamoDB
        await dynamodb.put({
          TableName: "TranscriptionMetadata",
          Item: {
            meetingId,
            organizerEmail,
            transcriptS3Path: `s3://${process.env.S3_BUCKET}/transcriptions/${meetingId}/transcript.vtt`,
            processedAt: new Date().toISOString()
          }
        }).promise();
        
        // 4. Publish to SNS for external notification
        await sns.publish({
          TopicArn: process.env.SNS_TOPIC_ARN,
          Subject: "Transcript Ready",
          Message: `Transcript for meeting ${meetingId} is ready.`
        }).promise();
        
      } catch (error) {
        console.error("Failed to process transcript:", error);
        // Send to dead-letter queue
      }
    }
  }
};
```

#### 7.6.5 Benefits vs Limitations

**Benefits**:
- ✅ Real-time event filtering (only transcript-ready events)
- ✅ No need to poll AWS endpoint
- ✅ Retry logic built into Event Grid (30 retries, 24-hour TTL)
- ✅ Dead-letter queue for failed deliveries
- ✅ Reduces Lambda invocation costs (no polling)
- ✅ Decouples Teams Meeting Fetcher from AWS services

**Limitations**:
- ⚠️ Event Grid subscription = static endpoint (not flexible routing)
- ⚠️ Event Grid → AWS requires internet connectivity (or Express Route)
- ⚠️ No built-in circuit breaker if AWS endpoint fails

**When to Use**:
- Event Grid + AWS: Already using AWS for other workloads
- Event Grid + Azure: Use Event Grid → Azure Functions/Logic Apps natively
- No Event Grid: Use polling via Lambda scheduled task (less efficient)

---

## 8. Configuration Requirements

### 8.1 Environment Configuration

```bash
# Graph API
GRAPH_TENANT_ID=00000000-0000-0000-0000-000000000000
GRAPH_CLIENT_ID=00000000-0000-0000-0000-000000000000
GRAPH_CLIENT_SECRET=very-secret-value

# Target Entra Group
ENTRA_GROUP_ID=00000000-0000-0000-0000-000000000000

# Webhook Security
WEBHOOK_AUTH_SECRET=random-secure-token-32-chars-min
WEBHOOK_AUTH_ALGORITHM=bearer  # Always Bearer for simplicity

# Event Grid (optional, if integrating with AWS)
EVENTGRID_TOPIC_NAME=evgt-transcriptions-ready
EVENTGRID_URI=https://<topic-name>.eventgrid.azure.net/api/events
EVENTGRID_KEY=<topic-access-key>

# AWS Integration (optional)
AWS_WEBHOOK_ENDPOINT=https://<api-gateway-id>.execute-api.<region>.amazonaws.com/prod/transcriptions/ready
AWS_API_KEY=<bearer-token-or-sigv4-key>

# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_PATH=./data/meetings.db

# Graph API Polling
TRANSCRIPTION_POLL_INTERVAL_MS=30000  # 30 seconds
TRANSCRIPTION_MAX_RETRIES=40           # ~20 minutes total
WEBHOOK_SUBSCRIPTION_TTL_DAYS=29       # Renew before expiry

# Membership Check
GROUP_MEMBERSHIP_CHECK_INTERVAL_MS=86400000  # 24 hours
```

### 8.2 Graph API Subscription Setup

On startup, external app will:

1. **Enumerate Group Members**
   - Authenticate with Graph API using service principal
   - Query: `GET /groups/{groupId}/members`
   - Retrieve all users in target Entra group

2. **Create Per-User Subscriptions**
   - For each group member:
     - POST `/subscriptions` with:
       - Resource: `/users/{userId}/events`
       - ChangeType: `created`, `updated`
       - NotificationUrl: `https://<external-app>/api/webhooks/graph`
       - ExpirationDateTime: 28 days from now
     - Store subscription ID (linked to user)

3. **Handle Membership Changes**
   - Daily job: Check if new members added or removed since last check
   - New member: Create subscription automatically
   - Removed member: Delete subscription, archive meetings

4. **Renewal Process**
   - Scheduled job: Every day at 2 AM check subscription expiry
   - If expiry < 24 hours: PATCH subscription to extend 28 more days
   - Log renewal events for auditing

5. **Transcription Polling**
   - Upon meeting event: Store meeting details
   - Begin polling for transcription availability
   - Poll every 30 seconds for up to 20 minutes (configurable)
   - Flag as timeout if transcript not available

---

## 9. Security Considerations

### 9.1 Authentication

- ✅ Service Principal authentication (no user interaction)
- ✅ Bearer token validation on all webhooks
- ✅ HTTPS required for webhook endpoint
- ✅ Environment variables for secrets (never hardcoded)
- ✅ .env file in .gitignore

### 9.2 Data Protection

- ✅ Transcriptions stored encrypted at rest (optional)
- ✅ RBAC on management API (basic API key auth)
- ✅ No logging of sensitive meeting content
- ✅ Webhook signatures validated

### 9.3 Network Security

- ✅ Webhook endpoint requires HTTPS
- ✅ CORS policy (restrict to Teams or specified origins)
- ✅ Rate limiting on webhook endpoint
- ✅ Request size limits (prevent DoS)

---

## 10. Deployment Options

### 10.1 Docker (Recommended)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only-production
COPY dist ./dist
COPY data ./data
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Run**:
```bash
docker build -t teams-meeting-fetcher .
docker run -d \
  -e GRAPH_TENANT_ID=... \
  -e GRAPH_CLIENT_ID=... \
  -e GRAPH_CLIENT_SECRET=... \
  -e ENTRA_GROUP_ID=... \
  -e WEBHOOK_AUTH_SECRET=... \
  -p 3000:3000 \
  teams-meeting-fetcher
```

### 10.2 Node.js (Direct)

```bash
npm install
npm run build
npm run start
```

### 10.3 Systemd Service (Linux)

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

[Install]
WantedBy=multi-user.target
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

- Services: Graph API client, data layer
- Middleware: Bearer token validation
- Utilities: Date parsing, filtering

### 11.2 Integration Tests

- Webhook endpoint with mock Graph notifications
- Database operations (CRUD)
- API endpoint responses

### 11.3 E2E Tests

- Full flow: Schedule meeting → Record → Fetch transcription
- Webhook delivery and processing
- Error scenarios (network failure, invalid data)

### 11.4 Mock Data

- Mock Graph API responses
- Sample webhook payloads
- Test Entra group configuration

---

## 12. Future Enhancements

- [ ] Real-time transcription processing (streaming)
- [ ] Transcription search/indexing (Elasticsearch)
- [ ] Advanced filtering (speaker labels, keywords)
- [ ] Email notifications (transcription ready)
- [ ] Export to external storage (SharePoint, OneDrive)
- [ ] Web UI authentication (OAuth/OIDC)
- [ ] Audit logging
- [ ] Recurring meeting handling
- [ ] Meeting analytics (duration, attendees, etc.)
- [ ] Multi-tenancy support

---

## 13. Acronyms & Glossary

| Term | Definition |
|------|-----------|
| Entra | Microsoft Entra ID (formerly Azure AD) |
| Graph API | Microsoft Graph API |
| RBAC | Role-Based Access Control |
| SPA | Single Page Application |
| TTL | Time To Live |
| FK | Foreign Key |

---

## Appendix A: Configuration Checklist

- [ ] Create App Registration in Entra
- [ ] Grant Graph API permissions
- [ ] Generate client secret
- [ ] Get Tenant ID, Client ID, Client Secret
- [ ] Identify target Entra Group ID
- [ ] Generate webhook authorization secret (32+ chars)
- [ ] Provision server/container environment
- [ ] Configure reverse proxy (nginx/Apache) with HTTPS
- [ ] Create `.env` file with all variables
- [ ] Run database migrations
- [ ] Register webhook subscription with Graph API
- [ ] Test webhook delivery
- [ ] Deploy Teams app manifest
- [ ] Verify transcription polling

