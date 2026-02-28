# Decision: onlineMeetingId Resolution Requires userId GUID

**By:** McManus (Backend Dev)
**Date:** 2026-03-05

## Context

The transcript pipeline was stuck at 0 transcripts. Phase 1 enrichment via `fetchDetails()` successfully fetched calendar event data (which includes `joinWebUrl`) but the Calendar API does NOT return `onlineMeetingId`. The fallback resolution code was calling `/users/{organizerEmail}/onlineMeetings?$filter=JoinWebUrl eq '...'` which silently fails because the onlineMeetings endpoint with app-only auth (CsApplicationAccessPolicy) requires a userId GUID, not an email/UPN.

## Decision

Always resolve the organizer's userId GUID via `GET /users/{email}` (returns `id` field) before calling the onlineMeetings endpoint. This is a hard requirement of CsApplicationAccessPolicy with client_credentials (app-only) auth flow.

## Implementation

- Modified `meetingService.fetchDetails()` to:
  1. Resolve organizer email → userId GUID via `/users/{email}?$select=id`
  2. Use GUID in `/users/{userId}/onlineMeetings?$filter=JoinWebUrl eq '...'`
  3. Escape single quotes in joinWebUrl for OData filter safety
- Pattern already existed in `discoverTranscriptsForUser()` — now consistent across both code paths.

## Impact

- Unblocks the entire transcript pipeline (Phase 2 candidates depend on `onlineMeetingId` being populated)
- Adds one extra Graph API call per enrichment (user lookup), but this is cached by the Graph SDK and is a lightweight call
- No changes to the Meeting model or DynamoDB schema
