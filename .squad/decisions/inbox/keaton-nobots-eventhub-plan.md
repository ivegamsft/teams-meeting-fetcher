# Decision: Nobots-EventHub Deployment Plan

**Decision Owner:** Keaton (Lead/Architect)  
**Date:** 2026-02-25  
**Status:** READY FOR REVIEW & EXECUTION

---

## Summary

Created comprehensive deployment and testing plan for **nobots-eventhub scenario** covering pre-flight validation, infrastructure deploy, post-deploy configuration, E2E testing, validation checklist, and rollback procedures.

**Plan Location:** `C:\Users\ivega\.copilot\session-state\ccfe35ed-cd63-47f5-b790-af47e7c09466\plan.md`

---

## What Was Done

### 1. Analyzed Input Artifacts
- ✅ scenarios/nobots-eventhub/ (QUICKSTART.md, ARCHITECTURE.md, DEPLOYMENT.md, GUIDED-TESTING.md)
- ✅ iac/ (main.tf, variables.tf, terraform.tfvars, backend.tf, aws/azure modules)
- ✅ .github/workflows/ (deploy-aws.yml, deploy-azure.yml)
- ✅ apps/aws-lambda-eventhub/ (handler, package.json)
- ✅ .squad/decisions.md (existing decisions to respect)

### 2. Created 6-Phase Deployment Plan

| Phase | Focus | Duration | Agent |
|-------|-------|----------|-------|
| **1: Pre-flight** | Credential/backend validation, blockers identification | 15-20 min | ivegamsft |
| **2: Infrastructure** | Terraform init → plan → apply (101 resources) | 10-15 min | Deployment agent |
| **3: Post-Deploy Config** | Graph API subscription, Lambda env vars, Key Vault/Storage firewall | 10 min | ivegamsft + automation |
| **4: Testing** | Pre-flight checks (5m), quick test (5-10m), detailed E2E (30-45m) | 50-60 min | Hockney/Redfoot |
| **5: Validation** | 25-point checklist (9 infra, 5 config, 6 functional) | 5 min | Keaton |
| **6: Rollback** | Partial, full, and emergency procedures | 5-30 min | Keaton/Fenster |

### 3. Identified 5 CRITICAL Blockers

1. **Azure Client Secret expired** → Update from Key Vault
2. **Lambda zip package not built** → Run `npm ci && ./package.sh`
3. **Graph API Service Principal missing Calendars.Read** → Assign role
4. **Event Hub consumer group missing** → Terraform creates (verify post-deploy)
5. **RBAC roles not propagating** → Wait 5-10s after Terraform apply

### 4. Documented 8 Major Risks

- Wrong Azure tenant (mitigated by Phase 1.2 validation)
- Event Hub in wrong region (verify in Phase 2.2)
- Lambda timeout during polling (configurable)
- RBAC role propagation delay (wait 5-10s)
- Graph subscription expiration (3-day lifetime)
- S3 bucket policy too restrictive (Terraform applies least-privilege)
- And 2 others

### 5. Created Decision Gates

**Gate 1 (Before Deploy):** Pre-flight complete, plan reviewed, approval needed  
**Gate 2 (After Deploy):** Resources created, pre-flight checks pass, approval to test  
**Gate 3 (After Testing):** 20/20 validation points, no critical errors, approval for production  

---

## Key Architectural Insights

### Authentication Model
- **Azure:** RBAC-only (no shared keys)
- **AWS:** OIDC (GitHub Actions) + IAM roles
- **Graph API:** Service Principal (client credentials)
- **Event Hub:** Azure AD (Entra) via DefaultAzureCredential in Lambda

### Network Security (Per ivegamsft Directive)
- Azure Key Vault & Storage Account: Firewall + RBAC
- GitHub Actions runners: Temporary IP whitelist (add → work → remove)
- No key-based auth anywhere

### Terraform Deployment
- Unified deployment from `iac/` (not separate azure/aws folders)
- 101 resources created: ~40 Azure, ~60 AWS
- S3 + DynamoDB state backend with locking
- OIDC auth in CI/CD (no secrets in tfvars)

---

## Validation Criteria

**Success = 20/20 points:**
- 9 infrastructure components (Event Hub, Lambda, DynamoDB, S3, RBAC, Key Vault, Storage, etc.)
- 5 configuration components (Graph subscription, Lambda env, Terraform state, GitHub secrets/variables)
- 6 functional scenarios (event creation, notification, processing, storage, checkpoint tracking, transcript fetch)

**Scoring:** Each component = 1 point if pass, 0 if fail.

---

## Next Steps (Decision Required)

### IMMEDIATE (ivegamsft)
1. **Review plan** (15 min read time)
2. **Verify Phase 1 pre-flight checks** (15-20 min execution)
3. **Gate 1 decision:** Approve or block infrastructure deploy

### IF APPROVED
1. Execute Phase 2 (Terraform deploy) — 10-15 min
2. Execute Phase 3 (Post-deploy config) — 10 min
3. Gate 2 decision → Approve or block testing
4. Execute Phase 4 (E2E testing) — 50-60 min
5. Gate 3 decision → Ready for production

### IF BLOCKED
1. Resolve identified blocker (specific remediation in plan)
2. Restart from Phase 1
3. Document root cause in decision log

---

## Rationale & Trade-offs

### Why This Plan Structure?

**Pre-flight validation (Phase 1)** catches issues before expensive infrastructure deploy:
- Credentials: Fails fast if expired/wrong
- Backend: Catches state management issues early
- Azure app: Ensures Graph API will work
- Lambda packages: Verifies code is buildable before Terraform tries to deploy

**3-tier testing (Phase 4)** balances speed with confidence:
- Pre-flight checks (5m): Infrastructure health
- Quick test (5-10m): End-to-end message flow (automated)
- Detailed test (30-45m): Real Teams meeting with transcript (human validation)

**Decision gates** prevent bad deployments from reaching production:
- Gate 1: Don't spend $100 if creds are bad
- Gate 2: Don't test if infrastructure didn't deploy correctly
- Gate 3: Don't publish docs if validation failed

### Why Not Skip Steps?

- **Skipping Phase 1:** Could deploy to wrong Azure tenant = data isolation failure = security breach
- **Skipping Phase 3:** Lambda won't connect to Event Hub = silent failures in production
- **Skipping Phase 4.2 quick test:** Can't distinguish infrastructure issues from Lambda code issues
- **Skipping Gate 1:** Can't blame Terraform if credentials are expired

---

## Questions for Keaton's Review

1. **Blocker Assessment:** Are the 5 identified blockers correct? Are there others?
2. **Risk Acceptance:** Are we comfortable with the 8 documented risks, or should we add additional pre-deploy hardening?
3. **Agent Assignments:** Do these agent assignments match your team structure (ivegamsft, Hockney, Redfoot, Fenster)?
4. **Testing Scope:** Is 50-60 min of E2E testing acceptable, or should it be faster/more comprehensive?
5. **Rollback Confidence:** Do the rollback procedures give you confidence in disaster recovery?
6. **Production Readiness:** After passing all 3 gates and 20/20 validation, are we good to promote to production (monitoring/alerting is separate)?

---

## When to Use This Plan

✅ **USE THIS WHEN:**
- Deploying nobots-eventhub to new environment (dev, staging, prod)
- Troubleshooting failed deployment (reference Phase 6 for partial rollback)
- Onboarding new team member to deployment process (walk through phases)
- Documenting deployment procedure for audit/compliance

❌ **DON'T USE THIS WHEN:**
- Making small code changes (Lambda handler updates only) — use incremental deploy
- Debugging runtime issues in existing deployment — use MONITORING.md
- Scaling infrastructure — create separate scaling plan (e.g., increase Event Hub throughput)

---

## Ownership

**Plan Owner:** Keaton (Lead/Architect)  
**Execution Owner:** ivegamsft (with support from Hockney, Redfoot, Fenster)  
**Review Cycle:** Before each deployment

---

**Status:** ✅ READY FOR DECISION  
**Approval Required From:** Keaton (lead) before execution  
**Target Completion:** 2026-02-25 (same day, ~2 hours if all gates pass)
