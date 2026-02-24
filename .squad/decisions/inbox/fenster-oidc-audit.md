# Decision: AWS OIDC Bootstrap — Audit Findings and Recommendations

**By:** Fenster (DevOps/Infra)
**Date:** 2026-02-25
**Status:** Proposed (recommendations for team review)

## Context

User (ivegamsft) completed the AWS OIDC bootstrap manually:
- Created OIDC provider for GitHub Actions
- Created IAM role `GitHubActionsTeamsMeetingFetcher` (account 833337371676)
- Attached 4 policies: S3FullAccess, Lambda_FullAccess, DynamoDBFullAccess, APIGatewayAdministrator
- Set `AWS_ROLE_ARN` GitHub secret

## Part A — Repeatability Assessment

### Already Automated
The bootstrap scripts already exist and are idempotent:
- `scripts/setup/bootstrap-github-oidc.ps1` (PowerShell, cross-platform)
- `scripts/setup/bootstrap-github-oidc.sh` (Bash)

Both scripts:
- Check if OIDC provider exists before creating
- Check if IAM role exists before creating (updates trust policy if it does)
- Auto-detect repository from git remote
- Support `--aws-only` / `--azure-only` flags
- Include optional Terraform state backend setup (`-SetupTerraformState`)

### Gaps Between Script and Manual Setup
| Aspect | Bootstrap Script | User's Manual Setup |
|--------|-----------------|-------------------|
| Role name | `github-actions-oidc-role` | `GitHubActionsTeamsMeetingFetcher` |
| Policies | `AdministratorAccess` (1 policy) | 4 scoped policies (S3, Lambda, DynamoDB, APIGW) |
| GitHub secrets | Prints commands, doesn't auto-set | Used `gh secret set` |
| Idempotent | Yes | No (manual commands fail if resources exist) |

### Recommendation
- **Do NOT create new scripts.** The existing `bootstrap-github-oidc.ps1/.sh` covers the use case.
- **Update the script** to use the 4-policy approach instead of `AdministratorAccess` (least privilege).
- **Update the script** to allow configurable role name (default to `GitHubActionsTeamsMeetingFetcher` matching DEPLOYMENT_PREREQUISITES.md).
- **Keep as standalone script, NOT Terraform.** OIDC provider + IAM role is a chicken-and-egg prerequisite. Terraform can't manage what it needs to authenticate.
- **Idempotent: Yes.** The script already is. The manual commands should be wrapped in the same check-before-create pattern.

## Part B — Testability/Verification Assessment

### Existing Verification
- `scripts/verify/verify-github-secrets.ps1/.sh` — checks GitHub secret *names* only, uses stale secret list (checks for legacy `AWS_ACCESS_KEY_ID` instead of `AWS_ROLE_ARN`)

### Verification Commands That Should Exist
```bash
# 1. Verify OIDC provider exists
aws iam list-open-id-connect-providers
# Should show: arn:aws:iam::833337371676:oidc-provider/token.actions.githubusercontent.com

# 2. Verify IAM role exists and has correct trust policy
aws iam get-role --role-name GitHubActionsTeamsMeetingFetcher
# Check: Trust policy references correct repo and OIDC provider

# 3. Verify attached policies
aws iam list-attached-role-policies --role-name GitHubActionsTeamsMeetingFetcher
# Should show 4 policies

# 4. Verify GitHub secret is set
gh secret list | grep AWS_ROLE_ARN

# 5. Self-test: attempt role assumption in a GitHub Actions workflow
# A minimal workflow that runs `aws sts get-caller-identity` after assuming the OIDC role
```

### CI Self-Test Possibility
A GitHub Actions workflow CAN self-test the OIDC setup:
```yaml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: us-east-1
- run: aws sts get-caller-identity  # If this succeeds, OIDC works
```
This already happens implicitly in every deploy workflow. A dedicated "preflight check" workflow would make it explicit.

### Policy Sufficiency Assessment
The 4 attached policies are **sufficient** for current Terraform operations (S3 buckets, Lambda functions, DynamoDB tables, API Gateway REST APIs). They also cover the `deploy-lambda-*.yml` workflows.

**Missing from current policies:**
- `iam:*` — Terraform creates IAM roles for Lambda execution. Without IAM permissions, `terraform apply` will fail on Lambda execution role creation.
- `events:*` — Terraform creates EventBridge rules. Without CloudWatch Events permissions, the EventHub polling schedule will fail.
- `sns:*` — Terraform creates SNS topics for notifications.
- `logs:*` — Lambda creates CloudWatch Log Groups.
- `cloudwatch:*` — Terraform creates CloudWatch alarms.
- `ssm:*` — If using SSM Parameter Store for secrets.
- `sts:TagSession` — May be needed for OIDC session tagging.

**Recommendation:** The 4 policies will likely fail on first `terraform apply`. Need to add IAM, CloudWatch Events, SNS, CloudWatch Logs, and CloudWatch policies. OR use a custom policy scoped to project resources.

## Part C — Concrete Recommendations

### 1. Update Existing Bootstrap Script (Priority: High)
**File:** `scripts/setup/bootstrap-github-oidc.ps1` and `.sh`
**Changes:**
- Replace `AdministratorAccess` with the 4 scoped policies + IAM + Events + SNS + Logs
- Make role name configurable (default: `GitHubActionsTeamsMeetingFetcher`)
- Auto-set GitHub secrets via `gh secret set` (with user confirmation)

### 2. Update Verification Script (Priority: High)
**File:** `scripts/verify/verify-github-secrets.ps1` and `.sh`
**Changes:**
- Update required secret list to OIDC-era secrets (`AWS_ROLE_ARN`, not `AWS_ACCESS_KEY_ID`)
- Add AWS-side verification (OIDC provider exists, role exists, policies attached)
- Add trust policy validation (correct repo, correct OIDC provider ARN)

### 3. Create Preflight Verification Workflow (Priority: Medium)
**File:** `.github/workflows/preflight-check.yml`
**Purpose:** On `workflow_dispatch`, verify all infrastructure prerequisites are configured
**Checks:** OIDC assumption works, required resources exist, secrets are set

### 4. Security Hardening (Priority: Medium)
**Current risk:** `*FullAccess` managed policies grant permissions to ALL resources of that type across the entire AWS account, not just project resources.
**Recommendation:** Create a custom IAM policy scoped to:
- S3: only `tmf-*` buckets
- Lambda: only `tmf-*` functions
- DynamoDB: only project tables
- API Gateway: only project APIs
This is a future enhancement — the current setup works but violates least-privilege for multi-project accounts.

### 5. Deprecation Cleanup (Priority: Low)
- Delete or clearly mark `scripts/setup/setup-github-aws-iam.ps1/.sh` as deprecated (creates IAM users with `AdministratorAccess`)
- These scripts create long-lived credentials, contradicting the OIDC approach

### Decision
- Keep OIDC bootstrap as standalone scripts (not Terraform)
- Update scripts to match the user's better 4-policy approach
- Update verify scripts for OIDC-era secrets
- Add missing IAM/Events/SNS/Logs policies before first terraform apply
