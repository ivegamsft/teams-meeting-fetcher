# Microsoft Graph API Scripts

Automation scripts for Teams Meeting Fetcher development and testing.

## Installation

```bash
cd scripts
pip install -r requirements.txt
```

## Configuration

Ensure `.env.local.azure` is configured at the repository root with:

```bash
GRAPH_TENANT_ID=your-tenant-id
GRAPH_CLIENT_ID=your-app-client-id
GRAPH_CLIENT_SECRET=your-app-secret
ENTRA_GROUP_ID=your-group-id
AWS_WEBHOOK_ENDPOINT=https://your-webhook-url.com/dev/graph  # or AZURE_WEBHOOK_ENDPOINT
WEBHOOK_AUTH_SECRET=your-webhook-secret
```

## Script Execution Sequence

### 1. Verify Setup ✅

```bash
python graph/01-verify-setup.py
```

**What it does:**

- Checks environment variables
- Verifies Graph API permissions
- Tests group access
- Validates webhook endpoint

**Run:** Before any other scripts

---

### 2. Create Webhook Subscription 🔔

```bash
python graph/02-create-webhook-subscription.py
```

**What it does:**

- Creates Graph webhook subscription for calendar events
- Lists existing subscriptions
- Renews or deletes subscriptions

**Run:** After verifying setup, before creating meetings

**Output:** Subscription ID (save for renewal)

---

### 3. Manage Group Membership 👥

```bash
python graph/05-manage-group.py
```

**What it does:**

- Lists group members
- Adds users to monitored group
- Removes users from group

**Run:** Before creating test meetings to ensure user is in group

---

### 4. Create Test Meeting 📅

```bash
python graph/03-create-test-meeting.py
```

**What it does:**

- Creates Teams meeting with transcript enabled
- Schedules meeting (default: 1 hour from now)
- Returns meeting ID and join URL

**Run:** After webhook subscription is created

**Output:**

- Event ID
- Online Meeting ID (needed for transcripts)
- Join URL

---

### 5. Test Webhook Delivery 🔌

```bash
python graph/06-test-webhook.py
```

**What it does:**

- Sends mock Graph webhook notifications
- Tests validation token response
- Verifies webhook processing

**Run:** Anytime after webhook endpoint is deployed

---

### 6. Poll for Transcription 📝

```bash
python graph/04-poll-transcription.py
```

**What it does:**

- Polls for transcript availability
- Downloads transcript when ready
- Saves as VTT file

**Run:** AFTER the meeting has been recorded and ended

**Requirements:**

- Meeting must have been recorded (manual in Teams)
- Allow 5-10 minutes after meeting ends
- Transcript must have been enabled

---

## Interactive Workflow

For a guided, interactive experience, use the **Jupyter Notebook**:

```bash
# From repository root
jupyter notebook Teams-Meeting-Fetcher-Workflow.ipynb
```

The notebook combines all scripts into a single workflow with explanations.

---

## Common Workflows

### Development Workflow

```bash
# 1. Verify everything is set up
python graph/01-verify-setup.py

# 2. Create webhook subscription
python graph/02-create-webhook-subscription.py
# Select option 2 (specific user)
# Enter test user email

# 3. Add test user to group
python graph/05-manage-group.py
# Select option 2 (add user)
# Enter test user email

# 4. Create test meeting
python graph/03-create-test-meeting.py
# Follow prompts or accept defaults
# Save the Online Meeting ID

# 5. Join meeting, record, and speak to generate transcript

# 6. After meeting ends, poll for transcript
python graph/04-poll-transcription.py
# Enter organizer email and meeting ID
```

### Testing Webhook Integration

```bash
# Test webhook endpoint
python graph/06-test-webhook.py
# Select option 4 (run all tests)

# Check logs:
# AWS: CloudWatch logs for Lambda
# Azure: Application Insights or container logs
```

### Subscription Management

```bash
# List active subscriptions
python graph/02-create-webhook-subscription.py
# View existing subscriptions

# Renew subscription (before 29-day expiration)
python graph/02-create-webhook-subscription.py
# Select option 4 (renew)
# Enter subscription ID

# Delete subscription
python graph/02-create-webhook-subscription.py
# Select option 3 (delete)
# Enter subscription ID
```

---

## Authentication Helper

All scripts use `graph/auth_helper.py` for shared authentication logic:

```python
from auth_helper import get_graph_headers, get_config

# Get authenticated headers
headers = get_graph_headers()

# Get configuration
config = get_config()
```

---

## Troubleshooting

### "Missing required environment variables"

- Ensure `.env.local.azure` exists at repository root
- Run `./scripts/config/generate-azure-env.ps1` to regenerate from Terraform

### "Failed to acquire token: AADSTS700016"

- App registration needs admin consent
- Go to Azure Portal → App registrations → API permissions → Grant admin consent

### "403 Forbidden" errors

- Check API permissions are granted
- Verify admin consent has been granted
- Ensure service principal has required permissions

### "No transcript found"

- Meeting must be recorded manually in Teams
- Transcription takes 5-10 minutes to process after meeting ends
- Verify `allowTranscription` was enabled
- Check user has appropriate Teams license

### Webhook not receiving notifications

- Verify subscription is active (check expiration)
- Ensure webhook URL is publicly accessible
- Check webhook auth secret matches
- Review logs (CloudWatch or App Insights)

---

## API Permissions Required

### Teams Meeting Fetcher Bot (`tmf_bot_app`)

The Bot app registration requires these Microsoft Graph API permissions:

- ✅ `OnlineMeetings.ReadWrite.All` - Create meetings and enable recording
- ✅ `OnlineMeetingTranscript.Read.All` - Download meeting transcripts
- ✅ `OnlineMeetingRecording.Read.All` - Download meeting recordings
- ✅ `Group.Read.All` - Validate group membership for allow-list
- ✅ `User.Read.All` - Read user profiles for webhook validation

All must be **Application permissions** with **admin consent granted**.

**Security Note**: As of Feb 2026, the Bot app uses only 5 permissions (reduced from 7). See [AZURE_SPN_SECURITY.md](../docs/AZURE_SPN_SECURITY.md) for security hardening details.

### Terraform Deployment SPN (`tmf-terraform-deploy-spn`)

The Terraform deployment Service Principal **does NOT need Graph API permissions**:

- ✅ Azure RBAC: Contributor (manage Azure resources)
- ✅ Azure RBAC: User Access Administrator (assign RBAC roles)
- ✅ Azure AD role: Application Administrator (create App Registrations)
- ✅ Azure AD role: Groups Administrator (create Security Groups)
- ❌ Graph API permissions: **NONE** (uses hard-coded app role IDs)

**Important**: If your Terraform SPN has Graph API permissions (Calendars.Read, Directory.Read.All, etc.), run:

```powershell
.\scripts\setup\remove-terraform-spn-graph-permissions.ps1
```

See [AZURE_SPN_SECURITY.md](../docs/AZURE_SPN_SECURITY.md) for details on why Graph API permissions are not needed.

---

## Next Steps

After completing the script workflow:

1. **Monitor webhooks** - Verify notifications are being received
2. **Test real meetings** - Schedule actual meetings with attendees
3. **Implement backend** - Create service to process webhooks automatically
4. **Build UI** - Display meetings and transcripts in dashboard
5. **Automate renewal** - Set up cron job to renew subscriptions before expiration

---

## References

- [Microsoft Graph API Documentation](https://learn.microsoft.com/en-us/graph/)
- [Webhook Subscriptions](https://learn.microsoft.com/en-us/graph/webhooks)
- [Online Meetings API](https://learn.microsoft.com/en-us/graph/api/resources/onlinemeeting)
- [Transcripts API](https://learn.microsoft.com/en-us/graph/api/resources/calltranscript)
