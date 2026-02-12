# API Reference

Complete API endpoint documentation for the Teams Meeting Fetcher external app.

## Base URL

```
https://your-domain.com
```

All endpoints require HTTPS. Requests return JSON.

---

## Health Check

### GET /health

Check application health status.

**Headers**:
None required (public endpoint)

**Response** (200 OK):
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2026-02-11T12:30:45.123Z",
  "graphApi": "connected|disconnected",
  "database": "connected|disconnected",
  "webhookUrl": "https://your-domain.com/api/webhooks/graph",
  "uptime": 3600,
  "version": "1.0.0"
}
```

**Status Codes**:
- `200` - Healthy
- `503` - Unhealthy (service degraded)

---

## Configuration

### GET /api/config

Get current application configuration.

**Headers**:
```
Authorization: Bearer <your-api-key>
```

**Response** (200 OK):
```json
{
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "entraGroupId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "entraGroupName": "Teams Meeting Monitors",
  "webhookUrl": "https://your-domain.com/api/webhooks/graph",
  "monitoredMembersCount": 25,
  "monitoredMeetingsTotal": 142,
  "transcriptionsCompleted": 138,
  "transcriptionsPending": 4,
  "lastWebhookReceived": "2026-02-11T12:45:00Z",
  "lastSubscriptionRenewal": "2026-02-11T11:00:00Z",
  "subscriptionExpiresAt": "2026-03-12T11:00:00Z"
}
```

**Error Responses**:
- `401` - Unauthorized (invalid API key)
- `500` - Server error

---

### PUT /api/config

Update application configuration.

**Headers**:
```
Authorization: Bearer <your-api-key>
Content-Type: application/json
```

**Request Body**:
```json
{
  "entraGroupId": "new-group-id"
}
```

**Response** (200 OK):
```json
{
  "message": "Configuration updated successfully",
  "config": {
    "entraGroupId": "new-group-id",
    "webhookUrl": "https://your-domain.com/api/webhooks/graph",
    "subscriptionStatus": "renewed"
  }
}
```

**Error Responses**:
- `400` - Invalid request (missing/invalid fields)
- `401` - Unauthorized
- `409` - Configuration conflict

---

## Meetings

### GET /api/meetings

List all meetings with optional filtering.

**Headers**:
```
Authorization: Bearer <your-api-key>
```

**Query Parameters** (all optional):
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | `scheduled\|recording\|transcript_pending\|completed\|failed` |
| `from` | ISO 8601 | Start date (e.g., `2026-02-01T00:00:00Z`) |
| `to` | ISO 8601 | End date |
| `organizer` | string | Organizer email or user ID |
| `attendee` | string | Attendee email (search by participant) |
| `subject` | string | Meeting subject (case-insensitive substring) |
| `page` | number | Page number (1-indexed, default: 1) |
| `pageSize` | number | Results per page (default: 20, max: 100) |
| `sortBy` | string | `startTime\|subject\|organizer` (default: startTime) |
| `sortOrder` | string | `asc\|desc` (default: desc) |

**Example Request**:
```bash
GET /api/meetings?status=completed&from=2026-02-01T00:00:00Z&sortBy=startTime&sortOrder=desc
```

**Response** (200 OK):
```json
{
  "meetings": [
    {
      "id": "AAMkADI5NGY1MjE0LTY5ZWItNDI3ZC04ZjZjLWJjY2RiMzhjOGYzZABGAAAAAADwpkAKX2JpS6p7xmZ1Nts4BwBCPH0mQhHMSJtG9QAKy-gIAADwpkAKX2JpS6p7xmZ1Nts4",
      "graphEventId": "AAMkADI5NGY1MjE0LTY5ZWItNDI3ZC04ZjZjLWJjY2RiMzhjOGYzZABGAAAAAADwpkAKX2JpS6p7xmZ1Nts4BwBCPH0mQhHMSJtG9QAKy-gIAADwpkAKX2JpS6p7xmZ1Nts4",
      "subject": "Q1 Planning Session",
      "description": "Quarterly planning and roadmap discussion",
      "startTime": "2026-02-11T10:00:00Z",
      "endTime": "2026-02-11T11:00:00Z",
      "isRecurring": false,
      "organizer": {
        "id": "86894ae2-0e82-4a4f-b68e-3c72b8797f42",
        "email": "john.doe@company.com",
        "displayName": "John Doe"
      },
      "attendees": [
        {
          "id": "25aae5ab-728e-4a7a-83e8-2b0c8ce3dd3a",
          "email": "jane.smith@company.com",
          "displayName": "Jane Smith",
          "status": "accepted"
        }
      ],
      "recording": {
        "id": "VBBwaT0CXkKZxhvx4Xl.yO5r",
        "status": "available",
        "createdAt": "2026-02-11T11:05:00Z",
        "url": "/api/meetings/AAMkADI5NGY1MjE0LTY5ZWItNDI3ZC04ZjZjLWJjY2RiMzhjOGYzZA/recording"
      },
      "transcription": {
        "id": "transcript-001-abc",
        "status": "completed|transcript_pending|failed",
        "createdAt": "2026-02-11T11:35:00Z",
        "updatedAt": "2026-02-11T11:35:00Z",
        "url": "/api/meetings/AAMkADI5NGY1MjE0LTY5ZWItNDI3ZC04ZjZjLWJjY2RiMzhjOGYzZA/transcription"
      },
      "overallStatus": "scheduled|recording|transcript_pending|completed|failed"
    }
  ],
  "pagination": {
    "totalCount": 142,
    "pageSize": 20,
    "currentPage": 1,
    "totalPages": 8
  }
}
```

**Status Codes**:
- `200` - Success
- `400` - Invalid query parameters
- `401` - Unauthorized

---

### GET /api/meetings/:id

Get details for a single meeting.

**Headers**:
```
Authorization: Bearer <your-api-key>
```

**URL Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Internal meeting ID |

**Response** (200 OK):
```json
{
  "id": "AAMkADI5NGY1MjE0LTY5ZWItNDI3ZC04ZjZjLWJjY2RiMzhjOGYzZA",
  "subject": "Q1 Planning Session",
  "description": "Quarterly planning and roadmap discussion",
  "startTime": "2026-02-11T10:00:00Z",
  "endTime": "2026-02-11T11:00:00Z",
  "organizer": {
    "id": "86894ae2-0e82-4a4f-b68e-3c72b8797f42",
    "email": "john.doe@company.com",
    "displayName": "John Doe"
  },
  "attendees": [
    {
      "id": "25aae5ab-728e-4a7a-83e8-2b0c8ce3dd3a",
      "email": "jane.smith@company.com",
      "displayName": "Jane Smith",
      "status": "accepted",
      "responseTime": "2026-02-10T14:30:00Z"
    }
  ],
  "recording": {
    "id": "VBBwaT0CXkKZxhvx4Xl.yO5r",
    "status": "available",
    "createdAt": "2026-02-11T11:05:00Z",
    "duration": 3600
  },
  "transcription": {
    "id": "transcript-001-abc",
    "status": "completed",
    "wordCount": 2450,
    "createdAt": "2026-02-11T11:35:00Z"
  },
  "webhookEvents": [
    {
      "timestamp": "2026-02-10T10:00:00Z",
      "event": "meeting_scheduled",
      "details": "Meeting scheduled"
    },
    {
      "timestamp": "2026-02-11T11:05:00Z",
      "event": "recording_available",
      "details": "Recording completed"
    },
    {
      "timestamp": "2026-02-11T11:35:00Z",
      "event": "transcription_available",
      "details": "Transcription ready"
    }
  ]
}
```

**Error Responses**:
- `404` - Meeting not found
- `401` - Unauthorized

---

## Transcriptions

### GET /api/meetings/:id/transcription

Get transcription text for a meeting.

**Headers**:
```
Authorization: Bearer <your-api-key>
```

**Response** (200 OK):
```json
{
  "id": "transcript-001-abc",
  "meetingId": "AAMkADI5NGY1MjE0LTY5ZWItNDI3ZC04ZjZjLWJjY2RiMzhjOGYzZA",
  "status": "completed|transcript_pending|failed",
  "language": "en-US",
  "content": "John: Good morning everyone, welcome to our Q1 planning session... [full transcription text]",
  "wordCount": 2450,
  "createdAt": "2026-02-11T11:35:00Z",
  "updatedAt": "2026-02-11T11:35:00Z"
}
```

**Error Responses**:
- `404` - Transcription not found
- `401` - Unauthorized

---

### GET /api/meetings/:id/transcription/download

Download transcription as file.

**Headers**:
```
Authorization: Bearer <your-api-key>
```

**Query Parameters** (optional):
| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | `txt\|vtt\|srt` (default: txt) |

**Response** (200 OK):
Binary file download
- Content-Type: `text/plain` or `text/vtt` or `application/x-subrip`
- Content-Disposition: `attachment; filename="meeting-subject-2026-02-11.txt"`

**Error Responses**:
- `404` - Transcription not found
- `401` - Unauthorized

---

## Webhooks

### POST /api/webhooks/graph

Receive Microsoft Graph change notifications.

⚠️ **This endpoint is called by Microsoft Graph, not by your client.**

**Note**: Bearer token is validated by upstream API Manager. No auth header validation needed in app.

**Headers**:
```
Content-Type: application/json
```

**Request Body** (Microsoft Graph format):
```json
{
  "value": [
    {
      "subscriptionId": "00000000-0000-0000-0000-000000000000",
      "changeType": "created|updated|deleted",
      "clientState": "secret-state-value",
      "resource": "/me/events/AAMkADI5NGY1MjE0",
      "sequenceNumber": 1,
      "tenantId": "85203b49-71cc-4b94-94e8-f2b4146a9884",
      "resourceData": {
        "id": "AAMkADI5NGY1MjE0",
        "@odata.type": "#microsoft.graph.event"
      },
      "webhookExpirationDateTime": "2026-03-12T11:00:00Z",
      "encryptedContent": null
    }
  ]
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "processed": 1,
  "errors": [],
  "timestamp": "2026-02-11T12:30:45.123Z"
}
```

**Processing Flow**:
1. Validate `Authorization` Bearer token
2. Parse change notification
3. Fetch full event from Graph API
4. Check organizer membership in target Entra group
5. Store/update meeting record
6. Begin transcription polling if recording available
7. Return 200 OK

**Error Responses**:
- `401` - Unauthorized (invalid Bearer token)
- `400` - Malformed request
- `429` - Rate limited
- `500` - Server error (still return 200 eventually)

---

## Error Handling

All endpoints return error responses in this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "details": {
      "field": "error value"
    },
    "timestamp": "2026-02-11T12:30:45.123Z",
    "requestId": "req-abc123xyz"
  }
}
```

**Common Error Codes**:
| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Authenticated but not authorized |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `CONFLICT` | 409 | Configuration or data conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

---

## Rate Limiting

Rate limits apply per API key:

| Endpoint | Limit | Window |
|----------|-------|--------|
| GET /api/meetings | 60 req/min | 1 minute |
| GET /api/meetings/:id | 60 req/min | 1 minute |
| POST /api/webhooks/graph | 1000 req/min | 1 minute |
| GET /health | Unlimited | N/A |

**Headers** (in response):
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1644579045
```

When limit exceeded:
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded",
    "retryAfter": 60
  }
}
```

---

## Pagination

List endpoints use cursor-based pagination:

**Query Parameters**:
```
?page=1&pageSize=20
```

**Response** (in `pagination` object):
```json
{
  "pagination": {
    "totalCount": 142,
    "pageSize": 20,
    "currentPage": 1,
    "totalPages": 8,
    "nextPage": 2,
    "prevPage": null
  }
}
```

---

## Timestamps

All timestamps are in ISO 8601 format (UTC):
```
2026-02-11T12:30:45.123Z
```

---

## API Keys

Manage API keys via configuration or admin endpoint (*future feature*).

Current implementation uses:
- Environment variable `API_KEY` for management endpoints
- `WEBHOOK_AUTH_SECRET` for webhook endpoint

---

## Examples

### List Recent Meetings
```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://your-domain.com/api/meetings?sortBy=startTime&sortOrder=desc&pageSize=10"
```

### Get Completed Transcriptions
```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://your-domain.com/api/meetings?status=completed&pageSize=50"
```

### Download Transcription
```bash
curl -H "Authorization: Bearer $API_KEY" \
  "https://your-domain.com/api/meetings/AAMkADI5NGY1MjE0/transcription/download?format=txt" \
  -o meeting-transcript.txt
```

### Test Bearer Token (Webhook)
```bash
curl -X POST https://your-domain.com/api/webhooks/graph \
  -H "Authorization: Bearer $WEBHOOK_AUTH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"value": []}'
```

---

## Versioning

Current API version: **v1** (in URL structure for future compatibility)

Future: `/api/v2/meetings` etc.

