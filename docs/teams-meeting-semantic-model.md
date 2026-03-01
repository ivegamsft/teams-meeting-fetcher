# Teams Meeting Semantic Model

> **Author:** Kobayashi (Teams Architect) | **Date:** 2026-02-28  
> **Status:** Reference Document | **Audience:** TMF Development Team  
> **Purpose:** Maps the Microsoft Graph API entity landscape for Teams meetings, identifies lifecycle gaps in the current architecture, and recommends the target event pipeline.

---

## Table of Contents

1. [Graph API Entity Landscape](#1-graph-api-entity-landscape)
2. [Meeting Lifecycle Stages](#2-meeting-lifecycle-stages)
3. [The Semantic Gap — Why TMF Misses Transcripts](#3-the-semantic-gap--why-tmf-misses-transcripts)
4. [Proposed Domain Model](#4-proposed-domain-model)
5. [Alternative Subscription Types Evaluation](#5-alternative-subscription-types-evaluation)
6. [Recommended Architecture](#6-recommended-architecture)
7. [Appendix: API Reference Quick-Look](#appendix-api-reference-quick-look)

---

## 1. Graph API Entity Landscape

Microsoft Graph represents a Teams meeting through **five distinct entity types** that live in **three separate API surfaces**. They share no common key by default.

### 1.1 Entity Relationship Graph

```
                        OUTLOOK / CALENDAR API
                   ┌──────────────────────────────┐
                   │                              │
                   │    ┌──────────────────┐      │
                   │    │  CalendarEvent    │      │
                   │    │                  │      │
                   │    │  - id (eventId)  │      │
                   │    │  - subject       │      │
                   │    │  - start/end     │      │
                   │    │  - organizer     │      │
                   │    │  - joinUrl ──────┼──────┼─── Weak link (URL string match)
                   │    │  - onlineMeeting │      │
                   │    │    Provider      │      │
                   │    └──────────────────┘      │
                   │                              │
                   └──────────────────────────────┘
                              │
                              │ joinWebUrl (string match, NOT a foreign key)
                              ▼
                   COMMUNICATIONS / ONLINE MEETINGS API
                   ┌──────────────────────────────────────────────┐
                   │                                              │
                   │    ┌──────────────────┐                      │
                   │    │  OnlineMeeting    │                      │
                   │    │                  │                      │
                   │    │  - id (GUID)     │◄─── onlineMeetingId  │
                   │    │  - joinWebUrl    │                      │
                   │    │  - subject       │                      │
                   │    │  - start/end     │                      │
                   │    │  - participants  │                      │
                   │    └──────┬───────────┘                      │
                   │           │ 1:N                              │
                   │           ▼                                  │
                   │    ┌──────────────────┐  ┌────────────────┐  │
                   │    │  Transcript       │  │  Recording      │  │
                   │    │                  │  │                │  │
                   │    │  - id            │  │  - id          │  │
                   │    │  - createdDT     │  │  - createdDT   │  │
                   │    │  - content (VTT) │  │  - content(MP4)│  │
                   │    └──────────────────┘  └────────────────┘  │
                   │                                              │
                   └──────────────────────────────────────────────┘
                              │
                              │ onlineMeetingId (sometimes present in callRecord)
                              │
                   COMMUNICATIONS / CALL RECORDS API
                   ┌──────────────────────────────────────────────┐
                   │                                              │
                   │    ┌───────────────────────┐                 │
                   │    │  CallRecord            │                 │
                   │    │                       │                 │
                   │    │  - id                 │                 │
                   │    │  - type (groupCall)   │                 │
                   │    │  - startDateTime      │                 │
                   │    │  - endDateTime        │                 │
                   │    │  - organizer          │                 │
                   │    │  - participants_v2    │                 │
                   │    │  - joinWebUrl         │                 │
                   │    │  - modalities         │                 │
                   │    │  - sessions[]         │                 │
                   │    │    └─ segments[]      │                 │
                   │    │       └─ media[]      │                 │
                   │    └───────────────────────┘                 │
                   │                                              │
                   └──────────────────────────────────────────────┘
```

### 1.2 Entity Summary Table

| Entity | API Surface | Key Identifier | Created When | Subscription Support |
|---|---|---|---|---|
| **CalendarEvent** | `/users/{id}/events` | `eventId` (string) | Meeting scheduled in Outlook | Yes — calendar CRUD (created/updated/deleted) |
| **OnlineMeeting** | `/users/{id}/onlineMeetings` | `onlineMeetingId` (GUID) | Teams meeting link generated | Per-meeting lifecycle events only |
| **CallRecord** | `/communications/callRecords` | `callRecordId` (GUID) | Meeting/call ends | Yes — tenant-wide (fires on call end) |
| **Transcript** | `/users/{id}/onlineMeetings/{mid}/transcripts` | `transcriptId` (GUID) | Transcript processing completes | Yes — via `getAllTranscripts` |
| **Recording** | `/users/{id}/onlineMeetings/{mid}/recordings` | `recordingId` (GUID) | Recording processing completes | Yes — via `getAllRecordings` |

### 1.3 Cross-Entity Key Relationships

There is **no single foreign key** that cleanly links all five entities. The relationships are:

| From | To | Link Mechanism | Reliability |
|---|---|---|---|
| CalendarEvent → OnlineMeeting | `joinWebUrl` string match via `$filter` | Medium — requires URL decode/encode handling |
| CalendarEvent → CallRecord | No direct link | None — must correlate via time + organizer + joinWebUrl |
| OnlineMeeting → Transcript | `onlineMeetingId` parent path | High — direct containment relationship |
| OnlineMeeting → Recording | `onlineMeetingId` parent path | High — direct containment relationship |
| CallRecord → OnlineMeeting | `joinWebUrl` match or time correlation | Medium — joinWebUrl may or may not be present |

**Critical insight:** The `CalendarEvent.id` (eventId) and `OnlineMeeting.id` (onlineMeetingId) are **completely different identifiers** with no built-in mapping. The only bridge is `joinWebUrl`.

---

## 2. Meeting Lifecycle Stages

A Teams meeting passes through distinct lifecycle stages, each served by a **different** Graph API surface with **different** auth models.

### 2.1 Lifecycle Timeline

```
TIME ──────────────────────────────────────────────────────────────►

  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────────┐
  │SCHEDULED │   │ STARTED │   │  ENDED  │   │PROCESSED│   │ TRANSCRIPT  │
  │          │──►│         │──►│         │──►│         │──►│  AVAILABLE  │
  │          │   │         │   │         │   │         │   │             │
  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────────┘
       │              │             │              │               │
       │              │             │              │               │
  Calendar API   Call Events   CallRecord     Transcript      Transcript
  Subscription   Subscription  Subscription   processing      Subscription
  (push)         (push*)       (push)         (async delay)   (push)
       │              │             │              │               │
  ┌────┴────┐   ┌─────┴────┐  ┌────┴────┐   ┌────┴────┐   ┌─────┴─────┐
  │ fires   │   │ fires    │  │ fires   │   │ no push │   │  fires    │
  │ create/ │   │ per-mtg  │  │ tenant  │   │ 5-30min │   │  tenant   │
  │ update/ │   │ callEvt  │  │ wide    │   │  delay  │   │  wide     │
  │ delete  │   │ start/   │  │ on end  │   │         │   │  created  │
  │         │   │ end/     │  │         │   │         │   │           │
  │         │   │ roster   │  │         │   │         │   │           │
  └─────────┘   └──────────┘  └─────────┘   └─────────┘   └───────────┘
```

*\* Per-meeting subscription requires knowing the `joinWebUrl` or `meetingId` in advance*

### 2.2 Detailed Stage Breakdown

| Stage | Graph API | Resource Path | Auth Model | Subscription? | Latency | Notes |
|---|---|---|---|---|---|---|
| **Scheduled** | Calendar API | `/users/{id}/events` | App-only: `Calendars.Read` | Yes (CRUD) | Real-time | Fires on create/update/delete of calendar event |
| **Started** | Online Meeting Call Events | `/communications/onlineMeetings({joinWebUrl})/meetingCallEvents` | App-only: `OnlineMeetings.Read.All` | Yes (per-meeting) | Real-time | Must know joinWebUrl to subscribe; no tenant-wide |
| **Ended** | Call Records API | `/communications/callRecords` | App-only: `CallRecords.Read.All` | Yes (tenant-wide) | 0-15 min after end | Fires for ALL calls/meetings in tenant |
| **Transcript Processing** | — | — | — | No | 5-30 min after end | Asynchronous; no API signal during processing |
| **Transcript Available** | Online Meetings API | `communications/onlineMeetings/getAllTranscripts` | App-only: `OnlineMeetingTranscript.Read.All` | Yes (tenant-wide) | 5-30 min after end | Push notification when transcript is created |
| **Transcript Content** | Online Meetings API | `/users/{id}/onlineMeetings/{mid}/transcripts/{tid}/content` | App-only: `OnlineMeetingTranscript.Read.All` + CsApplicationAccessPolicy | N/A (pull) | On-demand | VTT format; requires userId GUID |

### 2.3 Auth Model Summary

| Permission | Type | Purpose | CsApplicationAccessPolicy Required? |
|---|---|---|---|
| `Calendars.Read` | App-only | Calendar event subscriptions | No |
| `OnlineMeetings.Read.All` | App-only | Meeting lifecycle events, meeting details | Yes (for `/users/{id}/onlineMeetings/...`) |
| `OnlineMeetingTranscript.Read.All` | App-only | Transcript notifications + content | No for `getAllTranscripts` tenant-wide; Yes for `/users/{id}/...` path |
| `OnlineMeetingRecording.Read.All` | App-only | Recording notifications + content | Same as transcript |
| `CallRecords.Read.All` | App-only | Call end notifications | No |
| `User.Read.All` | App-only | Resolve email → userId GUID | No |

---

## 3. The Semantic Gap — Why TMF Misses Transcripts

### 3.1 The Three Independent Domains

The current TMF architecture subscribes to **one** API surface (Calendar) and expects it to cover **three** lifecycle stages. It doesn't.

```
  WHAT TMF SUBSCRIBES TO          WHAT TMF NEEDS

  ┌─────────────────────┐         ┌─────────────────────┐
  │  Calendar Events    │         │  Meeting Scheduled   │ ◄── Calendar API covers this
  │  (CRUD only)        │         ├─────────────────────┤
  │                     │    ✗    │  Meeting Held/Ended  │ ◄── Call Records API needed
  │  Does NOT fire for: │   ───►  ├─────────────────────┤
  │  - meeting start    │    ✗    │  Transcript Ready    │ ◄── getAllTranscripts sub needed
  │  - meeting end      │         └─────────────────────┘
  │  - transcript ready │
  └─────────────────────┘
```

### 3.2 Root Causes

| Gap | Why It Exists | Impact |
|---|---|---|
| **Calendar event ≠ meeting instance** | A calendar event is an Outlook scheduling artifact. The Teams meeting is a separate runtime entity. Holding a meeting does NOT modify the calendar event. | TMF has no signal that a meeting was actually held |
| **No meeting-end signal** | Calendar API doesn't fire when a call ends. The only push signal for "meeting ended" is `/communications/callRecords` (different API surface, different permission). | TMF cannot know when to look for transcripts |
| **Transcript availability is async** | After a meeting ends, Microsoft processes audio into text. This takes 5-30 minutes. No intermediate signal exists. | Even if TMF knew a meeting ended, the transcript isn't immediately available |
| **onlineMeetingId is not in calendar data** | The `CalendarEvent` response does NOT include `onlineMeetingId`. It only provides `joinWebUrl` and `onlineMeetingProvider`. Resolving to `onlineMeetingId` requires a second API call. | TMF must perform an extra enrichment step before it can even query for transcripts |
| **userId must be a GUID** | The `/users/{id}/onlineMeetings/...` path requires `{id}` to be a GUID, not a UPN or email. | TMF must resolve every organizer's email → GUID before accessing transcripts |

### 3.3 Current Architecture Data Flow (Broken Path)

```
  Outlook Calendar                TMF Pipeline               Graph Transcript API
  ──────────────                  ────────────               ───────────────────
       │                              │                              │
  [1] Meeting scheduled               │                              │
       │── webhook ──────────────►[2] Store in DynamoDB              │
       │   (created/updated)          │  status: notification_rcvd   │
       │                              │                              │
  [3] User holds meeting              │                              │
       │                         ✗ NO SIGNAL                         │
       │                              │                              │
  [4] Meeting ends                    │                              │
       │                         ✗ NO SIGNAL                         │
       │                              │                              │
  [5] Transcript processed            │                              │
       │                         ✗ NO SIGNAL ──────────────────► [6] Transcript exists
       │                              │                              │  (but nobody asked)
       │                              │                              │
       ▼                              ▼                              ▼
  Calendar event unchanged       Meeting stuck at "scheduled"   Transcript goes stale
```

### 3.4 What the Poller (Phase 1) Solves — and What It Doesn't

The existing `transcriptPoller.ts` (Phase 1, implemented) works around the gap by:

1. Scanning DynamoDB for meetings past their `endTime` with no transcript
2. Enriching them (fetching `onlineMeetingId` via Graph)
3. Polling Graph for transcripts

**Limitations of polling:**
- 5-minute poll interval means up to 5 min latency to detect transcripts
- Scales linearly with meeting count — every cycle re-checks all candidates
- Rate-limited to avoid Graph API throttling (100ms delay between calls)
- Cannot discover meetings that were never on a monitored calendar (ad hoc Teams calls)

---

## 4. Proposed Domain Model

### 4.1 Internal Entity Model

TMF should track meetings through a unified domain model that bridges the three Graph API surfaces.

```
  ┌─────────────────────────────────────────────────────────────┐
  │                     TMF DOMAIN MODEL                         │
  │                                                             │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │                   MeetingRecord                        │  │
  │  │                                                       │  │
  │  │  tmfId:            string (internal primary key)      │  │
  │  │  calendarEventId:  string | null (from Calendar API)  │  │
  │  │  onlineMeetingId:  string | null (from OnlineMtg API) │  │
  │  │  callRecordId:     string | null (from CallRec API)   │  │
  │  │  joinWebUrl:       string       (cross-entity bridge) │  │
  │  │  organizerUserId:  string       (GUID, resolved)      │  │
  │  │  organizerEmail:   string                             │  │
  │  │  subject:          string                             │  │
  │  │  scheduledStart:   DateTime                           │  │
  │  │  scheduledEnd:     DateTime                           │  │
  │  │  actualStart:      DateTime | null (from callRecord)  │  │
  │  │  actualEnd:        DateTime | null (from callRecord)  │  │
  │  │  lifecycleState:   MeetingLifecycle (state machine)   │  │
  │  │  source:           'calendar' | 'callRecord' | 'both' │  │
  │  └───────────────────────────────────────────────────────┘  │
  │                           │                                  │
  │                    1:N    │                                  │
  │                           ▼                                  │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │                 TranscriptRecord                       │  │
  │  │                                                       │  │
  │  │  tmfTranscriptId:    string (internal)                │  │
  │  │  graphTranscriptId:  string (from Graph)              │  │
  │  │  meetingTmfId:       string (FK to MeetingRecord)     │  │
  │  │  status:             TranscriptStatus                 │  │
  │  │  rawS3Path:          string | null                    │  │
  │  │  sanitizedS3Path:    string | null                    │  │
  │  │  language:           string                           │  │
  │  │  fetchedAt:          DateTime                         │  │
  │  └───────────────────────────────────────────────────────┘  │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
```

### 4.2 Meeting Lifecycle State Machine

```
                         Calendar webhook
                         (created)
                              │
                              ▼
                      ┌───────────────┐
                      │   SCHEDULED   │
                      │               │
                      │ Has: eventId, │
                      │ joinWebUrl    │
                      └───────┬───────┘
                              │
                 ┌────────────┼────────────┐
                 │            │            │
          Calendar update  callRecord   getAllTranscripts
          (enrichment)     subscription  subscription
                 │            │            │
                 ▼            ▼            │
          ┌─────────┐  ┌───────────┐      │
          │ENRICHED │  │  HELD     │      │
          │         │  │           │      │
          │Has: +   │  │Has: +     │      │
          │onlineMtg│  │callRecId, │      │
          │Id,      │  │actualStart│      │
          │orgUserId│  │actualEnd  │      │
          └────┬────┘  └─────┬─────┘      │
               │             │            │
               └──────┬──────┘            │
                      │                   │
                      ▼                   │
               ┌─────────────┐            │
               │ ENDED       │            │
               │             │◄───────────┘ (if transcript arrives
               │ Has: all    │               before callRecord,
               │ IDs resolved│               skip straight here)
               └──────┬──────┘
                      │
          ┌───────────┼──────────────┐
          │           │              │
     Transcript   No transcript   Polling
     push notif   after 24hrs     finds it
          │           │              │
          ▼           ▼              ▼
  ┌──────────────┐ ┌──────────┐ ┌──────────────┐
  │ TRANSCRIPT   │ │  NO      │ │ TRANSCRIPT   │
  │ AVAILABLE    │ │ XSCRIPT  │ │ AVAILABLE    │
  └──────┬───────┘ └──────────┘ └──────┬───────┘
         │                             │
         ▼                             ▼
  ┌──────────────┐              ┌──────────────┐
  │ TRANSCRIPT   │              │ TRANSCRIPT   │
  │ FETCHED      │              │ FETCHED      │
  └──────┬───────┘              └──────┬───────┘
         │                             │
         ▼                             ▼
  ┌──────────────┐              ┌──────────────┐
  │ COMPLETED    │              │ COMPLETED    │
  │ (sanitized)  │              │ (sanitized)  │
  └──────────────┘              └──────────────┘
```

### 4.3 Graph API to Domain Model Mapping

| Domain Field | Source API | Graph Property | Resolution Method |
|---|---|---|---|
| `calendarEventId` | Calendar API | `event.id` | Direct from webhook notification `resource` path |
| `onlineMeetingId` | Online Meetings API | `onlineMeeting.id` | Filter by `JoinWebUrl` on `/users/{userId}/onlineMeetings` |
| `callRecordId` | Call Records API | `callRecord.id` | From `/communications/callRecords` subscription notification |
| `joinWebUrl` | Calendar API | `event.onlineMeeting.joinUrl` | Direct from `fetchDetails()` enrichment |
| `organizerUserId` | Users API | `user.id` | Resolve via `GET /users/{email}` — must be GUID |
| `actualStart` | Call Records API | `callRecord.startDateTime` | From callRecord GET after subscription fires |
| `actualEnd` | Call Records API | `callRecord.endDateTime` | From callRecord GET after subscription fires |
| `graphTranscriptId` | Online Meetings API | `transcript.id` | From `getAllTranscripts` subscription or polling |

### 4.4 Push + Pull Strategy Per Stage

| Stage | Primary (Push) | Fallback (Pull) | Interval |
|---|---|---|---|
| **Scheduled** | Calendar webhook (existing) | — | Real-time |
| **Enrichment** | — | Poller enriches on first cycle | 5 min after creation |
| **Meeting Ended** | `callRecords` subscription (new) | Infer from `endTime < now` | Real-time / 5 min fallback |
| **Transcript Available** | `getAllTranscripts` subscription (new) | Poll `/transcripts` endpoint | Real-time / 10 min fallback |
| **Transcript Content** | — | Fetch on demand when notified | Immediate on notification |

---

## 5. Alternative Subscription Types Evaluation

### 5.1 `/communications/callRecords` (RECOMMENDED)

| Attribute | Detail |
|---|---|
| **Resource** | `/communications/callRecords` |
| **Change Types** | `created` (fires when call/meeting ends) |
| **Permission** | `CallRecords.Read.All` (application) |
| **Scope** | Tenant-wide — ALL calls and meetings |
| **Max Subscription Lifetime** | ~3 days (must renew) |
| **CsApplicationAccessPolicy** | Not required |
| **Data in Notification** | callRecord `id` only; must GET `/communications/callRecords/{id}` for details |
| **GET Response Includes** | `startDateTime`, `endDateTime`, `organizer`, `participants_v2`, `joinWebUrl`, `type`, `modalities` |
| **Latency** | 0-15 minutes after call ends |

**Verdict: HIGH VALUE.** This is the missing "meeting ended" signal. When a callRecord is created, TMF knows a meeting was actually held and can:
1. Correlate to a `MeetingRecord` via `joinWebUrl`
2. Update `actualStart`/`actualEnd`
3. Transition lifecycle to `HELD` → begin transcript polling
4. Discover meetings that were never on a calendar (ad hoc calls)

### 5.2 `communications/onlineMeetings/getAllTranscripts` (RECOMMENDED)

| Attribute | Detail |
|---|---|
| **Resource** | `communications/onlineMeetings/getAllTranscripts` |
| **Change Types** | `created` |
| **Permission** | `OnlineMeetingTranscript.Read.All` (application) |
| **Scope** | Tenant-wide — all meetings |
| **Max Subscription Lifetime** | 1 hour (if no `lifecycleNotificationUrl`); up to 3 days with it |
| **CsApplicationAccessPolicy** | NOT required (tenant-wide path) |
| **Data in Notification** | Encrypted resource data with `meetingId`, `transcriptId`, `meetingOrganizerId` |
| **Latency** | Fires when transcript is available (5-30 min after meeting end) |

**Verdict: HIGH VALUE.** This is the missing "transcript ready" signal. Eliminates the need for blind polling. Must include `lifecycleNotificationUrl` for longer subscription lifetimes. Requires `includeResourceData: true` with encryption certificate for rich notifications.

### 5.3 `communications/onlineMeetings/getAllRecordings`

| Attribute | Detail |
|---|---|
| **Resource** | `communications/onlineMeetings/getAllRecordings` |
| **Permission** | `OnlineMeetingRecording.Read.All` |
| **Scope** | Tenant-wide |
| **CsApplicationAccessPolicy** | Not required |

**Verdict: OPTIONAL.** Same pattern as transcripts. Add when recording capture is needed. Not required for MVP.

### 5.4 `/communications/onlineMeetings({joinWebUrl})/meetingCallEvents`

| Attribute | Detail |
|---|---|
| **Resource** | `/communications/onlineMeetings('{joinWebUrl}')/meetingCallEvents` |
| **Change Types** | `created` (call events: started, ended, roster updates) |
| **Permission** | `OnlineMeetings.Read.All` |
| **Scope** | Per-meeting only — must subscribe per meeting with known joinWebUrl |
| **Max Subscription Lifetime** | ~3 days |

**Verdict: NOT RECOMMENDED for TMF.** Requires per-meeting subscription management. Doesn't scale when monitoring hundreds/thousands of meetings. Only useful for real-time meeting awareness (e.g., a bot reacting during a live meeting).

### 5.5 Delta Queries on Calendar Events

| Attribute | Detail |
|---|---|
| **API** | `GET /users/{id}/calendarView/delta` |
| **Use Case** | Detect new/changed calendar events since last sync |
| **Limitations** | Same as calendar subscriptions — only CRUD, no lifecycle |

**Verdict: SUPPLEMENTARY.** Useful for catching up after missed webhooks or restarting after downtime. Does NOT solve the transcript gap. Can complement calendar subscriptions for reliability.

### 5.6 Comparison Matrix

| Subscription Type | Scope | Signal | Solves TMF Gap? | Complexity | Recommendation |
|---|---|---|---|---|---|
| Calendar events | Per-user/group | Scheduled/Updated/Deleted | Already implemented | Low | Keep (existing) |
| `callRecords` | Tenant-wide | Meeting ended | **Yes — "held" signal** | Low | **Add (Phase 2)** |
| `getAllTranscripts` | Tenant-wide | Transcript ready | **Yes — "ready" signal** | Medium (encryption) | **Add (Phase 2)** |
| `getAllRecordings` | Tenant-wide | Recording ready | Future need | Medium | Defer |
| `meetingCallEvents` | Per-meeting | Start/end/roster | No — doesn't scale | High | Skip |
| Calendar delta query | Per-user | Event CRUD delta | No — same as sub | Low | Optional backup |

---

## 6. Recommended Architecture

### 6.1 Target Event Pipeline

```
                           ┌──────────────────────────────────────────────┐
                           │           GRAPH API SUBSCRIPTIONS             │
                           │                                              │
                           │  [1] Calendar Events      (existing)         │
                           │      /groups/{gid}/calendar/events           │
                           │      → Event Hub → Lambda → DynamoDB         │
                           │                                              │
                           │  [2] Call Records          (NEW)             │
                           │      /communications/callRecords             │
                           │      → Webhook endpoint on Admin App         │
                           │                                              │
                           │  [3] Transcript Ready      (NEW)             │
                           │      communications/onlineMeetings/          │
                           │      getAllTranscripts                        │
                           │      → Webhook endpoint on Admin App         │
                           └──────┬──────────────┬──────────────┬─────────┘
                                  │              │              │
                                  ▼              ▼              ▼
                           ┌──────────────────────────────────────────────┐
                           │           TMF EVENT ROUTER                    │
                           │                                              │
                           │  Receives notifications from all three       │
                           │  subscription types and routes to handlers   │
                           └──────┬──────────────┬──────────────┬─────────┘
                                  │              │              │
                    ┌─────────────┘              │              └─────────────┐
                    ▼                            ▼                            ▼
          ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
          │ Calendar Handler│         │ CallRecord      │         │ Transcript      │
          │                 │         │ Handler          │         │ Handler          │
          │ - Create/update │         │ - Match to mtg  │         │ - Match to mtg  │
          │   MeetingRecord │         │   via joinWebUrl│         │   via onlineMtg │
          │ - Trigger async │         │ - Set actualEnd │         │ - Fetch VTT     │
          │   enrichment    │         │ - Transition to │         │ - Store to S3   │
          │                 │         │   HELD state    │         │ - Sanitize      │
          └────────┬────────┘         └────────┬────────┘         └────────┬────────┘
                   │                           │                           │
                   └───────────────┬───────────┘───────────────────────────┘
                                   │
                                   ▼
                           ┌──────────────────────────────────────────────┐
                           │           MEETING STORE (DynamoDB)            │
                           │                                              │
                           │  Unified MeetingRecord with all IDs          │
                           │  State machine tracks lifecycle              │
                           │  TranscriptRecord linked by tmfId            │
                           └──────────────────────────────────────────────┘
                                   │
                                   ▼
                           ┌──────────────────────────────────────────────┐
                           │         TRANSCRIPT POLLER (FALLBACK)          │
                           │                                              │
                           │  Every 10 min, checks meetings in HELD       │
                           │  state older than 5 min with no transcript.  │
                           │  Safety net for missed webhook notifications. │
                           └──────────────────────────────────────────────┘
```

### 6.2 Subscription Configuration

| # | Resource | changeType | Delivery | Expiry | Renewal |
|---|---|---|---|---|---|
| 1 | `/groups/{gid}/calendar/events` | created,updated,deleted | Azure Event Hub | 3 days | Auto-renew every 2 days |
| 2 | `/communications/callRecords` | created | Webhook (Admin App HTTPS endpoint) | 3 days | Auto-renew every 2 days |
| 3 | `communications/onlineMeetings/getAllTranscripts` | created | Webhook (Admin App HTTPS endpoint) | 3 days | Auto-renew every 2 days |

**Subscription 3 Requirements:**
- `includeResourceData: true`
- `encryptionCertificate`: Base64-encoded X.509 cert public key
- `encryptionCertificateId`: Cert identifier string
- `lifecycleNotificationUrl`: Separate endpoint for lifecycle events (reauthorization, missed)

### 6.3 New Permissions Required

| Permission | Status | Action |
|---|---|---|
| `Calendars.Read` | Granted | No change |
| `User.Read.All` | Granted | No change |
| `OnlineMeetings.Read.All` | Granted | No change |
| `OnlineMeetingTranscript.Read.All` | Granted | No change |
| `CallRecords.Read.All` | **IaC updated** | Grant admin consent via `scripts/grant-graph-permissions.ps1` |
| CsApplicationAccessPolicy | **Configured** | No change (needed for `/users/{id}/...` paths) |

### 6.4 Polling Strategy (Fallback)

The poller remains as a safety net. With push notifications, its role changes:

| Phase | Current (Poll-Only) | Target (Push + Poll Fallback) |
|---|---|---|
| **Enrichment** | Every 5 min, all unenriched | On calendar webhook, enrich immediately; poller catches stragglers |
| **Meeting Ended Detection** | Infer from `endTime < now` | `callRecords` subscription (real-time); poller as 10-min fallback |
| **Transcript Check** | Poll ALL candidates every 5 min | `getAllTranscripts` subscription (real-time); poller checks only HELD meetings older than 30 min |

**Recommended poll intervals:**

| Resource | Current Interval | Recommended Interval | Reason |
|---|---|---|---|
| Enrichment batch | 5 min | 10 min | Push handles new meetings; poller catches retries |
| Transcript check | 5 min | 15 min | `getAllTranscripts` sub handles happy path; poller is safety net |
| Catch-up (full scan) | On startup | On startup + daily | Recover from missed notifications |

### 6.5 Internal State Machine Transitions

```
Trigger                          Current State → New State        Action
─────────────────────────────    ────────────────────────        ──────────────
Calendar webhook (created)       — → SCHEDULED                  Create MeetingRecord, queue enrichment
Calendar webhook (updated)       SCHEDULED → SCHEDULED          Update fields, re-enrich if needed
Calendar webhook (deleted)       Any → CANCELLED                Mark cancelled
Enrichment complete              SCHEDULED → ENRICHED           Set onlineMeetingId, organizerUserId
CallRecord subscription          SCHEDULED/ENRICHED → HELD      Set callRecordId, actualStart/End
getAllTranscripts notification   ENRICHED/HELD → TRANSCRIPT_AVAIL  Queue transcript fetch
Transcript fetch success         TRANSCRIPT_AVAIL → FETCHED     Store VTT to S3
Sanitization complete            FETCHED → COMPLETED            Store sanitized, mark done
No transcript after 48hrs        HELD → NO_TRANSCRIPT           Close lifecycle
Fetch/enrichment failure         Any → same (retry)             Log error, retry next cycle
Permanent failure (404)          Any → FAILED                   Mark permanent, skip future cycles
```

### 6.6 Implementation Phases

#### Phase 1: Poller (Implemented)
- Transcript poller runs every 5 minutes
- Enriches meetings, checks for transcripts via polling
- **Status: Running in production**

#### Phase 2: Call Records + Transcript + Recording Subscriptions (Implemented)
- Added `/communications/callRecords` subscription creation
- Added `communications/onlineMeetings/getAllTranscripts` subscription creation
- Added `communications/onlineMeetings/getAllRecordings` subscription creation
- Lambda notification routing: `classifyNotification()` routes callRecords, transcript, and recording notifications to dedicated handlers
- Dedup via `onlineMeetingId` at enrichment time
- Poller Phase 1.5: fast-tracks meetings with push transcript notifications
- `CallRecords.Read.All` added to IaC + grant scripts
- **Status: Code complete, pending deployment + admin consent**

#### Phase 3: Full Event-Driven Pipeline (Next)
- Grant `CallRecords.Read.All` admin consent
- Create all 3 new subscriptions via admin UI
- Add DynamoDB GSI on `onlineMeetingId` for O(1) dedup lookups
- E2E testing with live meetings
- Poller reduced to safety net role
- Dashboard shows real-time lifecycle progress

---

## Appendix: API Reference Quick-Look

### A.1 Create callRecords Subscription

```http
POST https://graph.microsoft.com/v1.0/subscriptions
Content-Type: application/json

{
  "changeType": "created",
  "notificationUrl": "https://{admin-app-host}/api/webhooks/callrecords",
  "resource": "/communications/callRecords",
  "expirationDateTime": "2026-03-03T00:00:00Z",
  "clientState": "{secret-state-value}"
}
```

### A.2 Create getAllTranscripts Subscription

```http
POST https://graph.microsoft.com/v1.0/subscriptions
Content-Type: application/json

{
  "changeType": "created",
  "notificationUrl": "https://{admin-app-host}/api/webhooks/transcripts",
  "resource": "communications/onlineMeetings/getAllTranscripts",
  "includeResourceData": true,
  "encryptionCertificate": "{base64-encoded-cert}",
  "encryptionCertificateId": "{cert-id}",
  "lifecycleNotificationUrl": "https://{admin-app-host}/api/webhooks/lifecycle",
  "expirationDateTime": "2026-03-03T00:00:00Z",
  "clientState": "{secret-state-value}"
}
```

### A.3 Get CallRecord Details

```http
GET https://graph.microsoft.com/v1.0/communications/callRecords/{id}
```

Response includes: `startDateTime`, `endDateTime`, `type`, `organizer`, `participants_v2`, `joinWebUrl`, `modalities`.

### A.4 Fetch Transcript Content

```http
GET https://graph.microsoft.com/v1.0/users/{userId}/onlineMeetings/{onlineMeetingId}/transcripts/{transcriptId}/content?$format=text/vtt
```

Requires: `OnlineMeetingTranscript.Read.All` + CsApplicationAccessPolicy for the user.

### A.5 Key URL References

- [Call Records API Overview](https://learn.microsoft.com/en-us/graph/api/resources/callrecords-api-overview)
- [Change Notifications for Transcripts/Recordings](https://learn.microsoft.com/en-us/graph/teams-changenotifications-callrecording-and-calltranscript)
- [Meeting Call Event Notifications](https://learn.microsoft.com/en-us/graph/changenotifications-for-onlinemeeting)
- [Online Meeting Resource Type](https://learn.microsoft.com/en-us/graph/api/resources/onlinemeeting)
- [Subscription Resource Type](https://learn.microsoft.com/en-us/graph/api/resources/subscription)
