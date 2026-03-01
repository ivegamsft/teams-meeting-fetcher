# Sales Blitz Scale Test Plan

## Overview

This plan documents a realistic sales scenario that doubles as an end-to-end (E2E) pipeline stress test for the Teams Meeting Fetcher system.

**Sales Scenario:** Two sales representatives fill their calendars with prospect calls across a full business week, creating a high-volume meeting ingestion scenario.

**Pipeline Stress Test:** Approximately 320 Graph API event creations flow through the entire pipeline—from calendar events to EventHub notifications to Lambda processing to S3 archival and DynamoDB storage—validating the system's scalability under realistic load.

---

## Test Parameters

| Parameter | Value |
|-----------|-------|
| **Sales Reps** | user3@<YOUR_TENANT_DOMAIN>, user2@<YOUR_TENANT_DOMAIN> |
| **Test Week** | Monday, Mar 2 – Friday, Mar 6, 2026 |
| **Business Hours** | 9:00 AM – 5:00 PM Eastern (EST, UTC-5) |
| **Call Duration** | 15 minutes |
| **Calls per Rep per Day** | 32 (4-hour window = 240 minutes ÷ 15 min = 16 calls morning + 16 afternoon) |
| **Total Calls per Rep** | 160 (32 calls × 5 days) |
| **Total Calendar Events** | ~320 (160 calls × 2 reps) |

---

## Event Format

Each calendar event follows this structure:

**Title:**
```
Sales Call: {Company Name} - {Contact First Last}
```

**Body (Description):**
```
Customer Details:
- Contact: {First} {Last}
- Company: {Company Name}
- Email: {customer@example.com}
- Phone: {(XXX) XXX-XXXX}
- Lead Source: {e.g., LinkedIn, Referral, Inbound}
- Notes: {Additional context, e.g., budget, timeline}

Agenda:
1. Introduction & qualification
2. Problem discovery
3. Solution fit assessment
4. Next steps
```

**Meeting Properties:**
- **Is Online Meeting:** true (Teams meeting link included)
- **Organizer:** Sales rep (user3@<YOUR_TENANT_DOMAIN> or user2@<YOUR_TENANT_DOMAIN>)
- **Attendees:** Sales rep + customer email (mock account; actual attendance not required)

---

## Execution Script

**Script Location:** `scripts/sales-blitz-scale-test.py`

**Authentication:**
- Uses Azure AD client credentials flow (service principal)
- Authenticates to Microsoft Graph API
- No interactive user sign-in required

**Rate Limiting Strategy:**
- Respects Graph API HTTP 429 (Too Many Requests) responses
- Reads and honors the `Retry-After` header in responses
- Implements exponential backoff starting at 1 second
- Maximum retries per request: 5
- Pacing: 100 ms delay between requests to avoid burst throttling

**Progress Tracking:**
- Logs created, failed, and retried event counts per representative
- Includes timestamps for start, completion, and any rate-limit waits
- Generates summary report with success/failure statistics

---

## Pipeline Verification Checklist

After the script completes, verify the full pipeline by checking:

- [ ] **EventHub Notifications**
  - Graph change notifications arrive in the EventHub (Azure portal → Event Hubs → tmf-notifications → check message count)

- [ ] **Lambda Processing**
  - EventHub Lambda function executes successfully
  - CloudWatch logs show event processing without errors (`/aws/lambda/tmf-eventhub-processor-*`)

- [ ] **S3 Archival**
  - Raw event JSON files archived in S3
  - Path: `s3://tmf-webhooks-eus-dev/eventhub/`
  - Expect ~320 archived events

- [ ] **Webhook Forwarding**
  - Lambda logs show successful forwarding to admin app webhook endpoint
  - HTTP 200 responses logged (admin app received payload)

- [ ] **DynamoDB Storage**
  - DynamoDB `meetings` table contains new meeting records
  - Verify row count matches expected ~320 events
  - Sample records show correct contact and calendar details

- [ ] **Admin App UI**
  - Admin app meetings page displays new entries
  - Filter/search functionality works on new records
  - Timeline and calendar views render correctly

---

## Rate Limit Strategy

### Graph API Throttling

Microsoft Graph enforces per-app, per-tenant rate limits. During high-volume event creation, expect 429 responses:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30
```

### Backoff and Retry Logic

1. **Read `Retry-After` Header:** If present, wait that many seconds
2. **Exponential Backoff:** If absent, start at 1 second and double on each retry (1s, 2s, 4s, 8s, 16s)
3. **Max Retries:** 5 retries per request
4. **Request Pacing:** Insert 100 ms delay between requests to avoid bursts

### Batch Configuration

To minimize throttling:
- Create events sequentially (not parallel) to ensure pacing
- Monitor response times; if consistently slow, increase inter-request delay
- If sustained 429s occur, reduce concurrent requests (not applicable here—sequential only)

---

## Expected Results

Upon successful completion:

- **Calendar Events:** 320 new 15-minute calls across two reps' calendars
- **Graph Change Notifications:** 320+ change notification payloads delivered to EventHub
- **S3 Archived Events:** 320+ raw JSON event files in S3 bucket
- **DynamoDB Meeting Records:** 320+ meeting entries in the `meetings` table
- **Admin App Sync:** All new meetings visible in the admin app UI with proper filtering and search
- **Zero Data Loss:** All events created, notified, archived, and stored with no gaps

---

## Running the Test

```bash
# From repository root
python scripts/sales-blitz-scale-test.py

# Expected console output:
# Creating 160 events for user3@<YOUR_TENANT_DOMAIN>...
# Created: 160 | Failed: 0 | Retried: 12
# Creating 160 events for user2@<YOUR_TENANT_DOMAIN>...
# Created: 160 | Failed: 0 | Retried: 8
# Total: 320 created, 0 failed, 20 retried
# Completed in 15 minutes
```

---

## Troubleshooting

| Issue | Diagnosis | Resolution |
|-------|-----------|-----------|
| Script hangs on Graph API calls | Network connectivity or auth token expired | Check Azure AD client credentials; verify Graph API endpoint is reachable |
| High retry count (>50% of requests) | System under load or throttled | Increase `inter-request-delay`; consider running test during off-peak hours |
| EventHub notifications not arriving | Subscription or permission issue | Verify Graph subscription for `/me/events` is active in tenant |
| Lambda not processing events | Lambda role lacks permissions or webhook URL misconfigured | Check IAM role policies; verify `ADMIN_APP_WEBHOOK_URL` env var is set |
| DynamoDB records incomplete | Lambda not forwarding or admin app not storing | Check webhook endpoint logs; verify DynamoDB `meetings` table is writable |

---

## Success Criteria

✅ Test **passes** if:
1. Script completes with 320 events created, <5% retry rate
2. All 320+ EventHub notifications arrive within 5 minutes
3. All 320+ events archived in S3
4. All 320+ meeting records in DynamoDB
5. Admin app UI reflects all new meetings without errors

❌ Test **fails** if:
1. Script exits with unrecoverable errors before creating all events
2. More than 10 events missing from EventHub, S3, or DynamoDB
3. Lambda or admin app logs show unhandled exceptions
4. Admin app UI does not display new meetings or errors on load

