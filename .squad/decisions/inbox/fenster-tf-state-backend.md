# Decision: Terraform State Backend Naming and Provisioning

**By:** Fenster (DevOps/Infra)
**Date:** 2026-02-25

## Decision

Standardize the Terraform state backend naming convention and automate provisioning via dedicated bootstrap/verify scripts.

## Details

- **S3 Bucket**: `tmf-terraform-state-{account_id}` — includes AWS account ID for global uniqueness
- **DynamoDB Lock Table**: `tmf-terraform-state-lock` — single table per account
- **State Key**: `teams-meeting-fetcher/terraform.tfstate` — namespaced under project name
- **Region**: `us-east-1` — matches the default `aws_region` in Terraform variables

## Rationale

1. Including account ID in the bucket name prevents collisions across AWS accounts and makes the bucket self-documenting.
2. The `tmf-` prefix keeps all project resources identifiable.
3. Separate bootstrap script from the OIDC bootstrap — the OIDC script's `-SetupTerraformState` flag requires an IP CIDR for bucket policy and is more complex than needed. The new script does the minimum: bucket + table + GitHub vars.
4. Azure Terraform uses local backend (no remote state) — confirmed in `deploy-azure.yml` and `iac/azure/versions.tf`. No Azure state backend vars needed.

## Impact

- **All agents**: State backend is provisioned and verified. `deploy-aws.yml` has all required variables.
- **CI/CD**: `terraform init` in GitHub Actions will now succeed with the backend-config flags.
- **New contributors**: Run `scripts/setup/bootstrap-terraform-backend.ps1` (or `.sh`) to set up a new environment.
