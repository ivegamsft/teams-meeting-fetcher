## 2026-02-25: Unified Workflow Rename (deploy-aws.yml -> deploy-unified.yml)

**By:** Fenster (DevOps/Infra)

**Decision:** Renamed `.github/workflows/deploy-aws.yml` to `deploy-unified.yml` and updated workflow name to "Deploy Unified Infrastructure". Expanded `on.push.paths` to include `iac/*.tf` and `iac/azure/**`.

**Rationale:**
- The workflow runs `iac/main.tf` which deploys BOTH Azure (Event Hub, Key Vault, app registrations) AND AWS (Lambda, DynamoDB, S3) — naming it "Deploy to AWS" was misleading
- The `iac/azure/**` module is a dependency of the AWS module (`depends_on`), so changes there should trigger the unified pipeline
- `iac/*.tf` contains the root `main.tf` entry point — changes there should also trigger the workflow

**What changed:**
1. File renamed via `git mv` (preserves history)
2. Workflow `name:` changed from "Deploy to AWS" to "Deploy Unified Infrastructure"
3. `on.push.paths` expanded: added `iac/*.tf` and `iac/azure/**`
4. `workflow_dispatch` trigger preserved unchanged
5. All non-historical references across docs/prompts updated

**What did NOT change:**
- `deploy-azure.yml` — standalone Azure-only deployment (runs from `iac/azure/` directory)
- Job names within the workflow (deploy job still says "Deploy to AWS" since it deploys Lambda code)
- Historical `.squad/` records (orchestration logs, prior decisions)

**Impact:**
- All agents: Reference `deploy-unified.yml` for the unified deployment workflow going forward
- Edie (Docs): Already updated 14 documentation files in prior session
