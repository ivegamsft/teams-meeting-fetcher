# nobots - Graph-Only Meeting Transcript Flow

Local scripts to poll for meetings and download transcripts using only Microsoft Graph API (no Bot Framework).

## Setup

1. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

2. Fill in your Azure AD credentials in `.env`:

   ```bash
   GRAPH_TENANT_ID=62837751-4e48-4d06-8bcb-57be1a669b78
   GRAPH_CLIENT_ID=your-app-id-here
   GRAPH_CLIENT_SECRET=your-secret-here
   WATCH_USER_ID=user@company.com
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

## Quick Start

### Poll for meetings

```bash
npm run poll
```

or

```bash
node 2-poll-meetings.js
```

### Check meeting status (which have ended)

```bash
npm run check
```

or

```bash
node 3-check-status.js
```

### Download transcripts

```bash
npm run transcripts
```

or

```bash
node 4-get-transcript.js
```

## Full Flow

```bash
# Step 1: Poll calendar for upcoming meetings
node 2-poll-meetings.js

# Step 2: Check which meetings have ended (and resolve online meeting IDs)
node 3-check-status.js

# Step 3: Download transcripts for ended meetings
node 4-get-transcript.js
```

## What This Does

- ✅ Polls calendar for online meetings in next 24 hours
- ✅ Tracks meeting status (upcoming, in-progress, ended)
- ✅ Resolves online meeting IDs from calendar join URLs
- ✅ Downloads transcripts as VTT format after meeting ends
- ✅ Stores transcripts locally in `data/transcripts/`

## What This Does NOT Do

- ❌ No real-time notifications (polling only)
- ❌ No chat integration (transcripts saved locally)
- ❌ No user commands or chat interaction
- ❌ No Bot Framework involvement

## File Structure

```
nobots/
├── config.js                 # Configuration loader
├── graph-client.js          # Graph API client
├── .env                     # Your credentials (create from .env.example)
├── 1-subscribe.js           # Create subscription (optional)
├── 2-poll-meetings.js       # Poll calendar for meetings
├── 3-check-status.js        # Check meeting status
├── 4-get-transcript.js      # Download transcripts
└── data/
    ├── subscriptions.json   # Subscription metadata
    ├── meetings.json        # Current meetings from poll
    ├── status.json          # Meeting status + online meeting IDs
    └── transcripts/         # Downloaded VTT files
        ├── Team_Meeting_2025-02-18.vtt
        └── Standup_2025-02-18.vtt
```

## Permissions Required

Your app registration needs these Graph API permissions:

- `Calendars.Read` - Read calendar events
- `OnlineMeetingTranscript.Read.All` - Download transcripts (app-only)

Assign as **Application** permissions (not delegated).

## Troubleshooting

### "GRAPH_CLIENT_ID not configured"

→ Check your `.env` file has valid values

### "Token error: 401"

→ Invalid client secret. Check GRAPH_CLIENT_SECRET

### "Token error: 403"

→ App doesn't have required permissions. Check Azure AD

### "Could not resolve online meeting"

→ The meeting may not have been recorded. Check the meeting settings.

### "No transcripts available"

→ Graph is still processing. Try again in 1-2 minutes.

## Next Steps

To automate this:

1. **GitHub Actions**: Schedule workflow to run scripts hourly
2. **Azure Functions**: Replace scripts with functions triggered on schedule
3. **Event Grid**: Replace polling with real-time event subscriptions
4. **Service Bus**: Queue transcripts for downstream processing

## Limitations

- **Not real-time**: Changes detected on next poll run only
- **No chat**: Transcripts go to local files, not Teams
- **Manual workflow**: Need to run scripts sequentially
- **Transcript delay**: Graph needs 30-90s to process after meeting ends
