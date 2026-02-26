# Edie — History

## Core Context

- Documentation audit identified three deployment scenarios and critical doc gaps; unified quick starts created.
- Unified deployment documentation aligned to `deploy-unified.yml`, `iac/` root, and workflow dependency chain.
- Terraform state backend prerequisites documented (S3/DynamoDB, GitHub variables vs secrets) with bootstrap/verify references.
- AWS OIDC docs patched with verification steps and one-time setup clarifications.
- Project standard: unified Terraform deployment from `iac/`, not `iac/azure/` or `iac/aws`.

## Learnings

### 2026-02-25: Cleanup of Legacy Doc References (Edie)

- Removed obsolete documentation and ignore-file references to deprecated temp build directories and local task trackers.
- Key files updated: .gitignore, .github/copilot-instructions.md, .github/prompts/clean-up-docs.prompt.md.

## Team Updates

📌 Team update (2026-02-26T02:36:49Z): Removed temp-lambda/tasks references from .gitignore, copilot instructions, and cleanup prompt — decided by Edie
