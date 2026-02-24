# Decision: Verify Bootstrap CI Workflow

**By:** Fenster (DevOps/Infra)
**Date:** 2026-02-25

**Decision:** Created `.github/workflows/verify-bootstrap.yml` — a manual-dispatch workflow that verifies AWS OIDC, Azure OIDC, Terraform state backend, and GitHub secrets/variables are all correctly configured after running bootstrap scripts.

**Rationale:**
- No CI-level verification existed to confirm bootstrap was complete. The existing `verify-github-secrets.ps1` and `verify-terraform-backend.ps1` scripts run locally, but there was no way to validate from inside GitHub Actions (where OIDC actually matters).
- A single workflow_dispatch workflow lets the user run it post-bootstrap and get a clear PASS/FAIL for each cloud + config area.
- Conditional job execution avoids noisy failures when only one cloud is bootstrapped (e.g., AWS only, no Azure yet).

**Implementation:**
- 4 jobs: `config-verify` (secrets/variables), `aws-verify` (OIDC provider, IAM role, 9 policies, S3 bucket, DynamoDB table), `azure-verify` (OIDC auth, tenant match, SP validation), `summary` (rollup)
- OIDC-only auth for both clouds — no static keys
- `[PASS]/[FAIL]/[WARN]/[SKIP]` output format matching existing verify scripts
- DEPLOYMENT_PREREQUISITES.md updated with workflow reference, trigger table entry, and checklist item

**Impact:**
- All agents: After bootstrap, point users to `gh workflow run verify-bootstrap.yml` to confirm setup
- Edie (Docs): Workflow is already referenced in DEPLOYMENT_PREREQUISITES.md
