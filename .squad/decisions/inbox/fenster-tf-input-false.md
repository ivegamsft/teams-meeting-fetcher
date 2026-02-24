# Decision: Always Use `-input=false` in CI/CD Terraform Commands

**By:** Fenster (DevOps/Infra)  
**Date:** 2026-02-25  
**Context:** Terraform workflow hang investigation

## Problem

The `deploy-unified.yml` workflow's Terraform plan step hung for 36+ minutes because:

1. `-input=false` was NOT set on `terraform plan` or `terraform apply` commands
2. Six required Terraform variables had no defaults and were not passed as `TF_VAR_*` environment variables
3. Terraform attempted to prompt for missing values in a non-interactive CI environment, causing an infinite hang

## Decision

**All Terraform commands in CI/CD workflows MUST use `-input=false` flag.**

This applies to:
- `terraform plan`
- `terraform apply`
- `terraform destroy`
- Any other Terraform command that might prompt for user input

## Rationale

1. **Fail-fast behavior**: Missing variables will cause immediate error exit instead of silent hang
2. **CI/CD compatibility**: GitHub Actions runners have no TTY for interactive input
3. **Debugging clarity**: Errors surface immediately in logs instead of appearing as timeout failures
4. **Consistent behavior**: Same behavior across local testing (with `-input=false`) and CI/CD
5. **Security**: Prevents accidental prompts that could be exploited in automated environments

## Implementation

### Before (Hanging):
```yaml
- name: Terraform plan
  run: |
    cd iac
    terraform plan -out=tfplan
```

### After (Fail-fast):
```yaml
- name: Terraform plan
  run: |
    cd iac
    terraform plan -input=false -out=tfplan
  env:
    TF_VAR_aws_account_id: ${{ vars.AWS_ACCOUNT_ID }}
    TF_VAR_webhook_bucket_name: ${{ vars.WEBHOOK_BUCKET_NAME }}
    # ... all required variables
```

## Related Fixes

In addition to adding `-input=false`:

1. **Added 6 missing TF_VAR_* env vars** to BOTH plan and apply steps:
   - `TF_VAR_aws_account_id`
   - `TF_VAR_webhook_bucket_name`
   - `TF_VAR_transcript_bucket_name`
   - `TF_VAR_checkpoint_bucket_name`
   - `TF_VAR_bot_messaging_endpoint`
   - `TF_VAR_client_state`

2. **Added timeout protection**: `timeout-minutes: 30` on validate job prevents infinite hangs

3. **Updated documentation**: Workflow header comments now list all required GitHub secrets and variables

## Impact

- **All agents**: Always include `-input=false` when writing Terraform workflow steps
- **CI/CD**: Terraform errors will fail fast (30-60 seconds) instead of timing out (30+ minutes)
- **Local dev**: Still works — developers can run `terraform plan` interactively, but should use `-input=false` for scripted/automated operations

## Verification

After fix applied, workflow should:
1. ✅ Complete plan step in 1-3 minutes (not 36+ minutes)
2. ✅ Show clear error if any required variable is missing
3. ✅ Proceed to apply step only when all variables are present
4. ✅ Honor 30-minute job timeout as backstop

---

**Status:** Ready for merge to `.squad/decisions.md`
