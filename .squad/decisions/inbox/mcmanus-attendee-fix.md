# Decision: Attendee Empty-Array Root Cause and Fix

**Date:** 2026-03-07  
**Author:** McManus  
**Status:** Implemented (not yet deployed)

## Context

Admin app showed "X Attendees loaded" for SchoolofFineArt meetings organized by TMF Boldoriole. DynamoDB records had `attendees: []`.

## Root Cause

Sales blitz scripts created Graph calendar events without `attendees` in the payload. The lead contact info was embedded in the event title and body HTML but never added as a Graph attendee. So `GET /users/{id}/events/{eventId}` correctly returned `attendees: []`. The backend enrichment code (`fetchDetails()`) was working correctly — it faithfully stored what Graph returned.

## Changes

1. **Debug logging** (`meetingService.ts`): `fetchDetails()` now logs the attendee count from Graph responses. Zero-attendee events get a warning with the subject line, making this immediately diagnosable in logs.

2. **Sales blitz scripts** (`sales-blitz-full-retest.py`, `sales-blitz-scale-test.py`): Added the lead as a `required` attendee in the Graph event creation payload.

3. **Stale-data overwrite fix** (`meetingStore.ts`, `meetingService.ts`): `discoverTranscriptsForUser()` Phase 3 was doing full `PutItem` with stale in-memory meeting objects from `listAll()`, risking overwrite of enriched fields (attendees, rawEventData, etc.). Replaced with targeted `UpdateCommand` via new `meetingStore.updateOnlineMeetingId()` method.

## Impact

- Existing meetings with `attendees: []` will NOT be retroactively fixed (Graph events were created without attendees — the data doesn't exist upstream).
- Future test meetings created by the scripts will have attendees.
- The stale-data fix protects against a latent race condition that could have affected real meetings too.

## Team Notes

- The `meetingStore.put()` pattern (full PutItem) should be used with caution — prefer targeted `UpdateCommand` methods when only modifying specific fields on existing records.
- Any new test scripts that create Graph events should always include attendees for realistic test data.
