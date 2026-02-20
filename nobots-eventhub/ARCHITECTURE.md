# Event-Driven Teams Meeting Transcript Fetcher - Architecture

## Current Status

✅ **TESTED & WORKING** (2/20/2026)
- Meeting creation via Graph API
- EventHub receiving notifications
- Lambda processing with Event data
- DynamoDB checkpoint tracking
- Event Hub consumer group configuration

**Recent Fix**: Lambda Node.js 18+ crypto module issue resolved
- Node 18+ provides built-in `globalThis.crypto` (read-only)
- Removed conflicting reassignment attempt
- Lambda deployed and verified

## Authentication Model: Azure AD (Entra) + RBAC

### Complete Data Flow with Authentication:

```
┌─────────────────────────────────────────────────────────────┐
│ Microsoft Graph API                                         │
│ Sends calendar change notifications                         │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP POST (Graph validates itself)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Webhook Receiver (localhost:7071)                           │
│ ✓ Validates Graph validationToken                           │
│ ✓ Receives JSON notifications from Graph API                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ├─→ Event Grid (Event Grid key auth)
                     │   [Note: Can be updated to use managed identity]
                     │
                     └─→ Event Hub (direct, bypasses Event Grid in current setup)
                         [Alternative: Forward via Event Grid first]
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Event Grid Topic (tmf-egt-eus-6an5wk)                      │
│ ✓ Public network access: DISABLED (Entra only)              │
│ ✓ Subscription: tmf-eventhub-subscription                   │
│ ✓ Endpoint type: Event Hub                                  │
│ ✓ Subject filter: Starts with "graph"                       │
└────────────────────┬────────────────────────────────────────┘
                     │ Event Grid → Event Hub
                     │ [Managed Identity Authentication]
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Event Hub Namespace (tmf-ehns-eus-6an5wk)                  │
│ ✓ Local authentication: DISABLED (RBAC only)                │
│ ✓ Event Hub: tmf-eh-eus-6an5wk                             │
│                                                              │
│ RBAC Roles:                                                 │
│ • Azure Event Hubs Data Owner → a-ivega@ibuyspy.net        │
│ • Contributor → Service Principal (Terraform)              │
└────────────────────┬────────────────────────────────────────┘
                     │ AMQP Protocol
                     │ DefaultAzureCredential
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Event Processor (process-notifications.js)                  │
│ ✓ EventHubConsumerClient                                    │
│ ✓ Authenticates via DefaultAzureCredential (RBAC)           │
│ ✓ Listens on consumer group: $Default                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ├─→ Fetch event details from Graph
                     ├─→ Authenticate to Graph (app client credentials)
                     └─→ Download meeting transcript
                         │
                         ↓
                    Transcript saved locally
```

## Authentication Methods

| Component                        | Authentication                         | Status                                     |
| -------------------------------- | -------------------------------------- | ------------------------------------------ |
| **Webhook → Webhook Validation** | Graph API self-validation              | ✅ Built-in                                |
| **Webhook → Event Grid**         | Event Grid SAS Key                     | ✅ Configured (could use managed identity) |
| **Event Grid Topic**             | Azure AD (Entra) only                  | ✅ Public network access disabled          |
| **Event Grid → Event Hub**       | Managed Identity / RBAC                | ✅ Configured                              |
| **Event Hub**                    | RBAC (Azure AD)                        | ✅ Local auth disabled                     |
| **Processor → Event Hub**        | DefaultAzureCredential (RBAC)          | ✅ Using your user's Data Owner role       |
| **Processor → Graph API**        | Service Principal (client credentials) | ✅ Configured                              |
| **Lambda → Node.js Crypto**      | Built-in `globalThis.crypto` (Node 18+) | ✅ Fixed (no reassignment)                 |

### Lambda Node.js 18+ Compatibility

**IMPORTANT**: Node.js 18+ provides a read-only `globalThis.crypto` for @azure/identity and @azure/event-hubs.

❌ **DO NOT** try to reassign it:
```javascript
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;  // ❌ FAILS - read-only
}
```

✅ **CORRECT** - Trust Node.js built-in:
```javascript
const { EventHubConsumerClient } = require('@azure/event-hubs');
// globalThis.crypto is already available and used automatically
```

## Security Features

✅ **No API Keys in Event Hub**: RBAC authentication only  
✅ **No Shared Access Keys**: LocalAuth disabled  
✅ **Entra-based Access Control**: All Azure resources  
✅ **Public Network Access Disabled**: Event Grid (network isolation)  
✅ **RBAC Roles**: Minimum required permissions  
✅ **Event Filtering**: Event Grid filters by subject pattern

## Deployment Components

```
Graph API
  ↓
Webhook (Node.js HTTP server)
  ↓
Event Grid (tmf-egt-eus-6an5wk)
  ↓
Event Hub Namespace (tmf-ehns-eus-6an5wk)
  ├→ Event Hub (tmf-eh-eus-6an5wk)
  └→ RBAC Role Assignments

+ Event Hub Processor (Node.js consumer)
  ├→ EventHubConsumerClient
  └→ DefaultAzureCredential
```

## Testing the Flow

**Send test event through webhook:**

```bash
curl -X POST http://localhost:7071 \
  -H "Content-Type: application/json" \
  -d '{
    "value": [{
      "resource": "users/boldoriole@ibuyspy.net/events/test-123",
      "changeType": "created",
      "resourceData": {"id": "test-123"}
    }]
  }'
```

**Verify processor received it:**

- Check processor terminal for new event output
- Confirm message routed through Event Hub
- Validate authentication via Azure CLI logs

## Next Steps

1. **Create Graph Subscription** (needs fixed permissions):

   ```bash
   npm run subscribe
   ```

2. **OR use Calendar Poller** for real events:

   ```bash
   npm run poll
   ```

3. **Monitor both flows:**
   - Webhook runs on port 7071
   - Processor listens on Event Hub
   - Both authenticate via Entra ID
