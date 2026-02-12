# Webhook Implementation Guide

Complete specification for Microsoft Graph change notification webhooks.

## Overview

The Teams Meeting Fetcher uses **Microsoft Graph change notifications** to receive real-time updates about:
- Calendar events (meetings scheduled/updated)
- Recording availability
- Transcription completion

## Security: Bearer Token Authentication via API Manager

**Architecture**: An external API Manager (Kong, AWS API Gateway, Azure APIM, etc.) sits in front of the webhook endpoint and handles Bearer token validation.

**Flow**:
```
Microsoft Graph
    ↓ (webhook POST)
External Network
    ↓
API Manager validating Bearer token
    ├ Returns 401 if invalid
    └ Forwards to internal app if valid
    ↓
Internal Node.js App (localhost:3000)
    └ Receives already-validated webhook
```

**For Development with Docker**:

Instead of full API Manager, use lightweight nginx:

```bash
# docker-compose.yml
version: '3.8'
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /path/to/certs:/etc/nginx/certs:ro
    networks:
      - internal
  app:
    build: ./external-app
    networks:
      - internal
networks:
  internal:
    driver: bridge
```

**Node.js App** (NO Bearer validation - API Manager already validated):
```javascript
app.post('/api/webhooks/graph', handleWebhook);
// Webhook is already authenticated by upstream API Manager
```

---

## Graph Subscription Setup

On application startup:

### 1. Authenticate with Graph API

```javascript
const credential = new ClientSecretCredential(
  tenantId,
  clientId,
  clientSecret
);

const client = new GraphClient(credential);
```

### 2. Get Members of Entra Group

```javascript
const members = await client.api(
  `/groups/${entraGroupId}/members`
).get();

// members.value[] contains { id, userPrincipalName, ... }
```

### 3. Create Subscription for Each Member's Calendar

```javascript
const subscription = {
  changeType: 'created,updated',
  notificationUrl: 'https://your-domain.com/api/webhooks/graph',
  resource: `/users/${memberId}/events`,
  expirationDateTime: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
  clientState: crypto.randomUUID(),
  includeResourceData: false
};

const result = await client.api('/subscriptions').post(subscription);
// Store result.id for renewal later
```

### 4. Handle Subscription Response

```javascript
{
  "id": "0000-0000-0000-0000",
  "changeType": "created,updated",
  "notificationUrl": "https://your-domain.com/api/webhooks/graph",
  "resource": "/users/86894ae2-0e82-4a4f-b68e-3c72b8797f42/events",
  "expirationDateTime": "2026-03-12T11:00:00Z",
  "clientState": "12345678-1234-1234-1234-123456789abc"
}
```

---

## Webhook Notification Format

Microsoft Graph sends notifications to your webhook endpoint:

```json
{
  "value": [
    {
      "subscriptionId": "0000-0000-0000-0000",
      "changeType": "created|updated|deleted",
      "clientState": "12345678-1234-1234-1234-123456789abc",
      "resource": "/users/86894ae2-0e82-4a4f-b68e-3c72b8797f42/events/AAMkADI5NGY1MjE0",
      "resourceData": {
        "id": "AAMkADI5NGY1MjE0LTY5ZWItNDI3ZC04ZjZjLWJjY2RiMzhjOGYzZA==",
        "@odata.type": "#microsoft.graph.event"
      },
      "sequenceNumber": 1,
      "tenantId": "85203b49-71cc-4b94-94e8-f2b4146a9884",
      "webhookExpirationDateTime": "2026-03-12T11:00:00Z"
    }
  ]
}
```

### Notification Fields

| Field | Type | Description |
|-------|------|-------------|
| `subscriptionId` | string | ID of subscription that triggered notification |
| `changeType` | string | `created`, `updated`, or `deleted` |
| `clientState` | string | Opaque value you provided; for validation |
| `resource` | string | OData URL to resource; e.g., `/users/{id}/events/{id}` |
| `resourceData.id` | string | ID of the changed resource |
| `resourceData.@odata.type` | string | Type of resource; e.g., `#microsoft.graph.event` |
| `sequenceNumber` | number | Order of notifications in subscription |
| `tenantId` | string | Azure Tenant ID |
| `webhookExpirationDateTime` | datetime | When subscription expires |

---

## Processing Webhook Notifications

### High-Level Flow

```
1. Receive notification from Microsoft Graph
2. Validate Bearer token
3. Validate clientState (optional, for extra security)
4. Parse changeType (created/updated/deleted)
5. For each notification:
   a. Fetch full event from Graph API
   b. Check if organizer is in target Entra group
   c. If yes:
      - Store meeting record
      - If recording available, start transcription polling
      - If transcription available, fetch and store
6. Return 200 OK immediately (don't block on polling)
7. Continue processing async
```

### Detailed Implementation

```javascript
async function handleWebhook(req, res) {
  // 1. Validate Bearer token (done via middleware)
  
  // 2. Get notifications
  const { value: notifications } = req.body;
  
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return res.json({ processed: 0 });
  }
  
  const results = [];
  
  // 3. Return 200 immediately (don't wait for processing)
  res.json({ success: true, processed: notifications.length });
  
  // 4. Process async
  for (const notification of notifications) {
    try {
      processNotification(notification);
    } catch (error) {
      logger.error('Notification processing failed', error);
    }
  }
}

async function processNotification(notification) {
  const { 
    changeType, 
    resource, 
    resourceData 
  } = notification;
  
  // Extract user ID and event ID from resource
  // resource = "/users/{userId}/events/{eventId}"
  const [, , userId, , eventId] = resource.split('/');
  
  // Fetch full event from Graph API
  const event = await client.api(
    `/users/${userId}/events/${eventId}`
  ).get();
  
  // Check if organizer is in target Entra group
  const organizerId = event.organizer.user.id;
  const isMember = await isGroupMember(organizerId);
  
  if (!isMember) {
    logger.info(`Organizer ${organizerId} not in target group, skipping`);
    return;
  }
  
  // Store meeting
  await storeMeeting(event);
  
  // Check for recording using Graph API
  try {
    // Get online meeting recordings
    // Endpoint: POST /me/events/{eventId}/microsoft.graph.getOnlineMeetingRecordings()
    const recordingsResponse = await client.api(
      `/me/events/${eventId}/microsoft.graph.getOnlineMeetingRecordings()`
    ).post();
    
    if (recordingsResponse?.value && recordingsResponse.value.length > 0) {
      // Recording exists, store recording ID and update status
      const recordingId = recordingsResponse.value[0].id;
      await updateMeetingStatus(eventId, 'recording', recordingId);
      // Start transcription polling
      startTranscriptionPolling(eventId, recordingId);
    }
  } catch (error) {
    if (error.status === 404) {
      // Recording not available yet
      logger.info(`Recording not yet available for ${eventId}`);
    } else {
      logger.error(`Error fetching recording for ${eventId}`, error);
    }
  }
}
```

---

## Transcription Polling

Since transcription doesn't have a change notification trigger, we poll periodically:

### Polling Flow

```javascript
async function startTranscriptionPolling(meetingId) {
  const maxRetries = parseInt(process.env.TRANSCRIPTION_MAX_RETRIES);
  const interval = parseInt(process.env.TRANSCRIPTION_POLL_INTERVAL_MS);
  
  let retries = 0;
  
  const pollInterval = setInterval(async () => {
    try {
      const transcript = await fetchTranscription(meetingId);
      
      if (transcript) {
        // Found transcription
        await storeTranscription(meetingId, transcript);
        clearInterval(pollInterval);
        logger.info(`Transcription ready for meeting ${meetingId}`);
        return;
      }
      
      retries++;
      
      if (retries >= maxRetries) {
        // Give up
        clearInterval(pollInterval);
        logger.warn(`Max retries exceeded for meeting ${meetingId}`);
        await markTranscriptionFailed(meetingId);
        return;
      }
    } catch (error) {
      logger.error(`Polling error for meeting ${meetingId}`, error);
    }
  }, interval);
}

async function fetchTranscription(callTranscriptId) {
  try {
    // Get the transcript from Graph API
    // Endpoint: GET /me/callTranscripts/{callTranscriptId}
    const response = await client.api(
      `/me/callTranscripts/${callTranscriptId}`
    ).get();
    
    // Get transcript content in VTT format
    // Endpoint: GET /me/callTranscripts/{callTranscriptId}/content
    const contentResponse = await client.api(
      `/me/callTranscripts/${callTranscriptId}/content`
    ).get();
    
    if (contentResponse) {
      return contentResponse.toString();
    }
    
    return null;
  } catch (error) {
    if (error.status === 404) {
      // Transcript not ready yet
      return null;
    }
    logger.error(`Error fetching transcript ${callTranscriptId}`, error);
    throw error;
  }
}
```

**Configuration** (in `.env`):
```bash
TRANSCRIPTION_POLL_INTERVAL_MS=30000    # Poll every 30 seconds
TRANSCRIPTION_MAX_RETRIES=40            # Max 40 retries ≈ 20 minutes
```

---

## Error Handling

### Webhook Validation Errors

| Error | HTTP Status | Recovery |
|-------|-------------|----------|
| Invalid Bearer token | 401 | Microsoft stops sending (quota reached) |
| Malformed JSON | 400 | Log and skip |
| Missing required fields | 400 | Log and skip |
| Event ID not found | 404 | Log and skip |
| Organizer not in group | - | Skip silently (expected) |

### Response Codes

- **200 OK**: Always return 200 if request format is valid (even if processing fails)
- **401 Unauthorized**: Bearer token invalid or missing
- **400 Bad Request**: Malformed JSON
- **429 Too Many Requests**: Rate limited (queue and retry)
- **500 Server Error**: Unexpected error (Microsoft retries)

**Why return 200 even on processing errors?**

Microsoft Graph will retry if you don't return 200. If the notification is malformed or the organizer isn't in your group (expected case), returning 200 prevents unnecessary retries and quota waste.

---

## Subscription Lifecycle

### Creation

Application automatic on startup:
```javascript
app.listen(3000, async () => {
  const members = await getEntraGroupMembers();
  for (const member of members) {
    await createSubscription(member.id);
  }
});
```

### Renewal

Graph subscriptions expire every 29 days. Renew 1 day before expiry:

```javascript
async function renewSubscriptionsIfNeeded() {
  const subscriptions = await getSubscriptions();
  const now = new Date();
  const tomorrowPlus28 = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);
  
  for (const sub of subscriptions) {
    const expiry = new Date(sub.expirationDateTime);
    if (expiry <= tomorrowPlus28) {
      // Renew
      const updated = await client.api(
        `/subscriptions/${sub.id}`
      ).patch({
        expirationDateTime: new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000)
      });
      
      logger.info(`Renewed subscription ${sub.id}`);
    }
  }
}

// Run every 24 hours
setInterval(renewSubscriptionsIfNeeded, 24 * 60 * 60 * 1000);
```

### Cleanup

When Entra group members change:

```javascript
// Get current subscriptions
const currentSubs = await getSubscriptions();
const currentMembers = await getEntraGroupMembers();

// Delete subs for members no longer in group
for (const sub of currentSubs) {
  const isMember = currentMembers.some(m => m.id === sub.userId);
  if (!isMember) {
    await client.api(`/subscriptions/${sub.id}`).delete();
    logger.info(`Deleted subscription for removed member`);
  }
}

// Create subs for new members
for (const member of currentMembers) {
  const hasSub = currentSubs.some(s => s.userId === member.id);
  if (!hasSub) {
    await createSubscription(member.id);
    logger.info(`Created subscription for new member ${member.id}`);
  }
}
```

---

## Idempotency

**Problem**: What if we receive the same webhook twice?

**Solution**: Track `sequenceNumber` per subscription

```javascript
interface WebhookLog {
  subscriptionId: string;
  lastSequenceNumber: number;
}

async function handleWebhook(req, res) {
  // ... validation ...
  
  const { value: notifications } = req.body;
  
  for (const notification of notifications) {
    const { subscriptionId, sequenceNumber } = notification;
    
    // Check if we've processed this
    const log = await getWebhookLog(subscriptionId);
    
    if (log && log.lastSequenceNumber >= sequenceNumber) {
      logger.info(`Skipping duplicate notification (seq: ${sequenceNumber})`);
      continue;
    }
    
    // Process...
    
    // Update log
    await updateWebhookLog(subscriptionId, sequenceNumber);
  }
  
  res.json({ success: true });
}
```

---

## Monitoring

### Webhook Health Checks

```javascript
interface SubscriptionHealth {
  subscriptionId: string;
  lastNotification: Date;
  notificationCount: number;
  failureCount: number;
  isHealthy: boolean;
}

async function getSubscriptionsHealth() {
  const subs = await getSubscriptions();
  const health = [];
  
  for (const sub of subs) {
    const stats = await getSubscriptionStats(sub.id);
    const lastNotification = new Date(stats.lastNotificationTime);
    const timeSinceLastNotification = Date.now() - lastNotification;
    const isHealthy = timeSinceLastNotification < 48 * 60 * 60 * 1000; // 2 days
    
    health.push({
      subscriptionId: sub.id,
      lastNotification,
      notificationCount: stats.count,
      failureCount: stats.failures,
      isHealthy
    });
  }
  
  return health;
}

// Expose via /health endpoint
app.get('/health', async (req, res) => {
  const health = await getSubscriptionsHealth();
  const isHealthy = health.every(h => h.isHealthy);
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    subscriptions: health
  });
});
```

---

## Testing Webhooks

### Manual Testing

Create a test script to simulate Microsoft Graph notifications:

```bash
#!/bin/bash

WEBHOOK_URL="https://your-domain.com/api/webhooks/graph"
WEBHOOK_SECRET="your-webhook-auth-secret"

# Test payload
PAYLOAD='{
  "value": [
    {
      "subscriptionId": "test-sub-123",
      "changeType": "created",
      "clientState": "test-state",
      "resource": "/users/86894ae2-0e82-4a4f-b68e-3c72b8797f42/events/test-event",
      "resourceData": {
        "id": "test-event",
        "@odata.type": "#microsoft.graph.event"
      },
      "tenantId": "85203b49-71cc-4b94-94e8-f2b4146a9884"
    }
  ]
}'

curl -X POST "$WEBHOOK_URL" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

### Expected Response

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "processed": 1
}
```

### Test Invalid Token

```bash
curl -X POST "$WEBHOOK_URL" \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

Expected: `401 Unauthorized`

---

## Troubleshooting

### Webhooks Not Received

1. **Check subscription status**:
   ```bash
   curl https://graph.microsoft.com/v1.0/subscriptions \
     -H "Authorization: Bearer $ACCESS_TOKEN"
   ```

2. **Verify webhook URL is HTTPS**:
   - Graph API only sends to HTTPS endpoints
   - Certificate must be valid (not self-signed)

3. **Check application logs**:
   ```bash
   journalctl -u teams-meeting-fetcher -f
   ```

4. **Test webhook manually** (see Testing section above)

### 401 Unauthorized Errors

- Verify `WEBHOOK_AUTH_SECRET` matches
- Check Bearer token format
- Ensure `Authorization` header is present

### High Latency/Missed Notifications

- Check server availability (firewall, load balancer)
- Review rate limiting
- Ensure database is not slow

### Subscription Renewal Failures

- Check Graph API permissions
- Verify subscription ID is valid
- Review Graph API quota usage

---

## Security Best Practices

✅ **DO:**
- Use HTTPS with valid certificate
- Validate Bearer token on every request
- Return 200 OK quickly (don't block)
- Log significant events (but not sensitive data)
- Regenerate webhook secret regularly
- Keep subscription renewal running

❌ **DON'T:**
- Log meeting content or participant info
- Trust webhook payload without validation
- Return 5xx errors for invalid tokens
- Store secrets in code or logs
- Ignore subscription expiry

