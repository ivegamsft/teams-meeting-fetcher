# Decision: Fix Dead Webhook Subscriptions (Critical Pipeline Blocker)

**Date:** 2026-02-28
**By:** Fenster (DevOps/Infra)
**Triggered by:** End-to-end pipeline trace of real Teams meeting "Sales Call: BlueLynx - Matthew Lopez"

## Context

Isaac created a real Teams meeting with a transcript and recording (organizer: boldoriole@ibuyspy.net). The meeting never appeared in DynamoDB and was never processed by the pipeline.

## Findings

1. **All Graph webhook subscriptions are expired** — querying `GET /subscriptions` returns `[]`.
2. **Subscription renewal Lambda is broken** — `tmf-subscription-renewal-dev` crashes on every invocation with `Runtime.ImportModuleError: No module named 'requests'`. The Python `requests` library is not bundled in the Lambda deployment package.
3. **Without webhooks, no new meetings enter DynamoDB** — the poller only processes meetings already in the database.
4. **Good news:** The OnlineMeetings API works for the TMF SPN (CsApplicationAccessPolicy is configured). The retry storm fix is working. The pipeline from DynamoDB onward is healthy.

## Decision

Two critical fixes needed (in priority order):

1. **Fix the subscription renewal Lambda deployment** — bundle `requests` in the Lambda package (either via a Lambda layer, or include it in the deployment zip). This is a packaging/build issue, not a code issue.
2. **Re-create webhook subscriptions** — after fixing the Lambda, create new Graph subscriptions for boldoriole and trustingboar calendar events. This can be done via the admin app's subscription management endpoint or manually via Graph API.

## Impact

Until these are fixed, the entire pipeline is deaf to new meetings. No calendar events, no webhook notifications, no DynamoDB entries, no transcript discovery. The poller runs correctly but has nothing new to process.
