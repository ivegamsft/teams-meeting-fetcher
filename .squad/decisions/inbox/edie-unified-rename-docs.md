# Edie — Workflow Rename Documentation Updates

**Date:** 2026-02-25  
**Agent:** Edie (Documentation Specialist)  
**Requested by:** ivegamsft (via Fenster)

---

## Decision

Update all documentation references from `deploy-aws.yml` → `deploy-unified.yml` and "Deploy to AWS" → "Deploy Unified Infrastructure" to reflect that the workflow deploys BOTH Azure and AWS resources via unified Terraform orchestration from `iac/main.tf`.

## Rationale

- **Workflow name was misleading:** `deploy-aws.yml` made it appear the workflow only deployed AWS resources, when in fact it runs unified Terraform that creates both Azure AND AWS infrastructure
- **Team clarity:** The new name "Deploy Unified Infrastructure" accurately describes what the workflow does — orchestrates `iac/main.tf` which chains Azure outputs into AWS module inputs
- **Fenster decision:** The unified approach (iac/main.tf calling iac/azure/ + iac/aws/) is the standard deployment model; sub-directory deployments (iac/aws/, iac/azure/) are modules only, never deployment entry points

## What Changed

**Files updated (13 total):**

1. **DEPLOYMENT_PREREQUISITES.md** — Workflow reference in prerequisites table
2. **DEPLOYMENT.md** — Added new "GitHub Actions Deployment Workflows" section with dependency chain table
3. **README.md** — Quick reference for deployments
4. **.github/GITHUB_WORKFLOWS_SETUP.md** — 3 workflow references updated
5. **.github/agents/run-e2e.agent.md** — Workflow reference updated
6. **.github/agents/deploy-aws.agent.md** — Description field updated
7. **.github/prompts/bootstrap-aws-iam.prompt.md** — Deployment guidance
8. **.github/prompts/bootstrap-dev-env.prompt.md** — Deployment guidance
9. **.github/prompts/bootstrap-gh-workflow-creds.prompt.md** — Workflow trigger reference
10. **.github/prompts/bootstrap-teams-config.prompt.md** — Deployment instructions
11. **.github/prompts/deploy-aws.prompt.md** — Title updated to "Deploy Unified Infrastructure"
12. **docs/QUICK_DEPLOY.md** — Terraform deployment guidance
13. **docs/TEAMS_BOT_SPEC.md** — Section title updated

## Key Documentation Additions

### New Section: GitHub Actions Deployment Workflows (DEPLOYMENT.md)

Added comprehensive workflow dependency chain documentation:

| Workflow | Trigger | Purpose | Dependencies |
|----------|---------|---------|---|
| `deploy-unified.yml` | Manual / `main` | Creates ALL infra (Azure + AWS) via unified Terraform | AWS OIDC, S3 state backend, Azure SPN secrets |
| `deploy-azure.yml` | Manual | Azure-only resources from `iac/azure/` | Azure SPN secrets only |
| `deploy-lambda-handler.yml` | Manual / `main` | Redeploys handler code | Requires `deploy-unified.yml` to have run first |
| `deploy-lambda-authorizer.yml` | Manual / `main` | Redeploys authorizer code | Requires `deploy-unified.yml` to have run first |
| `deploy-lambda-eventhub.yml` | Manual / `main` | Redeploys EventHub consumer code | Requires `deploy-unified.yml` to have run first |
| `deploy-lambda-meeting-bot.yml` | Manual / `main` | Redeploys Teams bot code | Requires `deploy-unified.yml` to have run first |

**Critical callout added:**
> Run `deploy-unified.yml` **once** to create infrastructure. Afterward, use `deploy-lambda-*.yml` workflows to redeploy code to existing functions without recreating infrastructure.

## What Was NOT Changed

**Intentionally preserved (immutable session records):**
- `.squad/decisions.md` — Historical decision log (Feb 24 references are part of history)
- `.squad/agents/fenster/history.md` — Session history (not updated)
- `.squad/orchestration-log/` — Session logs (not updated)
- `.squad/decisions/inbox/fenster-tf-state-backend.md` — Historical decision (not updated)
- `.squad/decisions/inbox/keaton-nobots-eventhub-plan.md` — Historical plan (not updated)
- Session plan file (`C:\Users\ivega\.copilot\session-state\...`) — Per instructions, not modified

**Pre-existing issues noted but out of scope:**
- `DEPLOYMENT.md` and `DEPLOYMENT_RULES.md` still reference `infra/` instead of `iac/` — this is a separate documentation bug, not related to the workflow rename

## Impact

**For new contributors:**
- Clear understanding that `deploy-unified.yml` creates infrastructure for BOTH clouds
- Clear dependency chain for Lambda redeployment workflows
- No confusion about what "Deploy to AWS" really does

**For operations:**
- GitHub Actions workflow run instructions are now more explicit (when to use which workflow)
- Deployment dependency sequence is documented
- Unified Terraform approach is clearly explained

## Implementation Notes

- All changes are backward-compatible (just updates to naming and documentation)
- The actual workflow file rename (`deploy-aws.yml` → `deploy-unified.yml`) is being done separately by Fenster
- Documentation now matches the intended naming scheme
