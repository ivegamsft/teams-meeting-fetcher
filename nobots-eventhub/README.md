# nobots-eventhub - Event-Driven Transcript Fetcher

Event Hub-based workflow that uses **Microsoft Graph API subscriptions** to receive real-time notifications when meetings are created/updated, then automatically downloads transcripts.

## Architecture

```
Calendar Event Created/Updated
    ↓
Microsoft Graph API
  ↓ (webhook notification)
Webhook Receiver (this app)
  ↓ (forward)
Azure Event Grid (optional)
  ↓
Azure Event Hub
    ↓ (consumer)
This Application
    ↓
Download Transcript → Save VTT File
```

## vs. nobots (Polling Approach)

| Feature            | nobots (Polling)   | nobots-eventhub (Events) |
| ------------------ | ------------------ | ------------------------ |
| **Latency**        | 30-60 seconds      | Real-time (<5 seconds)   |
| **API Calls**      | Continuous polling | On-demand only           |
| **Complexity**     | Simple             | Requires Event Hub setup |
| **Cost**           | Higher (polling)   | Lower (event-driven)     |
| **Infrastructure** | None needed        | Event Hub required       |

## Prerequisites

### 1. Azure AD App Registration

Create an app with these **Application** permissions:

- `Calendars.Read`
- `OnlineMeetingTranscript.Read.All`

Grant admin consent for these permissions.

### 2. Azure Event Hub

#### RBAC Authentication (Recommended)

This application now uses **Azure RBAC** for Event Hub authentication via `DefaultAzureCredential`.

```bash
# Create Resource Group
az group create --name tmf-rg --location eastus

# Create Event Hub Namespace (with RBAC enabled)
az eventhubs namespace create \
  --name tmf-eventhub-ns \
  --resource-group tmf-rg \
  --location eastus \
  --sku Standard \
  --disable-local-auth true

# Create Event Hub
az eventhubs eventhub create \
  --name teams-notifications \
  --namespace-name tmf-eventhub-ns \
  --resource-group tmf-rg

# Grant your user the "Azure Event Hubs Data Owner" role
az role assignment create \
  --role "Azure Event Hubs Data Owner" \
  --assignee <your-user-principal-name-or-object-id> \
  --scope /subscriptions/<sub-id>/resourceGroups/tmf-rg/providers/Microsoft.EventHub/namespaces/tmf-eventhub-ns
```

**Configuration:** Set these environment variables in `.env`:

- `EVENT_HUB_NAMESPACE=tmf-eventhub-ns.servicebus.windows.net`
- `EVENT_HUB_NAME=teams-notifications`

**Authentication:** The app uses `DefaultAzureCredential`, which authenticates using:

1. Environment variables (Azure CLI credentials)
2. Managed Identity (when deployed to Azure)
3. Visual Studio Code / Azure CLI credentials (local development)

#### Legacy: Connection String Authentication

If you need to use SharedAccessKey authentication (not recommended):

```bash
# Enable local authentication
az eventhubs namespace update \
  --name tmf-eventhub-ns \
  --resource-group tmf-rg \
  --disable-local-auth false

# Get connection string
az eventhubs namespace authorization-rule keys list \
  --resource-group tmf-rg \
  --namespace-name tmf-eventhub-ns \
  --name RootManageSharedAccessKey \
  --query primaryConnectionString -o tsv
```

Set `EVENT_HUB_CONNECTION_STRING` in `.env` (uncomment in `config.js`).

### 3. Webhook Receiver (Required)

Graph subscriptions require a public HTTPS webhook that responds to validation tokens.
Run the webhook receiver from this project and expose it (e.g., Azure Functions, App Service, or a public tunnel).

```bash
npm run webhook
```

Set `NOTIFICATION_URL` to your public webhook URL.

### 4. Event Grid Integration (Optional)

Graph API webhooks need an HTTP endpoint. Use Event Grid to forward to Event Hub:

```bash
# Create Event Grid topic
az eventgrid topic create \
  --name tmf-graph-notifications \
  --resource-group tmf-rg \
  --location eastus

# Create Event Grid subscription → Event Hub
az eventgrid event-subscription create \
  --name to-event-hub \
  --source-resource-id /subscriptions/{sub-id}/resourceGroups/tmf-rg/providers/Microsoft.EventGrid/topics/tmf-graph-notifications \
  --endpoint-type eventhub \
  --endpoint /subscriptions/{sub-id}/resourceGroups/tmf-rg/providers/Microsoft.EventHub/namespaces/tmf-eventhub-ns/eventhubs/teams-notifications

# Get Event Grid endpoint
az eventgrid topic show \
  --name tmf-graph-notifications \
  --resource-group tmf-rg \
  --query endpoint -o tsv
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required values:

```bash
GRAPH_TENANT_ID=your-tenant-id
GRAPH_CLIENT_ID=your-app-id
GRAPH_CLIENT_SECRET=your-secret
WATCH_USER_ID=user@company.com

EVENT_HUB_NAMESPACE=tmf-eventhub-ns.servicebus.windows.net
EVENT_HUB_NAME=teams-notifications
EVENT_HUB_CONNECTION_STRING=Endpoint=sb://...

# Webhook endpoint (this app)
WEBHOOK_URL=https://your-public-webhook-endpoint/api/notifications
NOTIFICATION_URL=https://your-public-webhook-endpoint/api/notifications

# Event Grid topic endpoint (optional)
EVENT_GRID_TOPIC_ENDPOINT=https://tmf-graph-notifications.eastus-1.eventgrid.azure.net/api/events
EVENT_GRID_TOPIC_KEY=your-eventgrid-topic-key
```

### 3. Create Graph Subscription

```bash
npm run subscribe
```

This creates a subscription that sends calendar change notifications to your webhook.

**Note**: Subscriptions expire after 24 hours. Run this daily or set up automatic renewal.

### 4. Start Event Consumer

```bash
npm run process
```

This starts listening for notifications and automatically:

- Detects when meetings end
- Resolves online meeting IDs
- Downloads transcripts as VTT files

## Usage

Once running, the workflow is fully automatic:

1. **Meeting is created** → Notification sent
2. **Meeting ends** → Notification sent
3. **Consumer detects end** → Waits 30-90s
4. **Transcript available** → Downloads automatically
5. **Saves to** `data/transcripts/*.vtt`

## Sample Events for Testing

Pre-built sample calendar events are included for testing the processor without needing real meetings:

```bash
# Generate more sample events
node create-sample-events.js
```

Sample events are located in [`test/fixtures/sample-events/`](../test/fixtures/sample-events/):

- **event-1-eventhub-meeting.json** - Simple online meeting with 2 attendees
- **event-2-team-standup.json** - Recurring daily standup meeting
- **event-3-project-review.json** - Multi-hour review with attachments & 3 attendees
- **manifest.json** - Registry of all sample events and sanitization documentation
- **all-events.json** - Combined bundle for batch testing

All sample events have been **sanitized** (user IDs and emails replaced with generic placeholders) for safe sharing and testing.

**Use cases:**
- Unit tests for event processing
- Documentation and examples
- Integration testing without real meetings
- CI/CD pipeline validation

## Files Created

```
nobots-eventhub/
├── data/
│   ├── subscription.json     # Active subscription details
│   └── transcripts/           # Downloaded VTT files
│       └── Meeting_Title_timestamp.vtt
```

## Troubleshooting

### "Subscription creation failed"

- Check `NOTIFICATION_URL` is correct
- Verify Event Hub/Event Grid is publicly accessible
- Ensure app has `Calendars.Read` permission

### "No notifications received"

- Verify Event Hub connection string
- Check subscription is active: `cat data/subscription.json`
- Test Event Hub connectivity:
  ```bash
  az eventhubs eventhub show \
    --name teams-notifications \
    --namespace-name tmf-eventhub-ns \
    --resource-group tmf-rg
  ```

### "Transcript not found"

- Wait 30-90 seconds after meeting ends
- Verify recording was enabled
- Check user has access to the meeting

## Subscription Renewal

Subscriptions expire after 24 hours. To auto-renew:

### Option 1: Cron Job (Linux/Mac)

```bash
# Add to crontab
0 12 * * * cd /path/to/nobots-eventhub && npm run subscribe
```

### Option 2: Azure Function (Timer)

```javascript
module.exports = async function (context, myTimer) {
  const { exec } = require('child_process');
  exec('cd /path/to/nobots-eventhub && npm run subscribe');
};
```

### Option 3: GitHub Actions

```yaml
name: Renew Graph Subscription
on:
  schedule:
    - cron: '0 12 * * *' # Daily at noon
jobs:
  renew:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run subscribe
```

## Cost Estimate

**Azure Event Hub Standard tier**:

- Base: $0.028/hour (~$20/month)
- Ingress: Free
- Example: ~1000 meetings/month = < $25/month

**vs. nobots polling** (Lambda @ 1 min interval):

- ~44,000 invocations/month = $0-$1/month
- Lower cost but higher latency

## Advanced: Event Grid Validation

Graph API webhooks require endpoint validation. With Event Grid:

1. Event Grid handles validation automatically
2. Forwards validated events to Event Hub
3. No manual webhook server needed

## Migration from nobots

To switch from polling to events:

1. Set up Event Hub + Event Grid
2. Create subscription: `npm run subscribe`
3. Start consumer: `npm run process`
4. Stop nobots polling (Ctrl+C)

Both can run simultaneously for transition.

## Next Steps

- [Set up Terraform for infrastructure](../iac/azure/)
- [Configure GitHub Actions for automation](../.github/workflows/)
- [Deploy to Azure Functions](../docs/azure-functions-deployment.md)

## License

MIT
