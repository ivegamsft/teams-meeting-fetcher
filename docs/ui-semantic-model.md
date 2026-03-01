# UI Semantic Model — Teams Meeting Fetcher

> **Author:** Kobayashi (Teams Architect) | **Date:** 2026-02-28  
> **Status:** Design Document | **Audience:** TMF Development Team  
> **Companion:** [API Semantic Model](./teams-meeting-semantic-model.md) — the raw Graph API entity landscape  
> **Purpose:** Defines how the admin UI should present meetings to users, abstracting the messy Graph API internals into a clean, consistent experience.

---

## Table of Contents

1. [The Core Insight](#1-the-core-insight)
2. [User-Facing Entity Hierarchy](#2-user-facing-entity-hierarchy)
3. [Lifecycle Mapping](#3-lifecycle-mapping)
4. [Data at Each Level](#4-data-at-each-level)
5. [Unified UI View Proposal](#5-unified-ui-view-proposal)
6. [Status Badges and Visual Language](#6-status-badges-and-visual-language)
7. [Detail Modal by Lifecycle Stage](#7-detail-modal-by-lifecycle-stage)
8. [Raw Data / Debug View](#8-raw-data--debug-view)
9. [Edge Cases and Partial Data](#9-edge-cases-and-partial-data)
10. [Migration from Current UI](#10-migration-from-current-ui)
11. [Appendix: Naming Glossary](#appendix-naming-glossary)

---

## 1. The Core Insight

Isaac asked: *"A calendar item can become a meeting, and then be transcribed — is that right?"*

**Yes, AND there are important nuances:**

```
                    THE HAPPY PATH
                    ==============

  Calendar Item ──────► Meeting ──────► Transcribed Meeting
  (someone scheduled    (people actually   (transcript was
   it in Outlook)        joined and held    enabled and
                         the call)          processed)

                    BUT ALSO:
                    =========

  - Not every Calendar Item becomes a Meeting
    (scheduled but never held, cancelled, attendees forgot)

  - Not every Meeting becomes Transcribed
    (transcription off, Teams Premium not licensed, processing failed)

  - Some Meetings have NO Calendar Item
    (ad hoc "Meet Now" calls, channel calls with no event)

  - Some items may have Transcripts without a confirmed "Held" signal
    (if callRecords subscription isn't active yet, we may get the
     transcript before we know the meeting was held)
```

The UI must present this progression clearly while handling every combination gracefully.

---

## 2. User-Facing Entity Hierarchy

### 2.1 The Three User-Facing Stages

Users should never see "CalendarEvent", "OnlineMeeting", "CallRecord", or "TranscriptRecord". Those are Graph API internals. Instead, the admin UI uses **three human-readable stages**:

| Stage | User-Facing Name | Internal Trigger | What It Means |
|---|---|---|---|
| 1 | **Scheduled** | Calendar webhook fires (event created) | Someone put a meeting on the calendar. We know WHEN and WHO was invited, but the meeting hasn't happened yet. |
| 2 | **Held** | CallRecord received, or `endTime` passed with evidence of attendance | The meeting actually took place. We know WHO joined, WHEN it actually started/ended, and HOW LONG it lasted. |
| 3 | **Transcribed** | Transcript content fetched and stored | A transcript is available. We have the full spoken-word record. |

### 2.2 Terminal States

| State | User-Facing Name | When |
|---|---|---|
| | **Cancelled** | Calendar event deleted or marked cancelled |
| | **Not Held** | Scheduled time has passed (24+ hours) with no callRecord and no transcript |
| | **No Transcript** | Meeting was held but no transcript appeared within 48 hours |

### 2.3 Why Not "Calendar Item / Meeting / Transcribed Meeting"?

Using "Calendar Item" as the first-stage name introduces confusion — users think of all three stages as "meetings." The word "Scheduled" is the state, not the entity type. The entity is always an **Event** (what appeared on the radar), and the stage describes how far it progressed.

**Recommended entity name:** **Event** (the row in the table)  
**Recommended stage names:** **Scheduled → Held → Transcribed** (the lifecycle badge)

This avoids the current problem where everything is called a "meeting" even when nobody met.

---

## 3. Lifecycle Mapping

### 3.1 Primary Lifecycle (Happy Path)

```
  TIME ─────────────────────────────────────────────────────────────────►

  ┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
  │  SCHEDULED │────►│    HELD    │────►│TRANSCRIBING│────►│TRANSCRIBED │
  │            │     │            │     │            │     │            │
  │ Badge: (S) │     │ Badge: (H) │     │ Badge: ... │     │ Badge: (T) │
  │ Gray       │     │ Blue       │     │ Yellow     │     │ Green      │
  └────────────┘     └────────────┘     └────────────┘     └────────────┘
       │                   │                                     │
       │  Calendar         │  CallRecord               Transcript│content
       │  webhook          │  subscription             fetched + │stored
       │  (created)        │  OR end-time              in S3     │
       │                   │  inference                          │
```

### 3.2 All Possible Transitions

```
                          Calendar webhook (created)
                                    │
                                    ▼
                            ┌───────────────┐
                            │   SCHEDULED   │
                            │               │
                            └───────┬───────┘
                                    │
                   ┌────────────────┼─────────────────┐
                   │                │                  │
             calendar event    endTime passes     transcript
             deleted           + callRecord OR    notification
                   │           + evidence         arrives
                   ▼                │                  │
            ┌────────────┐    ┌─────┴──────┐          │
            │ CANCELLED  │    │    HELD    │          │
            │ (terminal) │    │            │          │
            └────────────┘    └─────┬──────┘          │
                                    │                  │
                              ┌─────┼──────┐          │
                              │     │      │          │
                        transcript  │  no xscript     │
                        available   │  after 48h      │
                              │     │      │          │
                              ▼     │      ▼          │
                     ┌─────────────┐│ ┌──────────┐    │
                     │TRANSCRIBING ││ │   NO     │    │
                     │  (fetching) ││ │TRANSCRIPT│    │
                     └──────┬──────┘│ │(terminal)│    │
                            │       │ └──────────┘    │
                            ▼       │                 │
                     ┌─────────────┐│                 │
                     │ TRANSCRIBED ││                 │
                     │ (terminal)  │◄─────────────────┘
                     └─────────────┘  (skip Held if we get
                                       transcript before
                                       callRecord)

              ┌─────────────────────────────────────────┐
              │           AD HOC MEETINGS                │
              │                                          │
              │  CallRecord arrives for a meeting with   │
              │  no matching calendar event.             │
              │                                          │
              │  Entry point: HELD (no Scheduled stage)  │
              │  Then follows normal Held → Transcribed  │
              └─────────────────────────────────────────┘

   24+ hours past endTime with no callRecord:
              SCHEDULED ──► NOT HELD (terminal)
```

### 3.3 When Does Each Transition Happen?

| Transition | Trigger | Data Source | Latency |
|---|---|---|---|
| `→ Scheduled` | Calendar webhook fires | Calendar API event | Real-time |
| `Scheduled → Held` | CallRecord subscription fires, OR endTime passed and transcript found | Call Records API | 0–15 min after meeting ends |
| `Scheduled → Cancelled` | Calendar event deleted/cancelled | Calendar API webhook (deleted) | Real-time |
| `Scheduled → Not Held` | 24 hours past `endTime`, no callRecord, no transcript | TMF poller inference | ~24 hours |
| `Held → Transcribing` | Transcript notification received or poller finds transcript ID | getAllTranscripts subscription | 5–30 min after meeting ends |
| `Transcribing → Transcribed` | VTT content downloaded and stored in S3 | TMF fetch + store pipeline | Seconds after notification |
| `Held → No Transcript` | 48 hours past meeting end, no transcript appeared | TMF poller timeout | ~48 hours |
| `→ Held` (ad hoc) | CallRecord for unknown joinWebUrl | Call Records API | 0–15 min after call ends |

---

## 4. Data at Each Level

### 4.1 Scheduled Level (Calendar Data)

Everything we know from the Outlook calendar event. This is the **minimum** data for any row.

| Field | Source | Example |
|---|---|---|
| Subject | `CalendarEvent.subject` | "Weekly Standup" |
| Organizer | `CalendarEvent.organizer.emailAddress` | "isaac@contoso.com" |
| Scheduled Start | `CalendarEvent.start.dateTime` | "Mar 1, 2026 10:00 AM" |
| Scheduled End | `CalendarEvent.end.dateTime` | "Mar 1, 2026 10:30 AM" |
| Invited Attendees | `CalendarEvent.attendees[]` | 5 people invited |
| Join URL | `CalendarEvent.onlineMeeting.joinUrl` | Teams link |
| RSVP Status | `CalendarEvent.attendees[].status` | 3 accepted, 1 tentative, 1 no response |

### 4.2 Held Level (Call Data)

Data that only exists if the meeting was actually held. This comes from the Call Records API.

| Field | Source | Example |
|---|---|---|
| Actual Start | `CallRecord.startDateTime` | "Mar 1, 2026 10:02 AM" |
| Actual End | `CallRecord.endDateTime` | "Mar 1, 2026 10:28 AM" |
| Actual Duration | Computed from actual start/end | "26 minutes" |
| Participants (Joined) | `CallRecord.participants_v2[]` | 4 of 5 invited actually joined |
| Call Type | `CallRecord.type` | "groupCall" |
| Modalities | `CallRecord.modalities` | ["audio", "video", "screenSharing"] |

### 4.3 Transcribed Level (Transcript Data)

Data that only exists when a transcript has been fetched and stored.

| Field | Source | Example |
|---|---|---|
| Transcript Status | TMF internal | "completed" |
| Language | `Transcript.contentCorrelationId` / VTT header | "en-US" |
| Speakers | Parsed from VTT content | ["Isaac", "Sarah", "Bob"] |
| Word Count | Computed from sanitized text | 3,241 words |
| Raw S3 Path | TMF storage | `s3://bucket/raw/transcript-123.vtt` |
| Sanitized S3 Path | TMF storage | `s3://bucket/sanitized/transcript-123.txt` |

### 4.4 Data Availability Matrix

| Field | Scheduled | Held | Transcribed | Not Held | Cancelled |
|---|---|---|---|---|---|
| Subject | Yes | Yes | Yes | Yes | Yes |
| Organizer | Yes | Yes | Yes | Yes | Yes |
| Scheduled Start/End | Yes | Yes | Yes | Yes | Yes |
| Invited Attendees | Yes | Yes | Yes | Yes | Yes |
| Actual Start/End | -- | Yes | Yes | -- | -- |
| Actual Duration | -- | Yes | Yes | -- | -- |
| Who Joined | -- | Yes | Yes | -- | -- |
| Transcript Content | -- | -- | Yes | -- | -- |
| Speakers | -- | -- | Yes | -- | -- |

---

## 5. Unified UI View Proposal

### 5.1 Recommendation: Merge to Single "Events" View

**Current state:** Two separate tabs — "Meetings" and "Transcripts"  
**Proposed state:** One unified **"Events"** tab with progressive disclosure

**Why merge?**

- The current Transcripts tab is a subset of Meetings — every transcript belongs to a meeting. Showing them separately creates confusion about which view is "complete."
- The lifecycle badge (Scheduled → Held → Transcribed) makes the transcript status visible without a separate tab.
- One table with filters is easier to navigate than two tables with overlapping data.

**Why not keep separate tabs?**

The only argument for separate tabs is if an admin specifically wants to see "only things with transcripts." That use case is fully covered by the **Transcript filter** (already exists in the current Meetings tab).

### 5.2 Proposed Table Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Events                                                     [Filters ▼]     │
│                                                                              │
│  ┌─────────┬────────────┬───────────┬──────────┬──────────┬───────────────┐  │
│  │ Subject │ Organizer  │ Date/Time │ Duration │  Stage   │   Actions     │  │
│  ├─────────┼────────────┼───────────┼──────────┼──────────┼───────────────┤  │
│  │ Weekly  │ Isaac V.   │ Mar 1     │ 26 min   │[TRANSCR] │ View  Details │  │
│  │ Standup │            │ 10:00 AM  │          │          │               │  │
│  ├─────────┼────────────┼───────────┼──────────┼──────────┼───────────────┤  │
│  │ Sales   │ Sarah K.   │ Mar 1     │ 45 min   │[  HELD ] │       Details │  │
│  │ Review  │            │ 2:00 PM   │          │          │               │  │
│  ├─────────┼────────────┼───────────┼──────────┼──────────┼───────────────┤  │
│  │ Sprint  │ Bob M.     │ Mar 2     │   --     │[SCHEDUL] │       Details │  │
│  │ Retro   │            │ 9:00 AM   │          │          │               │  │
│  ├─────────┼────────────┼───────────┼──────────┼──────────┼───────────────┤  │
│  │ Q1 Plan │ Isaac V.   │ Feb 28    │   --     │[NOT HLD] │       Details │  │
│  │ Review  │            │ 3:00 PM   │          │          │               │  │
│  └─────────┴────────────┴───────────┴──────────┴──────────┴───────────────┘  │
│                                                                              │
│                     Page 1 of 12  (291 events)    [Prev] [Next]              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Column Definitions

| Column | Content | Sort | Notes |
|---|---|---|---|
| **Subject** | Meeting subject (link to detail modal) | Alpha | Click opens detail modal |
| **Organizer** | Display name of organizer | Alpha | Falls back to email if name unavailable |
| **Date/Time** | Scheduled start date + time | Date (default desc) | Shows "actual" start if Held, falls back to "scheduled" |
| **Duration** | Actual duration if Held, scheduled duration if Scheduled only | Numeric | Shows `--` if Scheduled and not yet held |
| **Stage** | Lifecycle badge (see Section 6) | Custom order | Sortable with custom ordering: Transcribed > Held > Scheduled > Not Held > Cancelled |
| **Actions** | View Transcript (if available), Details button | -- | "View" only visible for Transcribed stage |

### 5.4 Filters

| Filter | Options | Default |
|---|---|---|
| **Stage** | All, Scheduled, Held, Transcribed, Not Held, Cancelled | All |
| **Date Range** | From / To date pickers | Last 30 days |
| **Has Transcript** | All, Yes, No | All (shortcut for Stage=Transcribed) |
| **Organizer** | Text search | -- |

The **Stage filter** replaces the current "Status" filter (which shows internal states like `notification_received`, `scheduled`, `completed`). The "Has Transcript" filter is a convenience alias for `Stage = Transcribed`.

### 5.5 What About the Current "Status" Values?

The current `meeting.status` field has these values: `notification_received`, `scheduled`, `recording`, `transcript_pending`, `completed`, `failed`, `cancelled`.

These are **internal pipeline states**, not user-facing concepts. The mapping:

| Internal Status | UI Stage | Notes |
|---|---|---|
| `notification_received` | Scheduled | Just arrived via webhook, not enriched yet |
| `scheduled` | Scheduled | Enriched, but meeting hasn't happened |
| `recording` | Held | Meeting in progress (rare to see in practice) |
| `transcript_pending` | Held | Meeting ended, waiting for transcript |
| `completed` | Transcribed | Transcript fetched and stored |
| `failed` | Scheduled (with error indicator) | Enrichment or fetch failed; retry pending |
| `cancelled` | Cancelled | Calendar event was deleted/cancelled |

---

## 6. Status Badges and Visual Language

### 6.1 Stage Badge Design

Each lifecycle stage gets a distinct color and icon. These are CSS-only — no icon library required.

| Stage | Badge Text | Color | CSS Class | Icon (Unicode) |
|---|---|---|---|---|
| **Scheduled** | `Scheduled` | Gray (`#6b7280`) bg, white text | `.stage-scheduled` | `&#128197;` (calendar) or none |
| **Held** | `Held` | Blue (`#3b82f6`) bg, white text | `.stage-held` | `&#9989;` (checkmark) or none |
| **Transcribing** | `Processing` | Yellow (`#f59e0b`) bg, dark text | `.stage-transcribing` | spinner animation |
| **Transcribed** | `Transcribed` | Green (`#10b981`) bg, white text | `.stage-transcribed` | `&#128196;` (page) or none |
| **Not Held** | `Not Held` | Light gray (`#e5e7eb`) bg, gray text | `.stage-not-held` | -- |
| **Cancelled** | `Cancelled` | Red (`#ef4444`) bg, white text | `.stage-cancelled` | -- |

### 6.2 CSS (Vanilla — No Framework)

```css
/* Stage badges — replaces current status-badge system */
.stage-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.stage-scheduled    { background: #6b7280; color: #fff; }
.stage-held         { background: #3b82f6; color: #fff; }
.stage-transcribing { background: #f59e0b; color: #1f2937; }
.stage-transcribed  { background: #10b981; color: #fff; }
.stage-not-held     { background: #e5e7eb; color: #6b7280; }
.stage-cancelled    { background: #ef4444; color: #fff; }
```

### 6.3 Stage Resolution Logic

The UI computes the stage from existing data fields. No backend changes required for Phase 1.

```
function resolveStage(event) {
  // Terminal states first
  if (event.changeType === 'deleted' || event.status === 'cancelled')
    return 'cancelled';

  // Has transcript content?
  if (event.transcriptionId && event.status === 'completed')
    return 'transcribed';

  // Transcript fetch in progress?
  if (event.transcriptionId && event.status !== 'completed')
    return 'transcribing';

  // Has evidence of being held?
  //   - callRecordId present (Phase 2), OR
  //   - status is 'recording' or 'transcript_pending', OR
  //   - endTime is in the past AND detailsFetched is true
  if (event.callRecordId
      || event.status === 'recording'
      || event.status === 'transcript_pending')
    return 'held';

  // Scheduled time has long passed with no activity?
  if (event.endTime) {
    const hoursSinceEnd = (Date.now() - new Date(event.endTime)) / 3600000;
    if (hoursSinceEnd > 24)
      return 'not-held';
  }

  // Default: still scheduled
  return 'scheduled';
}
```

---

## 7. Detail Modal by Lifecycle Stage

### 7.1 Progressive Disclosure

The detail modal should show **more sections** as the lifecycle progresses. Sections for data that doesn't exist yet are hidden — not shown as empty.

```
┌──────────────────────────────────────────────────────┐
│  Weekly Standup                         [TRANSCRIBED] │
│──────────────────────────────────────────────────────│
│                                                      │
│  SCHEDULING                                          │
│  ┌────────────────────────────────────────────────┐  │
│  │ Organizer:     Isaac V. (isaac@contoso.com)    │  │
│  │ Scheduled:     Mar 1, 2026 10:00 AM – 10:30 AM│  │
│  │ Invited:       5 attendees                     │  │
│  │ RSVP:          3 accepted, 1 tentative, 1 none │  │
│  │ Join Link:     [Copy]                          │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  MEETING  (visible when stage >= Held)               │
│  ┌────────────────────────────────────────────────┐  │
│  │ Actual Time:   10:02 AM – 10:28 AM (26 min)   │  │
│  │ Joined:        4 of 5 invited                  │  │
│  │ Modalities:    Audio, Video, Screen Sharing    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  TRANSCRIPT  (visible when stage >= Transcribed)     │
│  ┌────────────────────────────────────────────────┐  │
│  │ Language:      en-US                           │  │
│  │ Speakers:      Isaac, Sarah, Bob               │  │
│  │ Word Count:    3,241                           │  │
│  │ [View Transcript]  [Download]                  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ▸ Raw API Data  (collapsed by default)              │
│                                                      │
│                                          [Close]     │
└──────────────────────────────────────────────────────┘
```

### 7.2 Section Visibility Rules

| Section | Shown When | Hidden When |
|---|---|---|
| **Scheduling** | Always | Never — every event has scheduling data |
| **Meeting** | Stage is Held, Transcribing, or Transcribed | Stage is Scheduled, Not Held, or Cancelled |
| **Transcript** | Stage is Transcribed | All other stages |
| **Enrichment Status** | Always (keep current checklist) | Never — useful for debugging |
| **Raw API Data** | Always (collapsed) | Never — see Section 8 |

---

## 8. Raw Data / Debug View

### 8.1 Design: Collapsible "Raw API Data" Section

Isaac wants the raw Graph API objects preserved and accessible. This is for admin/debugging, not the primary view.

```
  ▸ Raw API Data                    ← collapsed by default

  ▾ Raw API Data                    ← expanded on click
  ┌────────────────────────────────────────────────┐
  │  ┌──────────────────────────────────────────┐  │
  │  │ CalendarEvent         [Copy JSON]        │  │
  │  │ ──────────────────────────────────        │  │
  │  │ {                                        │  │
  │  │   "id": "AAMkAGI2T...",                  │  │
  │  │   "subject": "Weekly Standup",           │  │
  │  │   "start": { "dateTime": "2026-...",     │  │
  │  │   ...                                    │  │
  │  │ }                                        │  │
  │  └──────────────────────────────────────────┘  │
  │                                                │
  │  ┌──────────────────────────────────────────┐  │
  │  │ OnlineMeeting          [Copy JSON]       │  │
  │  │ ──────────────────────────────────        │  │
  │  │ { ... }    (or "Not available" if no     │  │
  │  │             onlineMeetingId resolved)     │  │
  │  └──────────────────────────────────────────┘  │
  │                                                │
  │  ┌──────────────────────────────────────────┐  │
  │  │ CallRecord             [Copy JSON]       │  │
  │  │ ──────────────────────────────────        │  │
  │  │ { ... }    (or "Not available")          │  │
  │  └──────────────────────────────────────────┘  │
  │                                                │
  │  ┌──────────────────────────────────────────┐  │
  │  │ TranscriptRecord       [Copy JSON]       │  │
  │  │ ──────────────────────────────────        │  │
  │  │ { ... }    (or "Not available")          │  │
  │  └──────────────────────────────────────────┘  │
  └────────────────────────────────────────────────┘
```

### 8.2 Data Sources for Raw View

| Raw Object | Source | Available When |
|---|---|---|
| **CalendarEvent** | `meeting.rawEventData` (stored in DynamoDB on enrichment) | After first `fetchDetails()` call |
| **OnlineMeeting** | Fetched on-demand via `/users/{orgId}/onlineMeetings?$filter=JoinWebUrl eq '...'` | When `onlineMeetingId` is resolved |
| **CallRecord** | Stored when callRecord subscription fires (Phase 2) | After meeting is held |
| **TranscriptRecord** | TMF internal record (not raw Graph — we don't store the raw transcript metadata, just the content) | After transcript fetch |

### 8.3 Implementation Note

The `rawEventData` field already exists on the `Meeting` model (optional `Record<string, any>`). For Phase 1, this is the only raw data available. Phase 2 adds CallRecord data. The raw view should show "Not available — enrichment pending" for objects that haven't been fetched yet.

---

## 9. Edge Cases and Partial Data

### 9.1 Every Combination the Model Must Handle

| Scenario | Has Calendar Event? | Has CallRecord? | Has Transcript? | UI Stage | Notes |
|---|---|---|---|---|---|
| Normal scheduled meeting, not yet held | Yes | No | No | **Scheduled** | Most common state for future meetings |
| Meeting held with transcript | Yes | Yes | Yes | **Transcribed** | Happy path complete |
| Meeting held, no transcript | Yes | Yes | No | **Held** (→ No Transcript after 48h) | Transcription was off, or failed |
| Meeting held, transcript arrives before callRecord | Yes | No | Yes | **Transcribed** | Transcript subscription faster than callRecord sub |
| Ad hoc call (no calendar event) | No | Yes | No | **Held** | "Meet Now" or channel call; subject may be missing |
| Ad hoc call with transcript | No | Yes | Yes | **Transcribed** | Subject inferred from OnlineMeeting if available |
| Cancelled before holding | Yes | No | No | **Cancelled** | Calendar event deleted |
| Scheduled but never held | Yes | No | No | **Not Held** | 24+ hours past end, no evidence of activity |
| Enrichment failed | Yes | No | No | **Scheduled** (with error) | Show error icon, allow retry |
| Transcript fetch failed | Yes | Maybe | Partial | **Held** (with error) | Transcript ID known but VTT download failed |

### 9.2 Displaying Missing Data

When data for a field is unavailable, the UI should:

| Situation | Display | NOT This |
|---|---|---|
| Subject unknown (ad hoc call) | "Untitled Meeting" (italic) | Blank cell |
| Organizer unknown | Email address as fallback | "--" |
| Duration not yet known (Scheduled) | Show scheduled duration in gray + "(scheduled)" | "--" |
| Actual duration known (Held) | Show actual duration in normal weight | Scheduled duration |
| No attendee RSVP data | "Invite data not available" | Empty list |
| No participants joined data | Section hidden entirely | Empty list |

### 9.3 The "Scheduled Duration" vs "Actual Duration" Problem

The current UI shows one "Duration" column computed from `startTime` and `endTime`. But these are the **scheduled** times from the calendar event. The actual meeting may have started late and ended early (or run over).

**Proposal:**

| Stage | Duration Column Shows | Tooltip |
|---|---|---|
| Scheduled | Scheduled duration in gray | "Scheduled: 30 min" |
| Held | Actual duration in normal weight | "Actual: 26 min (scheduled: 30 min)" |
| Transcribed | Actual duration in normal weight | "Actual: 26 min (scheduled: 30 min)" |
| Not Held | Scheduled duration in gray, struck through | "Scheduled: 30 min — meeting was not held" |

---

## 10. Migration from Current UI

### 10.1 Phased Approach

The current admin app uses vanilla JS. Changes should be incremental, not a rewrite.

#### Phase 1: Rename + Badge (Minimal UI Change)

**Effort: Small. No backend changes.**

1. Rename "Meetings" nav tab to "Events"
2. Add `resolveStage()` function (from Section 6.3) to `app.js`
3. Replace `status-badge status-${m.status}` with `stage-badge stage-${resolveStage(m)}`
4. Add stage CSS classes (from Section 6.2)
5. Keep the current Transcripts tab as-is (users are familiar with it)
6. Add "Stage" column to meetings table, remove or rename "Status" column

**Result:** Users see "Scheduled / Held / Transcribed" badges instead of "notification_received / scheduled / completed."

#### Phase 2: Merge Tabs + Filters

**Effort: Medium. No backend changes.**

1. Remove the Transcripts tab
2. Add Stage filter to the Events tab (replaces current Status filter)
3. Add "Has Transcript" convenience filter
4. Update the table layout per Section 5.2
5. Update detail modal with progressive disclosure sections (Section 7)

**Result:** Single unified view with lifecycle progression visible at a glance.

#### Phase 3: Raw Data + Full Lifecycle

**Effort: Medium. Backend changes needed for callRecord storage.**

1. Add collapsible "Raw API Data" section to detail modal
2. Store callRecord data when subscription is implemented
3. Show actual vs. scheduled duration
4. Show "Who Joined" vs "Who Was Invited" comparison
5. Implement "Not Held" terminal state (24h timeout logic)

**Result:** Full lifecycle visibility with raw data access for debugging.

### 10.2 What Changes in Each File

| File | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| `apps/admin-app/public/js/app.js` | Add `resolveStage()`, update badge rendering | Merge Transcripts into Events, add filters | Add raw data toggle, duration logic |
| `apps/admin-app/public/css/styles.css` | Add `.stage-*` badge classes | Update table layout | Add raw data panel styles |
| `apps/admin-app/public/index.html` | Rename tab label | Remove Transcripts tab, add Stage filter | Add raw data section to detail modal |
| `apps/admin-app/src/models/meeting.ts` | No change | No change | Add `callRecordId`, `actualStart`, `actualEnd` fields |

---

## Appendix: Naming Glossary

### User-Facing Terms (Use in UI)

| Term | Definition | Use When |
|---|---|---|
| **Event** | Any item tracked by the system — scheduled meetings, ad hoc calls, etc. | Table rows, navigation, page titles |
| **Scheduled** | An event that has a calendar entry but hasn't been held yet | Stage badge, filter option |
| **Held** | An event where people actually joined and had a call | Stage badge, filter option |
| **Transcribed** | An event where a transcript has been captured and stored | Stage badge, filter option |
| **Not Held** | A scheduled event that was never held | Stage badge, filter option |
| **Cancelled** | A scheduled event that was explicitly cancelled | Stage badge, filter option |
| **Processing** | A transcript is being fetched/stored (transient state) | Stage badge only (brief) |

### Internal Terms (Never Show in UI)

| Term | What It Is | Maps To (UI) |
|---|---|---|
| `CalendarEvent` | Graph API: Outlook calendar entry | Event (Scheduled) |
| `OnlineMeeting` | Graph API: Teams meeting runtime object | (hidden — enrichment artifact) |
| `CallRecord` | Graph API: Post-call telemetry record | Event (Held) |
| `TranscriptRecord` | TMF internal: Stored transcript metadata | Event (Transcribed) |
| `notification_received` | Internal status: webhook just arrived | Scheduled |
| `enrichmentStatus` | Internal: whether Graph details were fetched | (hidden — shown in enrichment checklist only) |
| `onlineMeetingId` | Graph GUID linking Calendar to OnlineMeeting | (hidden — raw data view only) |

### API-to-UI Field Mapping

| UI Display | Internal Field | Graph API Origin |
|---|---|---|
| "Subject" | `meeting.subject` | `CalendarEvent.subject` |
| "Organizer" | `meeting.organizerDisplayName` | `CalendarEvent.organizer.emailAddress.name` |
| "Date/Time" | `meeting.startTime` | `CalendarEvent.start.dateTime` |
| "Duration" | Computed from `startTime`/`endTime` | `CalendarEvent.start/end` or `CallRecord.start/endDateTime` |
| "Stage" | Computed by `resolveStage()` | Multiple fields (see Section 6.3) |
| "Invited" | `meeting.attendees[]` | `CalendarEvent.attendees[]` |
| "Joined" | (Phase 3) | `CallRecord.participants_v2[]` |
| "Transcript" | `meeting.transcriptionId` existence | TMF internal after fetching from Graph |
