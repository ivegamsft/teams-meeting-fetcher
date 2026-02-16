# Subscription Management API Documentation

## Overview

The Teams Meeting Fetcher includes a unified subscription management system that handles both user-specific and tenant-wide Microsoft Graph API subscriptions. This allows you to manage webhooks for various resources like meeting transcripts, calendar events, and more.

## Architecture

### SubscriptionManager Class

The `SubscriptionManager` provides a consistent interface for managing Graph API subscriptions with the following features:

- **Unified Management**: Handle both user-specific and tenant-wide subscriptions with the same API
- **Auto-Renewal**: Automatically renew subscriptions before they expire
- **State Tracking**: Store subscription metadata in DynamoDB for persistence
- **Error Handling**: Robust error handling with detailed logging
- **Lifecycle Management**: Handle Graph API lifecycle notifications

### Subscription Types

The system supports two types of subscriptions:

1. **USER**: User-specific subscriptions (e.g., single user's transcripts or calendar)
2. **TENANT**: Tenant-wide subscriptions (e.g., all meetings, all transcripts)

### Supported Resources

- **Transcripts**
  - Tenant-wide: `communications/onlineMeetings/getAllTranscripts`
  - User-specific: `users/{userId}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{userId}')`
- **Meetings**
  - Tenant-wide: `communications/onlineMeetings`
- **Calendar Events**
  - User-specific: `users/{userId}/events`
  - Group-specific: `groups/{groupId}/events`

## REST API Endpoints

### Base URL

All subscription management endpoints are under `/bot/subscriptions`.

### Authentication

All requests must include proper Bot Framework authentication or API Gateway authorization.

---

## Endpoints

### 1. Get Subscription Details

Get details of a specific subscription from storage.

**Request:**
```
GET /bot/subscriptions/{storageKey}
```

**Parameters:**
- `storageKey` (path): Storage key for the subscription (e.g., `subscription:tenant-transcripts`)

**Response:**
```json
{
  "subscription": {
    "subscription_id": "abc-123-def-456",
    "type": "tenant",
    "resource": "communications/onlineMeetings/getAllTranscripts",
    "changeType": "created",
    "expiration": "2026-02-20T00:00:00Z",
    "status": "active",
    "notification_url": "https://example.com/notifications",
    "created_at": "2026-02-16T10:00:00Z"
  }
}
```

**Error Responses:**
- `404 Not Found`: Subscription not found

---

### 2. Manage Tenant Transcript Subscription

Create or renew the tenant-wide transcript subscription.

**Request:**
```
POST /bot/subscriptions/tenant-transcripts
```

**Body:** (none required)

**Response:**
```json
{
  "message": "Tenant transcript subscription managed",
  "subscription": {
    "subscription_id": "abc-123-def-456",
    "type": "tenant",
    "resource": "communications/onlineMeetings/getAllTranscripts",
    "expiration": "2026-02-20T00:00:00Z",
    "status": "active"
  }
}
```

**Example:**
```bash
curl -X POST https://your-api.com/bot/subscriptions/tenant-transcripts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 3. Manage User Transcript Subscription

Create or renew a user-specific transcript subscription.

**Request:**
```
POST /bot/subscriptions/user-transcripts
```

**Body:**
```json
{
  "userId": "user-id-or-email@example.com"
}
```

**Response:**
```json
{
  "message": "User transcript subscription managed",
  "subscription": {
    "subscription_id": "def-456-ghi-789",
    "type": "user",
    "resource": "users/{userId}/onlineMeetings/getAllTranscripts(...)",
    "expiration": "2026-02-20T00:00:00Z",
    "status": "active",
    "user_id": "user-id-or-email@example.com"
  }
}
```

**Example:**
```bash
curl -X POST https://your-api.com/bot/subscriptions/user-transcripts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user@example.com"}'
```

---

### 4. Manage User Calendar Subscription

Create or renew a user calendar subscription.

**Request:**
```
POST /bot/subscriptions/user-calendar
```

**Body:**
```json
{
  "userId": "user-id-or-email@example.com"
}
```

**Response:**
```json
{
  "message": "User calendar subscription managed",
  "subscription": {
    "subscription_id": "ghi-789-jkl-012",
    "type": "user",
    "resource": "users/{userId}/events",
    "changeType": "created,updated,deleted",
    "expiration": "2026-02-20T00:00:00Z",
    "status": "active",
    "user_id": "user@example.com"
  }
}
```

**Example:**
```bash
curl -X POST https://your-api.com/bot/subscriptions/user-calendar \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user@example.com"}'
```

---

### 5. Manage Group Calendar Subscription

Create or renew a group calendar subscription.

**Request:**
```
POST /bot/subscriptions/group-calendar
```

**Body:**
```json
{
  "groupId": "group-id-123"
}
```

**Response:**
```json
{
  "message": "Group calendar subscription managed",
  "subscription": {
    "subscription_id": "jkl-012-mno-345",
    "type": "tenant",
    "resource": "groups/{groupId}/events",
    "changeType": "created,updated,deleted",
    "expiration": "2026-02-20T00:00:00Z",
    "status": "active",
    "group_id": "group-id-123"
  }
}
```

**Example:**
```bash
curl -X POST https://your-api.com/bot/subscriptions/group-calendar \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"groupId": "group-id-123"}'
```

---

### 6. Delete Subscription

Delete a subscription from Microsoft Graph and mark it as deleted in storage.

**Request:**
```
DELETE /bot/subscriptions/{subscriptionId}
```

**Parameters:**
- `subscriptionId` (path): The Graph subscription ID to delete

**Body:**
```json
{
  "storageKey": "subscription:tenant-transcripts"
}
```

**Response:**
```json
{
  "message": "Subscription deleted",
  "subscriptionId": "abc-123-def-456",
  "storageKey": "subscription:tenant-transcripts"
}
```

**Example:**
```bash
curl -X DELETE https://your-api.com/bot/subscriptions/abc-123-def-456 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"storageKey": "subscription:tenant-transcripts"}'
```

---

## Subscription Storage Keys

The system uses predefined storage keys for different subscription types:

| Subscription Type | Storage Key |
|------------------|-------------|
| Tenant Transcripts | `subscription:tenant-transcripts` |
| User Transcripts | `subscription:user-transcripts:{userId}` |
| Tenant Meetings | `subscription:tenant-meetings` |
| User Calendar | `subscription:user-calendar:{userId}` |
| Group Calendar | `subscription:group-calendar:{groupId}` |

---

## Automatic Management

### Scheduled Renewal

Subscriptions are automatically checked and renewed when:

1. **Scheduled Event**: EventBridge triggers daily polls (configured in infrastructure)
2. **Expiration Check**: System checks if subscription expires within 60 minutes
3. **Auto-Renewal**: If expiring, subscription is automatically renewed for the maximum allowed duration

### Lifecycle Notifications

The system handles Microsoft Graph lifecycle notifications:

- **reauthorizationRequired**: Automatically renews the subscription
- **subscriptionRemoved**: Logs the removal and marks subscription as inactive
- **missed**: Logs missed notifications

---

## Code Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

// Create tenant-wide transcript subscription
async function createTenantSubscription() {
  const response = await axios.post(
    'https://your-api.com/bot/subscriptions/tenant-transcripts',
    {},
    { headers: { 'Authorization': 'Bearer YOUR_TOKEN' } }
  );
  console.log('Subscription created:', response.data);
}

// Create user-specific calendar subscription
async function createUserCalendarSubscription(userId) {
  const response = await axios.post(
    'https://your-api.com/bot/subscriptions/user-calendar',
    { userId },
    { headers: { 'Authorization': 'Bearer YOUR_TOKEN' } }
  );
  console.log('User calendar subscription:', response.data);
}

// Get subscription details
async function getSubscriptionDetails(storageKey) {
  const response = await axios.get(
    `https://your-api.com/bot/subscriptions/${storageKey}`,
    { headers: { 'Authorization': 'Bearer YOUR_TOKEN' } }
  );
  console.log('Subscription:', response.data.subscription);
}

// Delete subscription
async function deleteSubscription(subscriptionId, storageKey) {
  const response = await axios.delete(
    `https://your-api.com/bot/subscriptions/${subscriptionId}`,
    {
      headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
      data: { storageKey }
    }
  );
  console.log('Deleted:', response.data);
}
```

### Python

```python
import requests

BASE_URL = "https://your-api.com/bot/subscriptions"
TOKEN = "YOUR_TOKEN"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# Create tenant-wide transcript subscription
def create_tenant_subscription():
    response = requests.post(
        f"{BASE_URL}/tenant-transcripts",
        headers=HEADERS
    )
    print("Subscription created:", response.json())

# Create user-specific transcript subscription
def create_user_subscription(user_id):
    response = requests.post(
        f"{BASE_URL}/user-transcripts",
        headers=HEADERS,
        json={"userId": user_id}
    )
    print("User subscription:", response.json())

# Get subscription details
def get_subscription(storage_key):
    response = requests.get(
        f"{BASE_URL}/{storage_key}",
        headers=HEADERS
    )
    print("Subscription:", response.json())

# Delete subscription
def delete_subscription(subscription_id, storage_key):
    response = requests.delete(
        f"{BASE_URL}/{subscription_id}",
        headers=HEADERS,
        json={"storageKey": storage_key}
    )
    print("Deleted:", response.json())
```

---

## Error Handling

All endpoints return standard HTTP status codes:

- `200 OK`: Success
- `400 Bad Request`: Missing or invalid parameters
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error response format:
```json
{
  "error": "Error message describing the issue"
}
```

---

## Best Practices

1. **Monitor Expiration**: Check subscription status regularly
2. **Handle Renewals**: Implement automatic renewal logic if not using the built-in scheduler
3. **Store Subscription IDs**: Save subscription IDs returned from creation for later management
4. **Validate Notifications**: Always validate `clientState` in incoming webhook notifications
5. **Implement Retry Logic**: Graph API may be temporarily unavailable; implement exponential backoff
6. **Use Lifecycle URLs**: Provide lifecycle notification URL for subscriptions longer than 1 hour

---

## Troubleshooting

### Subscription Creation Fails

**Issue**: 403 Forbidden when creating subscription

**Solution**: 
- Verify app has required Graph API permissions
- Ensure admin consent has been granted
- Check that notification URL is HTTPS and publicly accessible

### Subscription Not Renewing

**Issue**: Subscription expires and isn't renewed

**Solution**:
- Check EventBridge schedule is configured correctly
- Verify DynamoDB table is accessible
- Check Lambda/function logs for errors

### Notifications Not Received

**Issue**: Webhook notifications not arriving

**Solution**:
- Verify notification URL is correct and accessible
- Check that subscription is active (not expired)
- Validate `clientState` matches configuration
- Check Graph service health status

---

## Security Considerations

1. **Client State**: Always use a strong, random `clientState` value
2. **Validation**: Validate all incoming notifications against the `clientState`
3. **HTTPS**: All notification URLs must use HTTPS
4. **Storage**: Store subscription credentials securely (e.g., Key Vault)
5. **Permissions**: Follow principle of least privilege for Graph API permissions

---

## Related Documentation

- [Microsoft Graph Subscriptions API](https://docs.microsoft.com/en-us/graph/api/resources/subscription)
- [Microsoft Graph Webhooks](https://docs.microsoft.com/en-us/graph/webhooks)
- [Teams Meeting Fetcher Setup Guide](../setup-guide.md)
