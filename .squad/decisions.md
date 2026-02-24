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

---

## 2026-02-24: Test Infrastructure Fixes

**By:** Hockney (Tester)

**Decision:** Fix all import paths and Jest configuration after code reorganization moved meeting-bot to new location.

**Rationale:**
- Code reorganization from `lambda/meeting-bot/` to `scenarios/lambda/meeting-bot/` broke unit test imports
- Jest configuration needed to reflect new structure and resolve @aws-sdk
- Pester tests require real assertions for error handling validation

**Implementation:**
- Fixed require paths in `test/unit/meeting-bot/graph-client.test.js` and `test/unit/meeting-bot/index.test.js`
- Added `'<rootDir>/apps/aws-lambda/node_modules'` to Jest `modulePaths` for @aws-sdk resolution
- Updated Jest coverage paths to reflect `scenarios/lambda/meeting-bot/` structure
- Implemented real assertions in `test/scripts/generate-env.tests.ps1` for error handling, file format validation, and cross-platform script verification

**Status:**
- ✅ All 74 Jest tests passing
- ✅ Pester error handling tests passing
- ⚠️ Positive test cases remain placeholder (terraform mocking in PowerShell context requires future refinement)

---

## 2026-02-24: E2E Test Structure and Human-in-the-Loop Pattern

**By:** Redfoot (End-to-End Tester)

**Decision:** E2E tests for Teams Meeting Fetcher will use a human-in-the-loop pattern with Jest as the test framework and native Node.js for AWS/Graph API interactions.

**Rationale:**
1. Human-in-the-loop necessary: Teams meeting creation, bot installation, and real transcript generation cannot be automated without complex Teams API bot infrastructure
2. Jest provides structure: Test phases (describe/test blocks) organize pre-flight, setup, human action, validation, teardown naturally
3. Native Node.js minimizes dependencies: Using `child_process.execSync` for AWS CLI and `https` for Graph API keeps tests maintainable
4. Serial execution prevents interference: maxWorkers: 1 prevents concurrent tests from interfering with shared resources
5. Rich console output: Box-drawing and emojis guide humans through the process effectively

**Implementation:**
- Test framework: Jest with 10-minute timeout, maxWorkers: 1, Node environment
- Test structure: 3 AWS scenarios (teams-bot-e2e.test.js, eventhub-e2e.test.js, direct-graph-e2e.test.js)
- Shared utilities: helpers.js with infrastructure checks, logging, result formatting
- Documentation: Comprehensive E2E_RUNBOOK.md (1,433 lines) with setup, usage, troubleshooting
- Helper functions return structured results: `{ exists: boolean, error?: string, ...metadata }`
- Phase-based test flow: Pre-flight checks → Setup → Human action prompt → Wait periods → Validation → Teardown → Summary

**Benefits:**
- Maintainable: No complex mocking/simulation infrastructure
- Realistic: Tests actual Teams integration and Graph API
- Debuggable: Rich logging shows exactly what's happening
- Documented: Tests serve as living documentation
- Flexible: Easy to add new scenarios

**Tradeoffs:**
- Not CI/CD friendly: Requires human interaction
- Slower: Each test takes 3-10 minutes
- Non-deterministic: Teams/Graph processing timing varies

---

## 2026-02-24: No Root npm ci in Workflows

**By:** Fenster (DevOps/Infra)

**Decision:** All workflow files must install dependencies in app-specific directories only. Never run `npm ci` at the repo root. Always specify `cache-dependency-path` when using `cache: "npm"` in `setup-node`.

**Rationale:**
- No root `package.json` exists; project is a multi-app monorepo
- Root `npm ci` fails immediately, blocking the entire workflow
- `setup-node` with `cache: "npm"` without `cache-dependency-path` fails due to missing root `package-lock.json`

**Pattern:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "18"
    cache: "npm"
    cache-dependency-path: "apps/aws-lambda/package-lock.json"

- name: Install dependencies
  run: |
    cd apps/aws-lambda
    npm ci
```

**Implementation:**
- Fixed 11 workflow files to follow this pattern
- `test-and-lint.yml`, `e2e-integration-tests.yml`, `squad-ci.yml`, `squad-release.yml`, `squad-preview.yml`, `squad-insider-release.yml` already correct
- Applied pattern consistently across all app-dependent workflows

---

## 2026-02-24: Documentation Audit Findings and Recommendations

**By:** Edie (Documentation Specialist)

**Decision:** Teams Meeting Fetcher documentation is comprehensive but needs reorganization for new user onboarding. Create unified quick-start guides and fix critical path references.

**Critical Issues Identified:**
1. README.md references deprecated deployment paths (`cd iac/azure`, `cd iac/aws`)
2. DEPLOYMENT.md uses wrong folder name (`infra/` vs actual `iac/`)
3. Conflicting scenario terminology ("scenarios" vs "deployment patterns" vs "implementation approaches")

**Major Issues Identified:**
4. Missing scenario-specific environment variable mapping in CONFIGURATION.md
5. Broken cross-references to non-existent files (ARCHITECTURE.md, TROUBLESHOOTING.md)
6. Scattered prerequisites and cost information

**Actions Taken:**
- ✅ Created `QUICKSTART.md` at root — Unified entry point comparing all 3 scenarios
- ✅ Created `scenarios/nobots-eventhub/QUICKSTART.md` — Event Hub quick start
- ✅ Created `scenarios/lambda/meeting-bot/QUICKSTART.md` — Teams Bot quick start
- ✅ Updated `test/README.md` with E2E testing section

**Recommendations (Priority Order):**

*Immediate (do first):*
1. Fix DEPLOYMENT.md folder name (`infra/` → `iac/`)
2. Remove deprecated deployment paths from README.md
3. Add link to QUICKSTART.md at top of README.md

*Short-term (this sprint):*
4. Create `scenarios/README.md` explaining scenario structure
5. Add scenario-specific config table to CONFIGURATION.md
6. Fix broken cross-references, create missing docs (ARCHITECTURE.md, TROUBLESHOOTING.md, GLOSSARY.md)

*Long-term (future):*
7. Create comprehensive `docs/GLOSSARY.md` for terminology
8. Create `docs/ARCHITECTURE.md` with all 3 scenario architectures
9. Expand `apps/README.md` with app architecture overview
10. Add automated link checker to CI/CD

**Documentation Quality:**
- Overall: ⭐⭐⭐⭐ (4/5 stars)
- With fixes: ⭐⭐⭐⭐⭐ (5/5 stars)

**Coverage Metrics:**
- Root guides: ⭐⭐⭐⭐ 95% (with QUICKSTART.md)
- Scenario guides: ⭐⭐⭐⭐⭐ 100% (with new quick starts)
- App guides: ⭐⭐⭐ 75%
- Infrastructure: ⭐⭐⭐⭐ 90%
- Docs folder: ⭐⭐⭐⭐ 85% (missing ARCHITECTURE, TROUBLESHOOTING, GLOSSARY)

---

## 2026-02-24: No Root npm ci in Workflows

**By:** Fenster (DevOps/Infra)

**Decision:** All workflow files must install dependencies in app-specific directories only. Never run `npm ci` at the repo root. Always specify `cache-dependency-path` when using `cache: "npm"` in `setup-node`.

**Rationale:**
- No root `package.json` exists; this is a multi-app monorepo
- Root `npm ci` fails immediately, blocking the entire workflow
- `setup-node` with `cache: "npm"` without `cache-dependency-path` fails because it can't find a root `package-lock.json`

**Pattern:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "18"
    cache: "npm"
    cache-dependency-path: "apps/aws-lambda/package-lock.json"

- name: Install dependencies
  run: |
    cd apps/aws-lambda
    npm ci
```

**Implementation:** Fixed in 11 workflow files. The `test-and-lint.yml`, `e2e-integration-tests.yml`, `squad-ci.yml`, `squad-release.yml`, `squad-preview.yml`, and `squad-insider-release.yml` already followed this pattern correctly.

---

## 2026-02-24: Documentation Audit and Quick Start Creation

**By:** Edie (Documentation Specialist)

**Decision:** Create unified entry point documentation and scenario-specific quick start guides to ease onboarding for new users.

**Rationale:**
- Existing documentation is extensive but scattered across multiple files
- No clear comparison of deployment options for new users
- New users need 5-10 minute overview before committing to deep dives

**Actions taken:**
- ✅ Created `QUICKSTART.md` (root) — Unified entry point comparing all 3 scenarios
- ✅ Created `scenarios/nobots-eventhub/QUICKSTART.md` — Event Hub quick start
- ✅ Created `scenarios/lambda/meeting-bot/QUICKSTART.md` — Teams Bot quick start
- ✅ Confirmed `scenarios/nobots/QUICKSTART.md` — Already existed and accurate

**Critical issues identified (for future work):**
- README.md references deprecated paths (`iac/azure`, `iac/aws`) — should only use `iac/`
- DEPLOYMENT.md incorrectly refers to `infra/` folder — should be `iac/`
- Missing cross-references: ARCHITECTURE.md, TROUBLESHOOTING.md, GLOSSARY.md

**Implementation notes:**
- All new guides follow existing documentation style and structure
- Cost estimates added for scenario comparison
- Links validated across all 3 quick start guides

---

## 2026-02-24: Test Infrastructure Fixes

**By:** Hockney (Test Infrastructure)

**Decision:** Update all import paths and Jest configuration to reflect code reorganization from `lambda/meeting-bot/` to `scenarios/lambda/meeting-bot/`.

**Rationale:**
- Code reorganization moved meeting-bot to new directory structure
- Stale import paths broke unit tests
- Jest modulePathsConfiguration must reflect actual package locations

**Implementation:**
- Fixed import paths in `test/unit/meeting-bot/graph-client.test.js` and `test/unit/meeting-bot/index.test.js`
- Added `<rootDir>/apps/aws-lambda/node_modules` to Jest `modulePaths` for @aws-sdk resolution
- Updated coverage paths to reflect `scenarios/lambda/meeting-bot/` structure
- Implemented real assertions for Pester error handling tests

**Status:**
- ✅ All Jest tests passing (74 total)
- ✅ Pester error handling tests passing
- ⚠️ Pester positive tests require terraform mocking refinement (documented limitation)

---

## 2026-02-24: E2E Test Structure and Human-in-the-Loop Pattern

**By:** Redfoot (End-to-End Tester)

**Decision:** E2E tests will use a human-in-the-loop pattern with Jest framework and native Node.js for AWS/Graph API interactions (no SDKs).

**Rationale:**
- Teams meeting creation and real transcript generation cannot be automated without complex Bot Framework infrastructure
- Jest provides natural structure for test phases (pre-flight, setup, human action, validation, teardown)
- Native Node.js (`child_process`, `https`) minimizes dependencies and maintenance burden

**Test structure:**
```
test/e2e/
├── helpers.js
├── jest.config.js
├── aws/
│   ├── teams-bot-e2e.test.js
│   ├── eventhub-e2e.test.js
│   └── direct-graph-e2e.test.js
└── azure/
    └── placeholder.test.js
```

**Phase-based test flow:**
1. Pre-flight checks — Verify infrastructure
2. Setup — Acquire tokens, create subscriptions
3. Human action prompt — Visual box with clear instructions
4. Wait periods — Allow async processing
5. Validation — Check logs, S3, DynamoDB
6. Teardown — Clean up resources
7. Summary — Results + troubleshooting

**Benefits:**
- Maintainable: No complex mocking infrastructure
- Realistic: Tests actual Teams/Graph API integration
- Debuggable: Rich logging shows exactly what's happening

**Tradeoffs:**
- Not CI/CD friendly: Requires human interaction
- Slower: 3-10 minutes per test
- Non-deterministic: Timing varies with Teams/Graph processing

---

## 2026-02-24: Documentation Audit & Quick Start Creation

**By:** Edie (Documentation Specialist)

**Decision:** Implement comprehensive documentation restructuring with focus on unified quick start guides and scenario clarity.

**Audit Scope:**
- Reviewed 25+ documentation files across all areas
- Coverage: 100% of user-facing docs + infrastructure guides

**Deliverables:**
- Created QUICKSTART.md at root as unified entry point
- Created scenarios/nobots-eventhub/QUICKSTART.md (Event Hub scenario guide)
- Created scenarios/lambda/meeting-bot/QUICKSTART.md (Teams Bot scenario guide)

**Critical Issues Identified (Fix Immediately):**
1. README.md and DEPLOYMENT.md reference deprecated deployment paths (iac/azure, iac/aws)
2. DEPLOYMENT.md uses wrong folder name (infra/ instead of iac/)
3. Conflicting terminology for "scenarios" across documentation

**Major Issues (Fix Soon):**
4. Missing prerequisites checklist (now in QUICKSTART.md)
5. CONFIGURATION.md missing scenario-specific environment variable mapping
6. Broken cross-references to missing docs (ARCHITECTURE.md, TROUBLESHOOTING.md)

**Minor Issues (Nice to Have):**
7. Inconsistent file naming conventions
8. Missing glossary for terminology clarity
9. Cost estimates scattered across multiple documents
10. Missing "What's Next" guidance after README

**Quality Metrics:**
- Overall documentation quality: 4/5 stars → 5/5 stars with fixes
- Root guides completeness: 95% (improved from 85%)
- Scenario guides completeness: 100%

**Recommendations Priority:**
- **Immediate (This Week):** Fix deprecated paths, remove outdated references, add QUICKSTART.md link to README
- **Short-Term (This Sprint):** Create scenarios/README.md, add scenario-specific config mapping, fix cross-references, create GLOSSARY.md
- **Long-Term (Future):** Create docs/ARCHITECTURE.md, TROUBLESHOOTING.md, add automated link checker

**Full audit with line-by-line recommendations:** Available in `.squad/decisions/inbox/edie-doc-audit-findings.md`

---

## 2026-02-24: E2E Test Structure & Human-in-the-Loop Pattern

**By:** Redfoot (End-to-End Tester)

**Decision:** Implement human-in-the-loop E2E testing pattern using Jest with native Node.js for AWS/Graph API interactions.

**Rationale:**
1. **Human-in-the-loop necessary:** Teams meeting creation, bot installation, and transcript generation cannot be fully automated without complex Teams API bot infrastructure
2. **Jest provides natural structure:** describe/test blocks organize pre-flight, setup, human action, validation, teardown phases naturally
3. **Native Node.js preferred:** Using child_process.execSync and https module keeps dependencies minimal and tests maintainable
4. **Serial execution required:** maxWorkers: 1 prevents concurrent tests from interfering with shared resources (DynamoDB, S3, Lambda logs)
5. **Rich output guides humans:** Box-drawing characters, emojis, and structured logging provide clear instructions through test flow

**Test Structure:**
```
test/e2e/
├── helpers.js                     # Shared utilities
├── jest.config.js                 # 10-minute timeout
├── package.json                   # E2E-specific dependencies
├── .env.test.example              # Configuration template
├── aws/
│   ├── teams-bot-e2e.test.js      # Scenario 1: Teams Bot
│   ├── eventhub-e2e.test.js       # Scenario 2: Event Hub
│   └── direct-graph-e2e.test.js   # Scenario 3: Direct Graph
└── azure/
    └── placeholder.test.js        # Future Azure tests
```

**Phase-Based Test Flow:**
1. Pre-flight checks — Verify infrastructure exists
2. Setup — Acquire tokens, create subscriptions
3. Human action prompt — Visual box with clear instructions
4. Wait periods — Allow async processing time
5. Validation — Check logs, S3, DynamoDB
6. Teardown — Clean up test resources
7. Summary — Results + troubleshooting tips

**Benefits:** Maintainable, realistic, debuggable, documented, flexible

**Tradeoffs:** Not CI/CD friendly, slower (3-10 min per test), non-deterministic timing

**Full decision available in:** `.squad/decisions/inbox/redfoot-e2e-structure.md`
