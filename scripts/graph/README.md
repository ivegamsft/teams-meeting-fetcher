# Graph API Scripts

## Prerequisites

Before running any scripts, ensure:

1. **Teams Admin Configuration** (one-time)
   - See [TEAMS_ADMIN_CONFIGURATION.md](../../docs/TEAMS_ADMIN_CONFIGURATION.md)
   - Layer 1: Teams policies configured (recording, transcription enabled)
   - Layer 2: Application Access Policy created and assigned
   - Layer 3: All 7 Graph API permissions granted
   - Layer 4: Teams Premium licenses assigned

2. **Environment Configuration**
   - Create `.env.local` with credentials (see `.env.local.template`)
   - Required variables: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `ENTRA_GROUP_ID`

3. **Python Dependencies**
   ```bash
   pip install -r scripts/requirements.txt
   ```

---

## Main Workflow (Use These)

**Numbered scripts form the main workflow:**

1. **01-verify-setup.py** - Verify Graph API access and permissions
2. **02-create-webhook-subscription.py** - Create/renew webhook subscriptions for events and transcripts
3. **03-create-test-meeting.py** - Create Teams meeting with transcription enabled
4. **04-poll-transcription.py** - Download transcripts and results
5. **06-test-webhook.py** - Send manual test webhook notification

## Utilities

- **auth_helper.py** - Graph API authentication (used by all scripts)
- **list-subscriptions.py** - List active Graph subscriptions
- **check-subscriptions.py** - Check subscription status and health
- **investigate-subscriptions.py** - Deep-dive subscription diagnostics
- **create-transcript-subscription.py** - Create transcript-only webhook subscription
- **check-transcripts.py** - List available transcripts
- **trigger-webhook-manual.py** - Send test webhook payload to Lambda
- **trigger-webhook-with-transcripts.py** - Send test webhook with real transcript data

## Maintenance

- **create-meeting-started-subscription.py** - Deprecated (Graph meeting-start subscriptions unsupported)
- **create-meeting-subscription.py** - Deprecated wrapper (use Teams bot framework instead)

## Debugging (Optional)

These scripts check various system states:

- **check_calendar.py** - List calendar events
- **check_recordings.py** - List meeting recordings
- **check_meeting_autorecord.py** - Check if meeting has auto-recording enabled
- **check_transcript_delivery.py** - Verify transcripts were delivered
- **check_latest_webhook.py** - Check latest webhook received
- **check_call_records.py** - Check call records
- **process_transcript_notification.py** - Process incoming transcript notification
- **fix_meeting_autorecord.py** - Enable auto-recording on existing meeting
- **test_transcription.py** - End-to-end transcription test

---

## Quick Start

```bash
# 1. Verify Graph API access and permissions
python 01-verify-setup.py

# 2. Create/renew webhook subscriptions (if not already created)
python 02-create-webhook-subscription.py

# 3. Create a test meeting to trigger transcripts
python 03-create-test-meeting.py

# 4. Monitor and fetch transcripts
python 04-poll-transcription.py

# 5. Test webhook delivery
python 06-test-webhook.py
```

## Environment Setup

All scripts use `.env.local` for credentials. Required variables:

- `GRAPH_TENANT_ID` — Your Azure tenant ID
- `GRAPH_CLIENT_ID` — Teams Meeting Fetcher app registration client ID
- `GRAPH_CLIENT_SECRET` — App registration client secret
- `ENTRA_GROUP_ID` — Target Entra group ID (users whose meetings to track)
- `WEBHOOK_AUTH_SECRET` — Bearer token for webhook testing (for 06-test-webhook.py)

See `.env.local.template` in project root for complete template.
