#🚀 Quick Start Cheatsheet

## Installation

```bash
cd nobots
npm install
```

## View Configuration Guide

```bash
node setup.js
```

## Edit Configuration

```bash
# Windows (from nobots directory)
notepad .env

# Or in VS Code
code .env
```

Required values in `.env`:

```
GRAPH_TENANT_ID=62837751-4e48-4d06-8bcb-57be1a669b78   # (already set)
GRAPH_CLIENT_ID=<your-app-client-id>
GRAPH_CLIENT_SECRET=<your-app-secret>
WATCH_USER_ID=john.doe@company.com
```

## Test with Sample Data (No credentials needed)

```bash
node demo.js
```

This creates sample data in:

- `data/meetings.json` - Sample calendar events
- `data/status.json` - Sample status with meeting IDs
- `data/transcripts/` - Sample VTT transcript

## Run Full Workflow

```bash
# Step 1: Poll calendar for meetings
npm run poll
# or: node 2-poll-meetings.js

# Step 2: Check which meetings have ended
npm run check
# or: node 3-check-status.js

# Step 3: Download transcripts
npm run transcripts
# or: node 4-get-transcript.js
```

## View Results

```bash
# See detected meetings
cat data/meetings.json

# See status with online meeting IDs
cat data/status.json

# See downloaded transcript
cat data/transcripts/*.vtt
```

## Get Help

```bash
# Show configuration setup guide
node setup.js

# View full documentation
cat README.md

# View implementation details
cat IMPLEMENTATION.md
```

## Optional: Subscribe to Calendar Changes

```bash
# Create a subscription (for webhook notifications)
node 1-subscribe.js
```

## One-Liner Workflow

```bash
npm run poll && npm run check && npm run transcripts
```

## File Locations

```
.env                    Configuration file
data/
  ├── meetings.json     Calendar events from poll
  ├── status.json       Status + online meeting IDs
  └── transcripts/      Downloaded VTT files
```

## Environment Variables Needed

| Variable              | Description                | Example                                |
| --------------------- | -------------------------- | -------------------------------------- |
| `GRAPH_TENANT_ID`     | Azure AD tenant            | `62837751-4e48-4d06-8bcb-57be1a669b78` |
| `GRAPH_CLIENT_ID`     | App registration client ID | `a1b2c3d4-e5f6-...`                    |
| `GRAPH_CLIENT_SECRET` | App registration secret    | `Your~Secret~Value`                    |
| `WATCH_USER_ID`       | User to monitor calendar   | `john.doe@company.com`                 |

## Common Issues

| Issue                              | Solution                                            |
| ---------------------------------- | --------------------------------------------------- |
| "GRAPH_CLIENT_ID not configured"   | Add values to `.env`                                |
| "No meetings found"                | Check calendar has events, verify `WATCH_USER_ID`   |
| "Could not resolve online meeting" | Wait 30-90 seconds after meeting ends               |
| "No transcripts available"         | Meeting may not have recording or access restricted |

---

**Status**: ✅ Ready to use - just add your Azure AD credentials to `.env`
