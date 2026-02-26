# Edie — History

## Core Context

- Documentation audit identified three deployment scenarios and critical doc gaps; unified quick starts created.
- Unified deployment documentation aligned to `deploy-unified.yml`, `iac/` root, and workflow dependency chain.
- Terraform state backend prerequisites documented (S3/DynamoDB, GitHub variables vs secrets) with bootstrap/verify references.
- AWS OIDC docs patched with verification steps and one-time setup clarifications.
- Project standard: unified Terraform deployment from `iac/`, not `iac/azure/` or `iac/aws`.

## Learnings

### 2026-02-25: temp-lambda and tasks Folder References (Edie)

- `temp-lambda/` and `tasks/` are gitignored and absent.
- Only references found in `.github/copilot-instructions.md` (gitignore note) and `.github/prompts/clean-up-docs.prompt.md` (`tasks/TODO.md`).

## Team Updates

📌 Team update (2026-02-26T01:43:23Z): Cleaned up temp build folders and confirmed doc references for temp-lambda/tasks — reported by Fenster and Edie — decided by Scribe
