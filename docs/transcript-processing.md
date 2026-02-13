# Transcript Processing Scripts

Scripts for fetching and processing Teams meeting transcripts from Microsoft Graph API.

## Scripts

### 05-fetch-transcript.py

Fetch transcript content directly using meeting and transcript IDs.

**Usage:**

```bash
# Fetch and display transcript
python scripts/graph/05-fetch-transcript.py <user_email> <meeting_id> <transcript_id>

# Save to file
python scripts/graph/05-fetch-transcript.py user@domain.com meeting_id transcript_id --output transcript.vtt

# Show only first 10 entries
python scripts/graph/05-fetch-transcript.py user@domain.com meeting_id transcript_id --limit 10

# Fetch metadata only
python scripts/graph/05-fetch-transcript.py user@domain.com meeting_id transcript_id --metadata-only
```

**Example with real IDs:**

```bash
python scripts/graph/05-fetch-transcript.py \
  boldoriole@ibuyspy.net \
  MSoe5fe8748-76f0-42ed-b521-241e8252baba__19:meeting_abc123... \
  MSMjk5OTEyMzQ1...
```

**Output:**

- Transcript metadata (ID, meeting ID, created date, content URL)
- Parsed transcript entries with timestamps
- Formatted, readable text

### process_transcript_notification.py

Process webhook notifications and automatically fetch transcript content.

**Usage:**

```bash
# Process notification from S3 file
python process_transcript_notification.py path/to/notification.json

# Process from JSON string
python process_transcript_notification.py --json '{"resource": "users/.../transcripts/..."}'

# Read from stdin (useful with AWS S3)
aws s3 cp s3://bucket/notification.json - | python process_transcript_notification.py --json -

# Save transcripts to directory
python process_transcript_notification.py notification.json --output ./transcripts
```

**Example workflow:**

```bash
# 1. List S3 notifications
aws s3 ls s3://tmf-webhook-payloads-dev/ --profile tmf-dev

# 2. Download notification
aws s3 cp s3://tmf-webhook-payloads-dev/05b3417a-xxxx.json notification.json --profile tmf-dev

# 3. Process and fetch transcript
python process_transcript_notification.py notification.json --output ./transcripts
```

## Webhook Notification Format

When a transcript becomes available, you'll receive a notification like:

```json
{
  "value": [
    {
      "subscriptionId": "2080e968-ac5b-47c9-aca1-37d26f65a8c6",
      "changeType": "created",
      "clientState": "your-client-state",
      "resource": "users/boldoriole@ibuyspy.net/onlineMeetings/MSo.../transcripts/MSM...",
      "resourceData": {
        "id": "MSM...",
        "@odata.type": "#Microsoft.Graph.callTranscript",
        "@odata.id": "users/.../onlineMeetings/.../transcripts/..."
      },
      "subscriptionExpirationDateTime": "2026-02-13T02:00:51Z",
      "tenantId": "..."
    }
  ]
}
```

**Key fields:**

- `resource`: Contains user ID, meeting ID, and transcript ID
- `subscriptionId`: Matches your subscription
- `changeType`: "created" when new transcript available

## Transcript Format

Transcripts are returned in WebVTT format:

```
WEBVTT

00:00:01.234 --> 00:00:05.678
Speaker Name: Hello everyone, welcome to the meeting.

00:00:06.123 --> 00:00:10.456
Another Speaker: Thanks for joining!
```

## Testing Transcript Flow

1. **Create subscription** (already done):

   ```bash
   python create_transcript_subscription.py
   ```

2. **Create and conduct meeting**:

   ```bash
   # Create meeting
   python scripts/graph/03-create-test-meeting.py

   # Join meeting via Teams client
   # Start recording with transcription enabled
   # Speak for a minute
   # Stop recording and end meeting
   ```

3. **Monitor for webhook**:

   ```bash
   # CloudWatch logs
   aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev

   # Or check S3
   aws s3 ls s3://tmf-webhook-payloads-dev/ --profile tmf-dev
   ```

4. **Process notification**:

   ```bash
   # Download notification from S3
   aws s3 cp s3://tmf-webhook-payloads-dev/<subscription-id>.json notification.json --profile tmf-dev

   # Fetch transcript
   python process_transcript_notification.py notification.json --output ./transcripts
   ```

## Graph API Permissions

Required permissions (already configured):

- `OnlineMeetingTranscript.Read.All` - Read meeting transcripts
- `Calendars.ReadWrite` - Create meetings

## Notes

- Transcripts typically available 5-10 minutes after meeting ends
- Meeting must have recording + transcription enabled
- Only works for meetings with actual participants (not test meetings without recordings)
- Transcript IDs expire based on tenant retention policies

## Troubleshooting

**404 Not Found:**

- Transcript not yet available (wait a few minutes)
- Meeting ID incorrect (verify from notification)
- Transcript expired or deleted

**403 Forbidden:**

- Permission not granted (check Azure Portal)
- Admin consent required

**No webhook received:**

- Check subscription expiration: `python create_transcript_subscription.py`
- Verify CloudWatch logs for Lambda execution
- Ensure meeting had recording + transcription enabled
