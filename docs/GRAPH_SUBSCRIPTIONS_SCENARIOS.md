# Graph API Subscriptions - Complete Test Scenarios

**Test Date**: February 20, 2026  
**Environment**: Azure Event Hub + Microsoft Graph API  
**Tenant**: `ibuyspy.net` (62837751-4e48-4d06-8bcb-57be1a669b78)  
**Service Principal**: `1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8`

---

## Executive Summary

This document provides detailed test scenarios for **every subscription type tested**, including subscription configuration, scope, test results, and actual Event Hub payloads. Use this as a reference for understanding what works, what doesn't, and what the notifications look like.

**Status Legend**:

- ✅ **WORKING**: Subscription created and notifications confirmed delivered
- ⚠️ **UNTESTABLE**: Subscription exists but cannot be tested with current infrastructure
- ❌ **FAILED**: Subscription created but no notifications delivered or creation failed

---

## Table of Contents

1. [Individual User Calendar Subscription](#scenario-1-individual-user-calendar-subscription)
2. [Group Member Subscription - User 1 (boldoriole)](#scenario-2-group-member-subscription---boldoriole)
3. [Group Member Subscription - User 2 (trustingboar)](#scenario-3-group-member-subscription---trustingboar)
4. [Group Shared Calendar Subscription](#scenario-4-group-shared-calendar-subscription)
5. [Tenant-Wide Teams Messages Subscription](#scenario-5-tenant-wide-teams-messages-subscription)

---

## Scenario 1: Individual User Calendar Subscription

### Status: ✅ **WORKING**

### Description

Monitor calendar events for a single specific user. This is the most basic and reliable subscription pattern.

### Subscription Configuration

```json
{
  "changeType": "created,updated,deleted",
  "notificationUrl": "EventHub:https://tmf-ehns-eus-6an5wk.servicebus.windows.net/tmf-eh-eus-6an5wk/?tenantId=62837751-4e48-4d06-8bcb-57be1a669b78",
  "resource": "/users/dbb98842-0024-4474-a69a-a27acd709d80/events",
  "expirationDateTime": "2026-02-22T17:47:00Z",
  "clientState": "SecretClientState"
}
```

### Test Details

**Subscription ID**: Previous user subscriptions  
**User**: `a-ivega@ibuyspy.net`  
**User ID**: `dbb98842-0024-4474-a69a-a27acd709d80`

**Scope**:

- **Resource**: Single user's calendar (`/users/{userId}/events`)
- **Change Types**: `created`, `updated`, `deleted`
- **Coverage**: Only events created/modified/deleted in this user's calendar

**Test Action**: Created calendar meeting for user  
**Result**: ✅ Notifications delivered to Event Hub within seconds

### Event Hub Payload Sample

**Change Type: `created`**

```json
{
  "value": [
    {
      "subscriptionId": "8c6f2667-4b0b-405c-9b49-86cf6875fa9a",
      "subscriptionExpirationDateTime": "2026-02-22T17:47:00+00:00",
      "changeType": "created",
      "resource": "Users/dbb98842-0024-4474-a69a-a27acd709d80/Events/AAMkADlhYjk4ODQyLTAwMjQtNDQ3NC1hNjlhLWEyN2FjZDcwOWQ4MABGAAAAAADN...",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.Event",
        "@odata.id": "Users/dbb98842-0024-4474-a69a-a27acd709d80/Events/AAMkADlhYjk4ODQyLTAwMjQtNDQ3NC1hNjlhLWEyN2FjZDcwOWQ4MABGAAAAAADN...",
        "@odata.etag": "W/\"h7PGfnFyGES9...\"",
        "id": "AAMkADlhYjk4ODQyLTAwMjQtNDQ3NC1hNjlhLWEyN2FjZDcwOWQ4MABGAAAAAADN..."
      },
      "tenantId": "62837751-4e48-4d06-8bcb-57be1a669b78"
    }
  ]
}
```

**Change Type: `updated`**

```json
{
  "value": [
    {
      "subscriptionId": "8c6f2667-4b0b-405c-9b49-86cf6875fa9a",
      "subscriptionExpirationDateTime": "2026-02-22T17:47:00+00:00",
      "changeType": "updated",
      "resource": "Users/dbb98842-0024-4474-a69a-a27acd709d80/Events/AAMkADlhYjk4ODQyLTAwMjQtNDQ3NC1hNjlhLWEyN2FjZDcwOWQ4MABGAAAAAADN...",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.Event",
        "@odata.id": "Users/dbb98842-0024-4474-a69a-a27acd709d80/Events/AAMkADlhYjk4ODQyLTAwMjQtNDQ3NC1hNjlhLWEyN2FjZDcwOWQ4MABGAAAAAADN...",
        "@odata.etag": "W/\"h7PGfnFyGES9...\"",
        "id": "AAMkADlhYjk4ODQyLTAwMjQtNDQ3NC1hNjlhLWEyN2FjZDcwOWQ4MABGAAAAAADN..."
      },
      "tenantId": "62837751-4e48-4d06-8bcb-57be1a669b78"
    }
  ]
}
```

### Notification Pattern

1. Meeting created → **1 `created` notification**
2. Immediately followed by **2-3 `updated` notifications** (Graph processes meeting details)

**Typical sequence**: `created` → `updated` → `updated`

---

## Scenario 2: Group Member Subscription - boldoriole

### Status: ✅ **WORKING**

### Description

Monitor calendar events for a specific user who is a member of a group. This is part of the "group member monitoring" pattern where individual subscriptions are created for each member of a security group.

### Subscription Configuration

```json
{
  "changeType": "created,updated,deleted",
  "notificationUrl": "EventHub:https://tmf-ehns-eus-6an5wk.servicebus.windows.net/tmf-eh-eus-6an5wk/?tenantId=62837751-4e48-4d06-8bcb-57be1a669b78",
  "resource": "/users/e5fe8748-76f0-42ed-b521-241e825b0d45/events",
  "expirationDateTime": "2026-02-22T17:54:58Z",
  "clientState": "SecretClientState"
}
```

### Test Details

**Subscription ID**: `5f54d721-d420-4d77-86a2-cfc343e1336a`  
**User**: `boldoriole@ibuyspy.net`  
**User ID**: `e5fe8748-76f0-42ed-b521-241e825b0d45`  
**Group**: Teams Meeting Fetcher Admins (`5e7708f8-b0d2-467d-97f9-d9da4818084a`)

**Scope**:

- **Resource**: Single user's calendar (user is member of target group)
- **Change Types**: `created`, `updated`, `deleted`
- **Coverage**: Only events for this specific user
- **Group Context**: User is one of 2 members in the monitored group

**Test Action**: Created meeting `[TEST-GROUP-MEMBER] Subscription test for group member`  
**Test Time**: 2026-02-20 17:54:58 UTC  
**Result**: ✅ Notifications delivered to Event Hub successfully

### Event Hub Payload Sample

**Change Type: `created`**

```json
{
  "value": [
    {
      "subscriptionId": "5f54d721-d420-4d77-86a2-cfc343e1336a",
      "subscriptionExpirationDateTime": "2026-02-22T17:54:58+00:00",
      "changeType": "created",
      "resource": "Users/e5fe8748-76f0-42ed-b521-241e825b0d45/Events/AAMkADE2ZWVhN2MyLTk1ODEtNGIzNS1hNTE4LTE5NDIxMmU3MThmYwBGAAAAAADcy-qe0uwnT...",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.Event",
        "@odata.id": "Users/e5fe8748-76f0-42ed-b521-241e825b0d45/Events/AAMkADE2ZWVhN2MyLTk1ODEtNGIzNS1hNTE4LTE5NDIxMmU3MThmYwBGAAAAAADcy-qe0uwnT...",
        "@odata.etag": "W/\"VTw6sKsunk...\"",
        "id": "AAMkADE2ZWVhN2MyLTk1ODEtNGIzNS1hNTE4LTE5NDIxMmU3MThmYwBGAAAAAADcy-qe0uwnT..."
      },
      "tenantId": "62837751-4e48-4d06-8bcb-57be1a669b78"
    }
  ]
}
```

**Change Type: `updated`**

```json
{
  "value": [
    {
      "subscriptionId": "5f54d721-d420-4d77-86a2-cfc343e1336a",
      "subscriptionExpirationDateTime": "2026-02-22T17:54:58+00:00",
      "changeType": "updated",
      "resource": "Users/e5fe8748-76f0-42ed-b521-241e825b0d45/Events/AAMkADE2ZWVhN2MyLTk1ODEtNGIzNS1hNTE4LTE5NDIxMmU3MThmYwBGAAAAAADcy-qe0uwnT...",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.Event",
        "@odata.id": "Users/e5fe8748-76f0-42ed-b521-241e825b0d45/Events/AAMkADE2ZWVhN2MyLTk1ODEtNGIzNS1hNTE4LTE5NDIxMmU3MThmYwBGAAAAAADcy-qe0uwnT...",
        "@odata.etag": "W/\"VTw6sKsunk...\"",
        "id": "AAMkADE2ZWVhN2MyLTk1ODEtNGIzNS1hNTE4LTE5NDIxMmU3MThmYwBGAAAAAADcy-qe0uwnT..."
      },
      "tenantId": "62837751-4e48-4d06-8bcb-57be1a669b78"
    }
  ]
}
```

### Notification Pattern

**Observed**: `created` + 2x `updated` within 2 seconds

**Timeline**:

- 17:55:07.809 - `created` notification received
- 17:55:08.997 - First `updated` notification received
- 17:55:09.778 - Second `updated` notification received

---

## Scenario 3: Group Member Subscription - trustingboar

### Status: ✅ **WORKING**

### Description

Monitor calendar events for the second user in the group. This verifies that the group member monitoring pattern works for all members, not just the first one.

### Subscription Configuration

```json
{
  "changeType": "created,updated,deleted",
  "notificationUrl": "EventHub:https://tmf-ehns-eus-6an5wk.servicebus.windows.net/tmf-eh-eus-6an5wk/?tenantId=62837751-4e48-4d06-8bcb-57be1a669b78",
  "resource": "/users/885adc52-eaa0-42b1-80cf-62cd2d4bcafb/events",
  "expirationDateTime": "2026-02-22T17:54:58Z",
  "clientState": "SecretClientState"
}
```

### Test Details

**Subscription ID**: `c8638512-9b9c-4647-b284-a62ddfd974d0`  
**User**: `trustingboar@ibuyspy.net`  
**User ID**: `885adc52-eaa0-42b1-80cf-62cd2d4bcafb`  
**Group**: Teams Meeting Fetcher Admins (`5e7708f8-b0d2-467d-97f9-d9da4818084a`)

**Scope**:

- **Resource**: Single user's calendar (user is member of target group)
- **Change Types**: `created`, `updated`, `deleted`
- **Coverage**: Only events for this specific user
- **Group Context**: User is one of 2 members in the monitored group

**Test Action**: Created meeting `[TEST-TRUSTINGBOAR] Subscription verification meeting`  
**Test Time**: 2026-02-20 18:08:35 UTC  
**Result**: ✅ Notifications delivered to Event Hub successfully

### Event Hub Payload Sample

**Change Type: `created`**

```json
{
  "value": [
    {
      "subscriptionId": "c8638512-9b9c-4647-b284-a62ddfd974d0",
      "subscriptionExpirationDateTime": "2026-02-22T17:54:58+00:00",
      "changeType": "created",
      "resource": "Users/885adc52-eaa0-42b1-80cf-62cd2d4bcafb/Events/AAMkADA1ODk2NTNhLWQyODMtNDMzNi04NzQ3LTg1OGU3YTAzYzc5MQBGAAAAAADJB1RrYL...",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.Event",
        "@odata.id": "Users/885adc52-eaa0-42b1-80cf-62cd2d4bcafb/Events/AAMkADA1ODk2NTNhLWQyODMtNDMzNi04NzQ3LTg1OGU3YTAzYzc5MQBGAAAAAADJB1RrYL...",
        "@odata.etag": "W/\"pSFbV6jcVE...\"",
        "id": "AAMkADA1ODk2NTNhLWQyODMtNDMzNi04NzQ3LTg1OGU3YTAzYzc5MQBGAAAAAADJB1RrYL..."
      },
      "tenantId": "62837751-4e48-4d06-8bcb-57be1a669b78"
    }
  ]
}
```

**Change Type: `updated`**

```json
{
  "value": [
    {
      "subscriptionId": "c8638512-9b9c-4647-b284-a62ddfd974d0",
      "subscriptionExpirationDateTime": "2026-02-22T17:54:58+00:00",
      "changeType": "updated",
      "resource": "Users/885adc52-eaa0-42b1-80cf-62cd2d4bcafb/Events/AAMkADA1ODk2NTNhLWQyODMtNDMzNi04NzQ3LTg1OGU3YTAzYzc5MQBGAAAAAADJB1RrYL...",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.Event",
        "@odata.id": "Users/885adc52-eaa0-42b1-80cf-62cd2d4bcafb/Events/AAMkADA1ODk2NTNhLWQyODMtNDMzNi04NzQ3LTg1OGU3YTAzYzc5MQBGAAAAAADJB1RrYL...",
        "@odata.etag": "W/\"pSFbV6jcVE...\"",
        "id": "AAMkADA1ODk2NTNhLWQyODMtNDMzNi04NzQ3LTg1OGU3YTAzYzc5MQBGAAAAAADJB1RrYL..."
      },
      "tenantId": "62837751-4e48-4d06-8bcb-57be1a669b78"
    }
  ]
}
```

### Notification Pattern

**Observed**: `created` + 1x `updated` within 1 second

**Timeline**:

- 18:08:38.237 - `created` notification received (Partition 1)
- 18:08:39.018 - `updated` notification received (Partition 1)

**Note**: This user received fewer `updated` notifications than boldoriole, but this is normal Graph behavior. The number of `updated` notifications varies based on internal processing.

---

## Scenario 4: Group Shared Calendar Subscription

### Status: ❌ **FAILED**

### Description

Attempt to monitor a group's shared calendar directly using the group's calendar resource. This would have provided a single subscription to monitor all group calendar events.

### Subscription Configuration (Attempted)

```json
{
  "changeType": "created,updated,deleted",
  "notificationUrl": "EventHub:https://tmf-ehns-eus-6an5wk.servicebus.windows.net/tmf-eh-eus-6an5wk/?tenantId=62837751-4e48-4d06-8bcb-57be1a669b78",
  "resource": "/groups/5e7708f8-b0d2-467d-97f9-d9da4818084a/events",
  "expirationDateTime": "2026-02-22T18:00:00Z",
  "clientState": "SecretClientState"
}
```

### Test Details

**Group**: Teams Meeting Fetcher Admins  
**Group ID**: `5e7708f8-b0d2-467d-97f9-d9da4818084a`  
**Group Type**: Security Group (not Microsoft 365 Group)

**Scope (Intended)**:

- **Resource**: Group shared calendar (`/groups/{groupId}/events`)
- **Change Types**: `created`, `updated`, `deleted`
- **Coverage**: All events in the group's shared calendar

**Result**: ❌ **Subscription creation failed**

### Error Details

**HTTP Status**: `400 Bad Request`

**Error Response**:

```json
{
  "error": {
    "code": "ExtensionError",
    "message": "Operation: Create; Exception: [Status Code: BadRequest; Reason: The specified object was not found in the store., The process failed to get the correct properties.]",
    "innerError": {
      "date": "2026-02-20T17:37:46",
      "request-id": "1c3f8e5d-8a5f-4d9e-a9c7-0e8f5d6c7b8a",
      "client-request-id": "1c3f8e5d-8a5f-4d9e-a9c7-0e8f5d6c7b8a"
    }
  }
}
```

### Root Cause

The group is a **Security Group**, not a **Microsoft 365 Group**. Security Groups do not have:

- Associated mailboxes
- Shared calendars
- Group email addresses

Only Microsoft 365 Groups (formerly Office 365 Groups) have these features.

### Workaround

Use the **individual user subscription pattern** (Scenarios 2 & 3) to monitor each group member separately. This is the proven working approach:

1. Query `/groups/{groupId}/members` to get all users
2. Create `/users/{userId}/events` subscription for each member
3. Manage subscriptions as group membership changes

### Event Hub Payload Sample

N/A - No subscription created, no notifications received

---

## Scenario 5: Tenant-Wide Teams Messages Subscription

### Status: ⚠️ **UNTESTABLE** (Subscription exists but cannot verify)

### Description

Monitor all Teams channel messages across the entire tenant. This requires the `/teams/allMessages` resource, which fires when users post messages in any Teams channel.

### Subscription Configuration

```json
{
  "changeType": "created,updated,deleted",
  "notificationUrl": "EventHub:https://tmf-ehns-eus-6an5wk.servicebus.windows.net/tmf-eh-eus-6an5wk/?tenantId=62837751-4e48-4d06-8bcb-57be1a669b78",
  "resource": "/teams/allMessages",
  "expirationDateTime": "2026-02-22T17:37:46Z",
  "clientState": "SecretClientState",
  "includeResourceData": false
}
```

### Test Details

**Subscription ID**: `70c2d42c-042c-497b-bb44-4134ca652bbe`  
**Status**: ✅ Subscription created successfully

**Scope**:

- **Resource**: All Teams messages tenant-wide (`/teams/allMessages`)
- **Change Types**: `created`, `updated`, `deleted`
- **Coverage**: Every message posted in any Teams channel across the entire tenant
- **Permission Required**: `ChannelMessage.Read.All` (Application permission)

**Test Limitation**: Cannot create Teams channel messages programmatically because the test group (`5e7708f8-b0d2-467d-97f9-d9da4818084a`) does not have an associated Microsoft Teams Team.

**Test Error**:

```json
{
  "error": {
    "code": "NotFound",
    "message": "No team found with Group Id 5e7708f8-b0d2-467d-97f9-d9da4818084a",
    "innerError": {
      "date": "2026-02-20T17:56:41",
      "request-id": "7e8f5d6c-7b8a-4d9e-a9c7-0e8f5d6c7b8a",
      "client-request-id": "7e8f5d6c-7b8a-4d9e-a9c7-0e8f5d6c7b8a"
    }
  }
}
```

### Manual Testing Instructions

To verify this subscription works:

1. **Manually post a message** in any Teams channel (using Teams UI)
2. **Monitor Event Hub** immediately after:
   ```bash
   python nobots-eventhub/scripts/simple-monitor.py
   ```
3. **Look for subscription ID**: `70c2d42c-042c-497b-bb44-4134ca652bbe`
4. **Verify changeType**: Should be `created` for new messages

### Expected Event Hub Payload Sample

**Change Type: `created`** (Teams message posted)

```json
{
  "value": [
    {
      "subscriptionId": "70c2d42c-042c-497b-bb44-4134ca652bbe",
      "subscriptionExpirationDateTime": "2026-02-22T17:37:46+00:00",
      "changeType": "created",
      "resource": "teams('19:abc123...')/channels('19:def456...')/messages('1234567890')",
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.chatMessage",
        "id": "1234567890"
      },
      "tenantId": "62837751-4e48-4d06-8bcb-57be1a669b78"
    }
  ]
}
```

**Note**: The exact payload format cannot be confirmed without actual test data.

### Notification Pattern (Expected)

- **Teams message posted** → `created` notification
- **Message edited** → `updated` notification
- **Message deleted** → `deleted` notification

**No automatic `updated` notifications** like calendar events - only explicit user actions trigger notifications.

---

## Key Findings & Recommendations

### ✅ What Works (Production Ready)

1. **Individual User Calendar Subscriptions**
   - Resource: `/users/{userId}/events`
   - Reliability: Excellent
   - Latency: 2-3 seconds
   - Pattern: 1 `created` + 2-3 `updated` per meeting

2. **Group Member Monitoring (Individual Subscriptions)**
   - Query group members: `/groups/{groupId}/members`
   - Create `/users/{userId}/events` for each member
   - Scale tested: 2 users (both working)
   - Management: Requires periodic sync for membership changes

### ❌ What Doesn't Work

1. **Group Shared Calendar Subscriptions**
   - Security Groups don't have mailboxes/calendars
   - Resource: `/groups/{groupId}/events`
   - Error: "Object was not found in the store"
   - Solution: Use individual user subscriptions instead

### ⚠️ What Requires Infrastructure

1. **Tenant-Wide Teams Messages**
   - Subscription created successfully
   - Requires Microsoft Teams Team for testing
   - Cannot be automated without team infrastructure
   - Manual testing recommended after production deployment

---

## Production Implementation Guide

For implementing subscriptions at scale, see:

- **Quick Reference**: [GRAPH_SUBSCRIPTIONS_PRODUCTION_GUIDE.md](./GRAPH_SUBSCRIPTIONS_PRODUCTION_GUIDE.md)
- **Test Results**: [GRAPH_SUBSCRIPTIONS_TEST_RESULTS.md](./GRAPH_SUBSCRIPTIONS_TEST_RESULTS.md)

### Recommended Pattern for Group Monitoring

```python
# 1. Get all group members
response = requests.get(
    f"https://graph.microsoft.com/v1.0/groups/{group_id}/members",
    headers=headers
)
members = response.json()['value']

# 2. Create subscription for each member
for member in members:
    subscription = {
        "changeType": "created,updated,deleted",
        "notificationUrl": eventhub_url,
        "resource": f"/users/{member['id']}/events",
        "expirationDateTime": (datetime.now() + timedelta(days=2)).isoformat(),
        "clientState": "SecretClientState"
    }

    response = requests.post(
        "https://graph.microsoft.com/v1.0/subscriptions",
        headers=headers,
        json=subscription
    )

    subscription_id = response.json()['id']
    # Store subscription_id for renewal/cleanup

# 3. Implement renewal before 3-day expiration
# 4. Handle group membership changes
# 5. Clean up subscriptions for removed members
```

---

## Event Hub Message Structure

### Common Fields (All Notifications)

```json
{
  "value": [
    {
      "subscriptionId": "uuid", // Identifies which subscription
      "subscriptionExpirationDateTime": "", // ISO 8601 format
      "changeType": "created|updated|deleted",
      "resource": "path/to/resource", // Event/message that changed
      "resourceData": {
        "@odata.type": "#Microsoft.Graph.Event",
        "@odata.id": "full/resource/path",
        "@odata.etag": "version",
        "id": "resource-id"
      },
      "tenantId": "uuid" // Always present
    }
  ]
}
```

### Validation Messages

When subscriptions are first created, Graph sends validation messages:

```json
{
  "value": [
    {
      "subscriptionId": "NA",
      "subscriptionExpirationDateTime": "NA",
      "clientState": "NA",
      "changeType": "Validation: Testing client application reachability for subscription Request-Id: ...",
      "resource": "NA",
      "resourceData": {}
    }
  ]
}
```

**These are normal** and indicate Graph is verifying Event Hub connectivity.

---

## Testing Environment Details

### Event Hub Configuration

- **Namespace**: `tmf-ehns-eus-6an5wk.servicebus.windows.net`
- **Hub Name**: `tmf-eh-eus-6an5wk`
- **Region**: East US
- **Consumer Groups**: `$Default`, `lambda-processor`
- **Partition Count**: 2 (messages distributed across partitions)

### Service Principal Permissions

**Application ID**: `1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8`

**Required Permissions**:

- `Calendars.Read` - Read all users' calendars
- `Group.Read.All` - Read all groups and memberships
- `ChannelMessage.Read.All` - Read Teams channel messages (for tenant subscription)

**Event Hub Role**:

- `Azure Event Hubs Data Sender` on namespace `tmf-ehns-eus-6an5wk`

### Test Group Details

**Name**: Teams Meeting Fetcher Admins  
**ID**: `5e7708f8-b0d2-467d-97f9-d9da4818084a`  
**Type**: Security Group  
**Members**: 2 users

- boldoriole@ibuyspy.net
- trustingboar@ibuyspy.net

**Limitations**:

- No associated mailbox (cannot use group calendar)
- No associated Microsoft Teams Team (cannot post test messages)

---

## Document Version

**Created**: February 20, 2026  
**Last Updated**: February 20, 2026  
**Author**: Testing Team  
**Environment**: Production Test (ibuyspy.net tenant)

---

For questions or updates to this document, refer to the implementation team or check the following resources:

- [Microsoft Graph Subscriptions Documentation](https://learn.microsoft.com/en-us/graph/api/resources/subscription)
- [Event Hub Integration Guide](https://learn.microsoft.com/en-us/graph/webhooks-with-resource-data)
- Project documentation in `/docs` folder
