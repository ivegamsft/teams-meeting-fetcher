# Transcript Pipeline Gap Analysis

**By:** McManus (Backend Dev)
**Date:** 2026-02-28
**Priority:** High — blocking core feature

## Problem

Dashboard shows 1105 meetings but 0 transcripts processed, 0 pending. All meetings stuck at "scheduled" status. CsApplicationAccessPolicy and Graph permissions are confirmed working (Graph API returns 200 for transcript endpoints).

## What EXISTS

### Admin App (complete storage + API layer)
- **Transcript model** (`models/transcript.ts`): Full status lifecycle — pending, fetching, raw_stored, sanitizing, completed, failed
- **TranscriptService** (`services/transcriptService.ts`): `fetchAndStore()` method that fetches VTT from Graph API, stores raw to S3, optionally sanitizes, updates DynamoDB
- **TranscriptStore** (`services/transcriptStore.ts`): Full DynamoDB CRUD for transcripts table (paginated)
- **API routes**: `GET /api/transcripts`, `GET /api/transcripts/:id`, `GET /api/meetings/:id/transcript`, `GET /api/meetings/:id/transcript/download`
- **MeetingService.checkForTranscript()** (`services/meetingService.ts:118-137`): Lists Graph transcripts for a meeting's `onlineMeetingId`, calls `transcriptService.fetchAndStore()` with the latest one
- **Config**: DynamoDB transcripts table, S3 raw/sanitized buckets, sanitization settings — all wired up

### Meeting Bot (independent transcript handling)
- Fetches transcripts on `meetingEnd` event and posts to Teams chat
- Has its own Graph subscription for `getAllTranscripts()` notifications
- Saves VTT to its own S3 bucket — does NOT write to admin app's DynamoDB transcripts table

### EventHub Lambda (meeting notifications only)
- Polls EventHub, archives to S3, writes meeting notifications to DynamoDB meetings table
- No transcript awareness whatsoever — doesn't check for transcripts or trigger any downstream processing

### Test/Utility Scripts
- `probe-transcript*.py`, `04-poll-transcription.py`, `05-fetch-transcript.py`: Manual Graph API testing scripts
- `process_transcript_notification.py`: Parses transcript webhook notifications
- `create-transcript-subscription.py`: Creates Graph transcript subscriptions
- All manual/ad-hoc — none are automated

## What's MISSING (the gap)

**There is no automated trigger that connects meeting notifications to transcript fetching in the admin app.**

Specifically:
1. **No background worker/poller** in the admin app that scans for meetings with `onlineMeetingId` set and calls `checkForTranscript()`
2. **No event-driven trigger** from the EventHub Lambda to the admin app's transcript check
3. **No API endpoint** that could be called externally to trigger transcript processing for a meeting
4. The meeting-bot's transcript handling is completely independent and doesn't feed the admin app pipeline

The `meetingService.checkForTranscript()` method is fully implemented but **never called by anything**.

## Recommended Fix (two options)

### Option A: Background Poller in Admin App (simpler)
Add a `setInterval`-based worker in `server.ts` or a new `services/transcriptWorker.ts` that:
1. Periodically scans DynamoDB meetings table for meetings where `detailsFetched === true`, `onlineMeetingId` is set, `status === 'scheduled'`, and `transcriptionId` is not set
2. Calls `meetingService.checkForTranscript(meeting)` for each
3. Handles rate limiting (Graph API ~100ms pacing)
4. Configurable poll interval (e.g., every 5 minutes)

### Option B: Event-Driven Lambda Trigger (more scalable)
Add a new Lambda or extend the EventHub Lambda to:
1. After writing a meeting notification, call the admin app's API to trigger transcript check
2. Or use EventBridge/SQS to decouple the trigger

### Recommendation
**Option A** for immediate unblocking — it's contained within the admin app, requires no infrastructure changes, and the `checkForTranscript()` method is already battle-ready.

## Dependencies
- Meetings must have `onlineMeetingId` populated (requires `fetchDetails` to have run first)
- Meetings must have actually occurred with transcription enabled
- Graph API access (CsApplicationAccessPolicy) confirmed working
