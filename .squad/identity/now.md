---
updated_at: 2026-02-27T18:28:00.000Z
focus_area: DynamoDB scan pagination fix — admin app data visibility
active_issues: []
---

# What We're Focused On

🔧 **DynamoDB scan pagination fix — admin app screens not updating**

Fixed all 6 unpaginated DynamoDB Scan calls across meetingStore, transcriptStore, and subscriptionStore. DynamoDB Scan returns max 1MB per call — without `ExclusiveStartKey` pagination, records beyond 1MB were silently dropped.

**Completed:**
- All admin blockers resolved (CsApplicationAccessPolicy, Graph permissions, meeting policies)
- Transcript access verified working (200 with VTT content)
- DynamoDB scan pagination fix applied to all 3 stores (6 scan operations)
- Bootstrap scripts separated (Azure vs Teams policies)

**Next:** Deploy admin app with pagination fix, then move to transcript scanning functionality.
