# Graph API Event Hub Subscriptions Setup Guide

## Overview

This document explains how to correctly set up Microsoft Graph API subscriptions to receive calendar change notifications via Azure Event Hub.

## ⚠️ CRITICAL REQUIREMENTS

### 1. Subscription Resource MUST be a GROUP, Not a User

❌ **WRONG:**

```
GRAPH_SUBSCRIPTION_RESOURCE=/users/user@company.com/events
GRAPH_SUBSCRIPTION_RESOURCE=/users/{userId}/events
```

✅ **CORRECT:**

```
GRAPH_SUBSCRIPTION_RESOURCE=/groups/<YOUR_GROUP_ID>
```

**Why?** Graph API requires group scope for multi-user calendar monitoring. Individual user subscriptions have different limitations.

### 2. Event Hub Notification URL Format (EXACT)

The URL format is strict and validated by Graph API. **Missing ANY component will cause a 400 error**.

```
EventHub:https://<eventhubnamespace>.servicebus.windows.net/eventhubname/<eventhubname>?tenantId=<domain>
```

#### Breaking It Down:

| Component          | Example                                               | Notes                                              |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------- |
| Protocol           | `EventHub:`                                           | Literal string, REQUIRED                           |
| Namespace endpoint | `https://<EVENT_HUB_NAMESPACE>.servicebus.windows.net/` | From Event Hub → Overview → Host name              |
| **Path segment**   | `eventhubname/`                                       | **Literal string**, NOT optional, NOT the hub name |
| Hub name           | `<EVENT_HUB_NAME>`                                   | The actual Event Hub name                          |
| Tenant query param | `?tenantId=<YOUR_TENANT_DOMAIN>`                               | Tenant's primary domain (Azure AD → Overview)      |

#### Complete Example:

```
EventHub:https://<EVENT_HUB_NAMESPACE>.servicebus.windows.net/eventhubname/<EVENT_HUB_NAME>?tenantId=<YOUR_TENANT_DOMAIN>
```

### 3. Required Permissions

The **Microsoft Graph Change Tracking** service principal must have:

- **Azure Event Hubs Data Sender** role on the Event Hub namespace
- **Storage Blob Data Contributor** role on the storage account (for rich notifications > 1MB)

**Verify:**

```bash
# List role assignments
az role assignment list --scope /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.EventHub/namespaces/<ns>

# Should see "Azure Event Hubs Data Sender" for the Graph SPN
```

## Setup Procedure

### Step 1: Verify Prerequisites

```bash
# Check Event Hub exists
az eventhubs namespace show --name <EVENT_HUB_NAMESPACE> --resource-group <YOUR_RESOURCE_GROUP>

# Check processor is running
Get-Job -Name processor
```

### Step 2: Update Configuration

Edit `nobots-eventhub/.env`:

```dotenv
# MUST be group ID, not user
GRAPH_SUBSCRIPTION_RESOURCE=/groups/<YOUR_GROUP_ID>

# Event Hub details from deployment
EVENT_HUB_NAMESPACE=<EVENT_HUB_NAMESPACE>.servicebus.windows.net
EVENT_HUB_NAME=<EVENT_HUB_NAME>
```

### Step 3: Create Subscription

```bash
cd nobots-eventhub
npm run subscribe
```

**Expected output:**

```
✅ Subscription created!
   ID: 7181c11e-9b4a-4000-8e8f-0eaeae5c1642
   Resource: /groups/<YOUR_GROUP_ID>
   Expires: 2/19/2026, 11:55 PM
```

### Step 4: Test

1. **Create a calendar event** (by any group member)
2. **Check processor output:**
   ```bash
   Get-Job -Name processor | Receive-Job -Keep | Select-Object -Last 10
   ```
3. **Should see** change notification from Event Hub

## Troubleshooting

### Error: `Invalid event hub notification url`

**Cause:** URL format is wrong (missing `/eventhubname/` or `?tenantId=`)

**Fix:**

```
❌ Wrong: https://<EVENT_HUB_NAMESPACE>.servicebus.windows.net/<EVENT_HUB_NAME>
✅ Right: https://<EVENT_HUB_NAMESPACE>.servicebus.windows.net/eventhubname/<EVENT_HUB_NAME>?tenantId=<YOUR_TENANT_DOMAIN>
```

### Error: `400 ValidationError`

**Causes:**

- Tenant domain doesn't match (check Azure AD → Overview → Primary domain)
- Graph SPN missing "Azure Event Hubs Data Sender" role

**Fix:**

```bash
# Verify SPN has role
az role assignment list --scope <eventhub-scope> | grep "Data Sender"

# If missing, assign it
az role assignment create \
  --role "Azure Event Hubs Data Sender" \
  --assignee-object-id f9263d58-0948-4f6f-96b9-206a737c9de7 \
  --scope <eventhub-namespace-scope>
```

### Error: `Subscription resource is a USER path`

**Cause:** `.env` has user path instead of group path

**Fix:**

```dotenv
# WRONG
GRAPH_SUBSCRIPTION_RESOURCE=/users/user@company.com/events

# RIGHT
GRAPH_SUBSCRIPTION_RESOURCE=/groups/<YOUR_GROUP_ID>
```

### No Notifications Received

**Check:**

1. Processor is running: `Get-Job -Name processor`
2. Subscription is active: `cat data/subscription.json`
3. Group has members: `az ad group member list --group <YOUR_GROUP_ID>`

**Renewal:** Subscriptions expire in 24 hours. Re-run `npm run subscribe` daily.

## Important Notes

- **Subscriptions expire in 24 hours** - set up daily renewal via automation
- **Processor must be running** to receive notifications
- **Group scope only** - individual user calendars use different subscription patterns
- **Event Hub URL format is strict** - Graph API validates every component
- **Tenant domain must match** the domain used in the Azure subscription

## Reference

- [Microsoft docs: Event Hub subscriptions](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-event-hubs)
- [Event Hub Overview](https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-about)
