---
updated_at: 2026-02-27T02:26:00.000Z
focus_area: Transcription pipeline — resolving admin blockers
active_issues: []
---

# What We're Focused On

🔧 **Transcription pipeline — resolving admin blockers**

Meetings pipeline is fully operational (Graph → EventHub → Lambda → DynamoDB). Now enabling the transcript pipeline.

**3 Admin Blockers (require manual action):**

1. **CsApplicationAccessPolicy** — MISSING. Graph API returns 403 on OnlineMeetings endpoint. Must create via `New-CsApplicationAccessPolicy` and grant globally. 30 min propagation.
2. **Graph API permissions** — Missing `OnlineMeetings.Read.All`, `OnlineMeetingTranscript.Read.All`, `OnlineMeetingRecording.Read.All`. Add in Azure Portal, admin-consent.
3. **Teams meeting policies** — Verify `AllowTranscription=True`, `AllowCloudRecording=True` in Teams Admin Center.

**Completed this session:**
- Kobayashi: Investigated all 4 config layers, identified blockers
- Edie: Created `docs/TEAMS_ADMIN_CONFIGURATION.md` — repeatable setup guide
- Scribe: Merged decisions, committed .squad/ state

**Key directive:** Only test users (trustingboar@ibuyspy.net, boldoriole@ibuyspy.net) are licensed. Isaac's account is NOT monitored.

**Next:** After blockers resolved → test Graph API access to OnlineMeetings → implement transcript fetching end-to-end.
