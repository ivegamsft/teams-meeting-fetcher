# Transcript Fetching Architecture Proposal

**Author:** Kobayashi (Microsoft Teams Architect)
**Date:** 2026-02-28
**Requested by:** ivegamsft
**Status:** Proposal — awaiting team review

---

## Problem Statement

The admin app shows 1,105 meetings captured via EventHub notifications, but 0 transcripts. The CsApplicationAccessPolicy is verified working (Graph API returns 200 with VTT content). All meetings remain in "scheduled" status. No automated transcript fetching pipeline exists — `meetingService.checkForTranscript()` is implemented but never called.

## Current State

### What exists and works
1. **EventHub Lambda** (`apps/aws-lambda-eventhub/handler.js`) — Polls Azure EventHub, writes calendar event notifications to DynamoDB and S3.
2. **Admin App** (`apps/admin-app`) — Full transcript model, service, and API routes:
   - `transcriptService.fetchAndStore(meeting, graphTranscriptId)` — Fetches VTT content via Graph API, stores in S3 (raw + sanitized), updates DynamoDB.
   - `meetingService.checkForTranscript(meeting)` — Lists transcripts via Graph API and calls `fetchAndStore`.
   - `GET /meetings/:id/transcript` — Retrieves stored transcript.
   - Meeting status lifecycle: `notification_received` → `scheduled` → `transcript_pending` → `completed`.
3. **Graph API permissions** — `OnlineMeetings.Read.All`, `OnlineMeetingTranscript.Read.All` granted. CsApplicationAccessPolicy propagated and verified.

### What's missing
- **Nothing triggers `checkForTranscript()`**. The function exists but no cron, event handler, or API endpoint invokes it on completed meetings.
- **Meeting status never advances past "scheduled"**. The EventHub captures calendar event `created`/`updated` notifications, but there is no logic to detect that a meeting has ended and is ready for transcript retrieval.
- **No `onlineMeetingId` on most records**. This field is populated only when `fetchDetails()` is called. Without it, `checkForTranscript()` cannot construct the Graph API URL.

## Graph API Call Chain for Transcripts

### Step 1: Resolve `onlineMeetingId` from the calendar event

The EventHub notification gives us a calendar event resource path:
```
groups/{groupId}/calendar/events/{eventId}
```

Calling `fetchDetails()` on this event returns `onlineMeetingId` (the Graph online meeting ID) and `organizerEmail`. Both are required.

### Step 2: List transcripts for the meeting
```
GET /users/{organizerEmail}/onlineMeetings/{onlineMeetingId}/transcripts
```
Returns an array of transcript objects. Each has an `id` (the `graphTranscriptId`).

> **Alternative (app-level, no user scope):**
> ```
> GET /communications/onlineMeetings/{onlineMeetingId}/transcripts
> ```
> The admin app already uses this path in `transcriptService.fetchAndStore()`.

### Step 3: Download transcript content
```
GET /communications/onlineMeetings/{onlineMeetingId}/transcripts/{transcriptId}/content
```
Returns VTT (WebVTT) format text. Already implemented in `transcriptService`.

## Timing Constraints

| Factor | Detail |
|--------|--------|
| **Transcript availability** | Transcripts are available 1-5 minutes after the meeting ends and transcription completes. For long meetings, processing can take up to 20 minutes. |
| **Meeting end detection** | Calendar event `updated` notifications fire when a meeting is modified (including cancellation), but Graph does **not** send a "meeting ended" event via calendar subscriptions. The `changeType` values from EventHub are `created`, `updated`, `deleted` — none mean "ended". |
| **onlineMeeting status** | The `onlineMeetings` resource has no reliable "ended" status field queryable from calendar event subscriptions. Meeting end must be inferred from time (`endTime` in the past). |
| **Subscription scope** | Current subscription monitors `groups/{groupId}/calendar/events` — this captures scheduling events, not meeting lifecycle (join/leave/end). |

### Key Insight
**Calendar event notifications tell us meetings are scheduled, not that they've happened.** To know a meeting has ended, we must either:
1. Compare `endTime` to current time (poll-based), or
2. Subscribe to a different resource — `communications/onlineMeetings/getAllTranscripts` — which fires when a transcript becomes available (event-driven).

## Architecture Recommendation: Hybrid Approach

### Option A: Scheduled Poller (Recommended — simplest, most reliable)

Add a scheduled Lambda (or cron job within admin-app) that runs every 5-15 minutes:

```
┌──────────────────────────────────────────────────┐
│  Transcript Poller (Lambda / Cron)               │
│  Runs every 5–15 minutes                         │
│                                                  │
│  1. Query DynamoDB for meetings where:           │
│     - status = 'scheduled'                       │
│     - endTime < now - 5 minutes                  │
│     - detailsFetched = true                      │
│     - onlineMeetingId is present                 │
│     - transcriptionId is absent                  │
│                                                  │
│  2. For each candidate meeting:                  │
│     a. GET /communications/onlineMeetings/       │
│        {onlineMeetingId}/transcripts             │
│     b. If transcripts exist:                     │
│        - Call transcriptService.fetchAndStore()   │
│        - Status → 'completed'                    │
│     c. If no transcript after endTime + 1 hour:  │
│        - Mark status = 'completed' (no transcript)│
│                                                  │
│  3. Rate limit: Max 50 meetings per run          │
│     Graph API throttle: 2000 req/20s per app     │
└──────────────────────────────────────────────────┘
```

**Pros:** Simple, reliable, no new Azure subscriptions needed, works with existing infrastructure.
**Cons:** 5-15 min latency to detect transcripts, polls meetings that may not have transcription enabled.

### Option B: Event-Driven via Transcript Subscription

Create a Graph subscription for transcript creation events:
```
Resource: users/{userId}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{userId}')
ChangeType: created
```

This fires the moment a transcript is available. The notification contains `meetingId` and `transcriptId` directly.

**Pros:** Near-instant transcript capture, no wasted polling.
**Cons:** Requires per-user subscriptions (one per organizer), 1-hour max expiry without `lifecycleNotificationUrl`, additional subscription management complexity, requires either webhook endpoint or EventHub routing.

### Option C: Hybrid (Recommended for production scale)

1. **Phase 1 (now):** Deploy Option A — the poller. Gets transcripts flowing with minimal effort.
2. **Phase 2 (later):** Add Option B — transcript subscriptions via EventHub. The poller becomes a fallback/catch-up mechanism.

## Recommended Implementation Plan

### Phase 1: Detail Enrichment + Transcript Poller

**Step 1: Batch-enrich existing meetings**
- Call `POST /meetings/batch-fetch-details` for all 1,105 meetings in "scheduled" status to populate `onlineMeetingId` and `organizerEmail`.
- This is already supported by the admin app API.

**Step 2: Add transcript polling endpoint**
- Add `POST /meetings/poll-transcripts` route to admin-app that:
  1. Queries meetings where `status = 'scheduled'`, `endTime < now - 5min`, `onlineMeetingId` is present, `transcriptionId` is absent.
  2. For each, calls `meetingService.checkForTranscript(meeting)`.
  3. Returns summary: `{ checked: N, found: N, failed: N }`.

**Step 3: Schedule the poller**
- Option A: AWS EventBridge rule triggers a Lambda that calls `POST /meetings/poll-transcripts` every 10 minutes.
- Option B: Add `node-cron` to admin-app to self-poll (simpler, but ties lifecycle to app process).
- Option C: External cron (GitHub Actions scheduled workflow, or AWS CloudWatch Events + Lambda).

**Step 4: Auto-enrich on notification**
- Modify the EventHub Lambda (`writeMeetingNotification`) to also trigger detail enrichment when it writes a new meeting, so future meetings arrive with `onlineMeetingId` already populated.

### Phase 2: Transcript Event Subscription (Future)

- Create `getAllTranscripts` subscription pointing to EventHub.
- EventHub Lambda routes transcript notifications to admin-app `/meetings/:id/transcript` processing.
- Poller remains as catch-up for missed events.

## Data Flow Diagram (Phase 1)

```
Graph API Calendar Subscription
        │
        ▼
   Azure EventHub
        │
        ▼
 EventHub Lambda ──────► DynamoDB (meetings table)
 (existing)              status: notification_received
                                │
                                ▼
                    Admin App: fetchDetails()
                    (batch or on-demand)
                         │
                         ▼
                    DynamoDB updated
                    status: scheduled
                    onlineMeetingId: populated
                                │
                                ▼
                    Transcript Poller (new)
                    Every 10 minutes
                         │
                         ▼
              Graph: GET .../transcripts
                    │           │
                    ▼           ▼
              Found         Not found
              │              (skip, retry next run)
              ▼
    transcriptService.fetchAndStore()
              │
              ├── S3: raw VTT
              ├── S3: sanitized VTT
              └── DynamoDB: status → completed
```

## Open Questions

1. **Which meetings should be polled?** Only meetings organized by users in the monitored group? Or all meetings visible in the group calendar?
2. **Transcript retention policy?** How long do we keep VTT files in S3?
3. **Sanitization config** — Is the sanitization service configured and tested? (`config.sanitization.enabled`)
4. **Scale concern** — 1,105 meetings, but how many actually had transcription enabled? Most may legitimately have no transcript. The poller should timeout after `endTime + 1 hour` and mark those as `completed` (no transcript) to avoid infinite re-polling.

## Dependencies

- Admin app must be running and accessible (for transcript poller API).
- Graph API permissions already granted (verified).
- CsApplicationAccessPolicy already propagated (verified).
- Existing meeting records need `onlineMeetingId` populated via `fetchDetails()`.

---

**Next step:** Isaac to confirm approach, then implementation begins with Step 1 (batch enrichment of existing meetings).
