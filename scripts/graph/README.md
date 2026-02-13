# Graph API Scripts

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
- **check-transcripts.py** - List available transcripts
- **trigger-webhook-manual.py** - Send test webhook payload to Lambda
- **trigger-webhook-with-transcripts.py** - Send test webhook with real transcript data

## Maintenance

- **recreate-transcript-subscription.py** - Recreate transcript webhook subscription
- **create_transcript_subscription.py** - Create transcript subscription (similar to 02, for transcripts only)

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
# 1. Verify setup
python 01-verify-setup.py

# 2. Create subscriptions (if not already created)
python 02-create-webhook-subscription.py

# 3. Create a test meeting to trigger transcripts
python 03-create-test-meeting.py

# 4. Monitor and fetch transcripts
python 04-poll-transcription.py

# 5. Test webhook manually
python trigger-webhook-manual.py
```

## Environment Setup

All scripts use `.env.local` for credentials. Required variables:

- `GRAPH_TENANT_ID`
- `GRAPH_CLIENT_ID`
- `GRAPH_CLIENT_SECRET`
- `WEBHOOK_AUTH_SECRET` (for webhook testing)

See `.env.local.template` in project root.
