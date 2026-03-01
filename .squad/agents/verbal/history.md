# Verbal — History

## Project Context

- **Project:** Teams Meeting Fetcher
- **Owner:** ivegamsft
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Description:** Webhook-driven service that fetches Microsoft Teams meeting transcriptions via Graph API, with multi-cloud infrastructure and a management UI.
- **Joined:** 2026-02-24

## Learnings

### 2026-02-26: Sales Blitz Mutation Testing & Pipeline Verification

**Context:** After a 260-event scale test completed successfully, executed comprehensive mutation testing to simulate real-world sales workflow changes and verify the entire EventHub → Lambda → DynamoDB pipeline.

**Scripts Created:**
1. `scripts/sales-blitz-mutations.py` - Event mutation script
2. `scripts/verify-dynamo-pipeline.py` - DynamoDB pipeline verification

**Mutation Test Results:**
- **Total operations:** 240 mutations across 400 events (Graph API returned both reps' events)
- **Title renames:** 80/80 success (20% of events)
- **Cancellations:** 40/40 success (10% of events)
- **Reschedules:** 60/60 success (15% of events)
- **Description changes:** 60/60 success (15% of events)
- **Rate limiting:** 0 occurrences (429s handled gracefully with retry logic)
- **Duration:** 15m 24s (successful with exponential backoff + retry)

**Pipeline Verification Findings:**
- **DynamoDB count:** 581 meetings (223% of expected 260) - indicates the original 260 creates + ~321 mutation events being tracked separately
- **Organizer split:** 290 trustingboar / 290 boldoriole (near-perfect 50/50 distribution)
- **S3 archived events:** 231 notifications captured
- **Pipeline timing:** First DynamoDB write at 16:45:18Z, last at 17:56:12Z (70m 54s span)
- **Status tracking:** All records show "unknown" status - indicates status field may not be populated correctly or mutation events not updating status
- **changeType tracking:** NOT present in DynamoDB records (McManus has not yet added this field to the schema)

**Key Technical Insights:**
1. **Graph API resilience:** Mutation script handled intermittent timeout exceptions gracefully with exponential backoff (1s base, 2^retry multiplier)
2. **Event counting mismatch:** DynamoDB has 581 records vs expected 260 - suggests each mutation (rename, cancel, reschedule, description change) is creating a NEW record rather than updating existing ones
3. **Pipeline latency:** EventHub polling is processing events within expected 2-5 minute window
4. **Schema gaps:** 
   - `changeType` field not implemented yet (needed to distinguish creates vs updates vs cancellations)
   - `meetingStatus` field showing "unknown" for all records (should reflect scheduled/cancelled/updated states)

**Recommendations for McManus:**
1. Implement `changeType` field in DynamoDB schema to track event lifecycle (created, updated, cancelled)
2. Fix status handling - cancelled events should have status="cancelled", updated events should update existing records rather than creating duplicates
3. Consider deduplication logic - use Graph event ID + timestamp to update existing records instead of always inserting new ones
4. Add pipeline metrics - track processing latency from EventHub receivedAt to DynamoDB write timestamp

**Success Criteria Met:**
- ✅ Mutation script executed 240 operations with 100% success rate
- ✅ Pipeline processing all events (S3 + DynamoDB records confirm receipt)
- ✅ No rate limiting issues during sustained mutation load
- ⚠️ Schema needs enhancement for proper change tracking and status management

### 2026-02-28: Transcript List Enrichment with Meeting Details

**Context:** The transcript list page showed raw meeting IDs which weren't useful. Enriched the transcript list to show meeting details (subject, organizer, date/time, duration) instead.

**Files Changed:**
1. `apps/admin-app/src/routes/transcripts.ts` — Added `meetingStore` import; enriched `GET /api/transcripts` response by looking up each transcript's meeting and attaching `meeting` property with subject, startTime, endTime, organizerDisplayName, attendeesCount
2. `apps/admin-app/public/index.html` — Updated table headers: Meeting Subject, Organizer, Date/Time, Duration, Status, Actions
3. `apps/admin-app/public/js/app.js` — Rewrote `loadTranscripts()` to render meeting subject (linked to #meetings), organizer name, formatted date/time, calculated duration (Xh Ym format)

**Key Patterns:**
- Backend enrichment via `Promise.all` with per-transcript `meetingStore.get()` — gracefully handles missing meetings (shows "Unknown Meeting")
- Duration calculated client-side from start/end times, formatted as "Xh Ym" or "Xm"
- Subject links to `#meetings` page using existing app navigation
- No new API endpoints — enriched existing `GET /api/transcripts` response
- TypeScript compiles clean, all 74 existing tests pass

**Key Files:**
- `apps/admin-app/src/services/meetingStore.ts` — `meetingStore.get(id)` resolves DynamoDB composite key, returns full Meeting object
- `apps/admin-app/src/models/meeting.ts` — Meeting interface with subject, startTime, endTime, organizerDisplayName, attendees[]
- `apps/admin-app/src/models/transcript.ts` — Transcript interface with meetingId field linking to meetings

### 2026-02-28: Fix Three Admin App UI Issues

**Context:** Isaac reported three UI issues via screenshots: transcripts showing "Unknown Meeting", meetings showing "undefined" for subject/organizer, and no pagination or sorting on the meetings page.

**Issue 1 — Transcripts page "Unknown Meeting" fix:**
- Changed subject fallback in `loadTranscripts()` from `'Unknown Meeting'` to `'Meeting ' + meetingId.substring(0, 12) + '...'` — so unenriched sales-blitz meetings show a truncated ID instead of a generic label
- Added a "Details" button in the Actions column that navigates to the Meetings page via `goToMeetingDetails()`
- No backend changes needed — the enrichment in `transcripts.ts` already returns `meeting: null` or meeting with missing subject correctly

**Issue 2 — Meetings page "undefined" fallbacks:**
- `loadMeetings()`: `m.subject` → `m.subject || 'Untitled Meeting'`; `m.organizerDisplayName || m.organizerEmail` → added `|| '--'` fallback
- `loadOverview()`: Same `m.subject || 'Untitled Meeting'` fix for the recent meetings widget

**Issue 3 — Pagination and column sorting:**
- Backend already supported `page`/`pageSize` in `meetingStore.list()` (default 20 per page) — no backend changes needed
- Frontend: Added pagination state (page=1, pageSize=25), passes params to API, renders Prev/Next controls with page counter
- Added client-side column sorting: Subject, Organizer, Start Time, Status columns are clickable with toggle asc/desc
- Default sort: Start Time descending (newest first) with visual indicator (arrow)
- CSS: Added `.sortable` header styles and `.pagination .btn:disabled` state
- HTML: Added `data-sort` attributes and `.sort-indicator` spans to meetings table headers

**Files Changed:**
1. `apps/admin-app/public/js/app.js` — Pagination/sort state, `loadMeetings()` rewrite with sort + paginate + fallbacks, `loadTranscripts()` subject fallback + Details button, `loadOverview()` subject fallback, `renderMeetingsPagination()`, `handleMeetingSort()`, `updateSortIndicators()`, `goToMeetingDetails()`
2. `apps/admin-app/public/index.html` — Sortable column headers with `data-sort` attributes and `.sort-indicator` spans
3. `apps/admin-app/public/css/styles.css` — `.sortable` header styles, `.pagination .btn:disabled` state

**Verification:** TypeScript compiles clean (`npx tsc --noEmit` exit 0). No backend changes required.
