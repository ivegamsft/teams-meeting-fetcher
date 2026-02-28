# Decision: Admin App Deployed with Retry Storm Fix

**Date:** 2026-02-28T07:10Z
**Author:** Fenster
**Status:** Implemented

## Summary

Deployed admin app revision 55 (image tag `1db55df`) with McManus's retry storm fix and sales blitz reduction. The 81 stale Exchange event IDs that were causing ~81 wasted Graph API calls per 5-minute poll cycle are now marked as `permanent_failure` in DynamoDB and skipped on subsequent cycles. API call volume for Phase 1 enrichment dropped from 81 to 0.

## Details

- **Commit:** `1db55df` — enrichmentStatus field, markEnrichmentFailed(), permanent failure marking in transcriptPoller
- **ECS:** Task definition revision 55, cluster `tmf-admin-app-8akfpg`
- **Public IP:** `3.88.0.51`
- **Lambda webhook URL:** Updated to `https://3.88.0.51:3000/api/webhooks/graph`
- **Verification:** Health check 200 OK; CloudWatch logs confirm "Enriching 0 of 0 meetings (81 permanently failed, skipped)"

## Note

Entra redirect URI was NOT updated — may need manual update if OAuth login is required at the new IP. The service was found scaled to 0 (desired count = 0) from a prior state; scaled back to 1 during this deploy.
