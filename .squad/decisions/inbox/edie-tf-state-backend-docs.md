# Decision: Terraform State Backend Documentation

**Date:** 2026-02-25  
**By:** Edie (Documentation Specialist)  
**Status:** Complete

## Summary

Documented comprehensive Terraform state backend setup (S3 bucket + DynamoDB table) in DEPLOYMENT_PREREQUISITES.md as a new section 2, positioned between AWS OIDC setup (section 1) and Azure setup (section 3). This is a **one-time prerequisite** that all AWS deployments require.

## What Changed

### DEPLOYMENT_PREREQUISITES.md

**Added new section 2: Terraform State Backend Setup**
- 2.1: S3 bucket creation with versioning, encryption, public access block
- 2.2: DynamoDB table creation for state locking
- 2.3: GitHub Variables configuration (TF_STATE_BUCKET, TF_STATE_KEY, TF_STATE_REGION, TF_STATE_LOCK_TABLE)
  - Emphasized the distinction: `gh variable set` (public) vs `gh secret set` (encrypted)
- 2.4: Bootstrap and verify scripts with TODO comments (scripts not yet created by Fenster)
- 2.5: State migration instructions for local→S3 transitions

**Reorganized all section numbers** to accommodate new section 2:
- Old section 2 (Azure) → section 3
- Old section 3 (GitHub Secrets) → section 4
- Old section 4 (GitHub Variables) → section 5
- Old section 5 (Terraform State Backend) merged into new section 2
- Old section 6 (Local Dev Prerequisites) → section 6
- Old section 7 (Pipeline-Generated Values) → section 7
- Old section 8 (Squad/CI Notes) → section 8
- Updated checklist to reference new section numbers and include subsections under section 2

### DEPLOYMENT.md

**Updated Prerequisites section** to add explicit cross-reference:
- Added bullet point for "Terraform State Backend (S3 + DynamoDB)" linking to DEPLOYMENT_PREREQUISITES.md section 2
- Clarified that TF state backend is a one-time setup like OIDC

### QUICKSTART.md

**Updated "Before You Begin" section** to include Terraform state backend:
- Changed single-item reference to multi-step list
- Added both OIDC provider (section 1) and TF state backend (section 2) as prerequisites
- Noted both are one-time setup per AWS account

## Key Design Decisions

1. **Section position** (section 2, between OIDC and Azure) — logically groups all AWS infrastructure prerequisites together before cloud setup

2. **Emphasis on distinction: Variables vs Secrets** — Many users confuse GitHub Variables (public) with Secrets (encrypted). Used a callout box to clarify that TF state values are variables, not secrets.

3. **Bootstrap/verify scripts with TODO** — Referenced script paths (`scripts/setup/bootstrap-terraform-backend.ps1/.sh` and `scripts/verify/verify-terraform-backend.ps1/.sh`) with TODO comments because Fenster is still building them. This unblocks documentation while making it clear when scripts are available.

4. **State migration section** — Included section 2.5 for teams that started with local state and want to migrate to S3. Provides complete commands and cleanup steps.

## Cross-References

All inter-document links updated:
- `DEPLOYMENT.md` → `DEPLOYMENT_PREREQUISITES.md#2-terraform-state-backend-setup`
- `QUICKSTART.md` → `DEPLOYMENT_PREREQUISITES.md#2-terraform-state-backend-setup`
- `DEPLOYMENT_PREREQUISITES.md` sections renumbered throughout

## Bootstrap Script Status

⚠️ **Scripts not yet created:**
- `scripts/setup/bootstrap-terraform-backend.ps1/.sh`
- `scripts/verify/verify-terraform-backend.ps1/.sh`

Documentation uses TODO comments to flag these. When Fenster creates scripts, these will be verified and TODO comments removed.

## Audience

- **New team members** deploying to AWS — follow section 2 before first `terraform init`
- **Operations** teams — use bootstrap script to automate setup across multiple repos
- **CI/CD operators** — understand that TF_STATE_* variables must be set before workflows run

## Related Work

- Fenster's bootstrap/verify scripts (pending)
- Existing: `bootstrap-github-oidc.ps1/.sh` and `verify-github-secrets.ps1/.sh` (similar pattern to follow)

---

## Verification Checklist

- ✅ Section 2 added with clear explanation of what/why
- ✅ S3 bucket and DynamoDB table setup commands included
- ✅ GitHub Variables documented (4 variables with examples)
- ✅ Variables vs Secrets distinction emphasized
- ✅ Bootstrap/verify script paths documented with TODO
- ✅ State migration section included
- ✅ All cross-references in other docs updated
- ✅ Checklist at end of DEPLOYMENT_PREREQUISITES.md updated
- ✅ DEPLOYMENT.md Prerequisites section updated
- ✅ QUICKSTART.md "Before You Begin" section updated
