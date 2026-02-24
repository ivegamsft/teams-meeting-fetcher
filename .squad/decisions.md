# Decisions

> Shared decision log. All agents read this before starting work.
> Scribe merges new decisions from `.squad/decisions/inbox/` after each session.

## 2026-02-24: Azure Provider OIDC Support Pattern

**By:** Fenster (DevOps/Infra)

**Decision:** Use a `use_oidc` boolean variable (default `false`) to toggle between local SPN auth (with `client_secret`) and CI/CD OIDC auth (with `use_oidc = true`, no secret).

**Rationale:**
- Allows local dev with Service Principal credentials while supporting GitHub Actions OIDC
- Avoids breaking existing local workflows that rely on SPN
- Single codebase works in both environments without branching logic

**Implementation:**
- Added `use_oidc` variable to `iac/variables.tf` and `iac/azure/variables.tf`
- Modified `azurerm` and `azuread` providers to conditionally set `client_secret = null` and `use_oidc = true` when `use_oidc` is true
- Deploy workflows set `TF_VAR_use_oidc=true` in all Terraform steps

---

## 2026-02-24: Terraform Variable Passing in CI/CD

**By:** Fenster (DevOps/Infra)

**Decision:** Pass all Terraform variables via `TF_VAR_*` environment variables in workflow steps, not via `-var` CLI flags.

**Rationale:**
- Prevents secrets from appearing in logs
- Consistent pattern across all steps (init, validate, plan, apply)
- Easier to audit and maintain

**Implementation:**
- All Azure credentials passed as `TF_VAR_azure_*` and `ARM_*` env vars
- Applied to both `deploy-aws.yml` and `deploy-azure.yml`

---

## 2026-02-24: Node.js Test Workflow Structure

**By:** Fenster (DevOps/Infra)

**Decision:** Test workflows must explicitly `cd apps/aws-lambda` and specify `cache-dependency-path: "apps/aws-lambda/package-lock.json"`.

**Rationale:**
- No root `package.json` exists — project is multi-app monorepo
- Default npm cache detection fails without explicit path
- Prevents "npm ci" errors in CI

**Implementation:**
- Updated `test-and-lint.yml` to cd into app dir before npm ci
- Updated `e2e-integration-tests.yml` to cd into app dir and add fallback for missing test patterns
- Added graceful fallback for missing Python requirements in webhook tests

---

## 2026-02-24: Squad Workflow Token Fallback

**By:** Fenster (DevOps/Infra)

**Decision:** Use `${{ secrets.COPILOT_ASSIGN_TOKEN || secrets.GITHUB_TOKEN }}` for Copilot assignment step in `squad-issue-assign.yml`.

**Rationale:**
- COPILOT_ASSIGN_TOKEN may not be configured in all repos
- Fallback to GITHUB_TOKEN allows workflow to run (though Copilot assignment may fail)
- Matches pattern already used in `squad-heartbeat.yml`

---

## 2026-02-24: Required GitHub Secrets Documentation

**By:** Fenster (DevOps/Infra)

**Decision:** Document all required secrets/variables in workflow file headers using clear comment blocks.

**Rationale:**
- Makes setup requirements visible to anyone reading the workflow
- Prevents deployment failures due to missing configuration
- Serves as inline documentation for repo setup

**Implementation:**
- Added ASCII-art bordered comment blocks at top of `deploy-aws.yml` and `deploy-azure.yml`
- Listed all required secrets and variables with brief descriptions
