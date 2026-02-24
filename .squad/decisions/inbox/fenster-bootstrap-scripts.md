## Bootstrap and Verify Scripts Updated for OIDC with Scoped Policies

**By:** Fenster (DevOps/Infra)

**Decision:** Replace `AdministratorAccess` in bootstrap scripts with 9 scoped AWS managed policies matching the production `GitHubActionsTeamsMeetingFetcher` role. Replace IAM-user-era secret checks in verify scripts with OIDC-era checks including AWS-side resource verification.

**Rationale:**
- `AdministratorAccess` violated least-privilege. The 9 scoped policies (S3, Lambda, DynamoDB, API Gateway, IAM, EventBridge, SNS, CloudWatch Logs, CloudWatch) match exactly what the role needs.
- The old role name `github-actions-oidc-role` didn't match the manually created `GitHubActionsTeamsMeetingFetcher` role.
- Verify scripts checked for stale IAM-user secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) that are no longer used with OIDC.
- No script verified AWS-side resources (OIDC provider existence, role existence, trust policy, attached policies).

**Changes:**

1. `scripts/setup/bootstrap-github-oidc.ps1` and `.sh`:
   - Default role name: `GitHubActionsTeamsMeetingFetcher` (configurable via `-RoleName` / `--role-name`)
   - 9 scoped policies instead of `AdministratorAccess`
   - `-SetSecrets` / `--set-secrets` flag to optionally run `gh secret set` commands
   - Removed emojis from output

2. `scripts/verify/verify-github-secrets.ps1` and `.sh`:
   - Checks OIDC-era secrets: `AWS_ROLE_ARN`, `AWS_REGION`
   - Warns about stale IAM-user-era secrets
   - Verifies AWS OIDC provider exists
   - Verifies IAM role exists and trust policy references correct repo
   - Verifies all 9 expected policies are attached
   - Warns if `AdministratorAccess` is still attached
   - Reports pass/fail count with exit code 1 on any failure

3. `DEPLOYMENT_PREREQUISITES.md` section 1.2:
   - Added 5 new policies (IAM, EventBridge, SNS, CloudWatch Logs, CloudWatch) to existing 4

**Impact:**
- All agents: Bootstrap and verify scripts now match production OIDC configuration
- New contributors: Running the bootstrap script produces a correctly scoped role
- CI/CD: Verify script can be used as a pre-flight check before running deploy workflows
