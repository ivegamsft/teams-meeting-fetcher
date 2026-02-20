# Manage Graph Subscriptions — Event Hub & Webhook Lifecycle

## Purpose

Help me create, check, renew, and troubleshoot Microsoft Graph subscriptions for calendar change notifications via Event Hub.

## CRITICAL: Event Hub Subscription URL Format

For **Event Hub subscriptions**, the notification URL MUST follow this exact format:

```
EventHub:https://<eventhubnamespace>.servicebus.windows.net/eventhubname/<eventhubname>?tenantId=<domain>
```

**Example for our deployment:**

```
EventHub:https://tmf-ehns-eus-6an5wk.servicebus.windows.net/eventhubname/tmf-eh-eus-6an5wk?tenantId=ibuyspy.net
```

### Breaking Down the Format:

- `EventHub:` - Protocol prefix (REQUIRED)
- `https://tmf-ehns-eus-6an5wk.servicebus.windows.net/` - Event Hub namespace endpoint
- `eventhubname/` - Literal path segment (REQUIRED, NOT just the hub name)
- `tmf-eh-eus-6an5wk` - Actual Event Hub name
- `?tenantId=ibuyspy.net` - Tenant domain (REQUIRED for RBAC authentication)

### Common Mistakes to Avoid:

❌ Missing `/eventhubname/` segment
❌ Missing `?tenantId=<domain>` query parameter
❌ Using wrong domain (must match tenant's primary domain)
❌ Subscribing to individual users instead of GROUP resource path

## Instructions

### Step 1: Verify Prerequisites

Before creating any subscription:

1. **Verify Event Hub is configured:**
   - Namespace: `tmf-ehns-eus-6an5wk`
   - Hub: `tmf-eh-eus-6an5wk`
   - Processor running: `Get-Job -Name processor`

2. **Verify Graph Change Tracking SPN has correct roles:**

   ```bash
   # Should have "Azure Event Hubs Data Sender" role
   az role assignment list --scope /subscriptions/.../providers/Microsoft.EventHub/namespaces/tmf-ehns-eus-6an5wk
   ```

3. **Verify subscription resource is GROUP, not user:**
   - ✅ Correct: `/groups/5e7708f8-b0d2-467d-97f9-d9da4818084a`
   - ❌ Wrong: `/users/user@domain.com/events`

### Step 2: Create Group Subscription

```bash
cd nobots-eventhub
GRAPH_SUBSCRIPTION_RESOURCE=/groups/5e7708f8-b0d2-467d-97f9-d9da4818084a npm run subscribe
```

### Step 3: Verify Subscription Created

1. Check subscription.json was created: `cat data/subscription.json`
2. Processor receives validation notification (ignore it, expected)
3. Calendar changes now trigger Event Hub notifications

### Step 4: Test

1. **Create a meeting** in group member's calendar
2. **Check processor output:** `Get-Job -Name processor | Receive-Job -Keep`
3. **Should see**: Notification from Event Hub with change details

### Rules (CRITICAL)

- **Event Hub subscriptions MUST use Group resource path** (`/groups/{id}`), not user paths
- **URL format is strict** - missing `/eventhubname/` will cause 400 errors from Graph API
- **tenantId must match the tenant's primary domain** (from Azure AD → Overview)
- **Subscriptions expire in 24 hours** - run subscribe script daily
- **Graph Change Tracking SPN must have Event Hubs Data Sender role**
- **Processor must be running** to receive notifications

## Troubleshooting

| Error                                | Cause                                       | Fix                                   |
| ------------------------------------ | ------------------------------------------- | ------------------------------------- |
| `Invalid event hub notification url` | Wrong URL format (missing `/eventhubname/`) | Use exact format above                |
| `400 ValidationError`                | Tenant domain mismatch                      | Verify primary domain matches         |
| `403 Forbidden`                      | Graph SPN missing role                      | Assign "Azure Event Hubs Data Sender" |
| `No notifications received`          | Processor not running                       | `npm run process`                     |
| `Subscription not active`            | Used user path instead                      | Use `/groups/{id}`                    |
