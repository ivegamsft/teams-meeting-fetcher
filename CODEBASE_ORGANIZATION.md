# Codebase Organization Guide

## Current State
- `scripts/` - Scattered automation scripts (graph/, aws/, setup/, config/, deployment/, teams/, verify/)
- `test/` - Tests organized by level (unit, integration, e2e) separate from functional code
- `nobots/` - Polling-based implementation
- `nobots-eventhub/` - Event-driven EventHub implementation
- `apps/` - Lambda functions and services

**Problem**: Docs, tests, and scripts for a given scenario are spread across multiple folders.

---

## Proposed Organization

### Level 1: Scenario Folders (Self-contained packages)

Each scenario is a complete package with everything needed for that workflow:

```
nobots-eventhub/                         ← EventHub scenario
├── README.md                            (Architecture, setup, usage)
├── DEPLOYMENT.md                        (How to deploy and configure)
├── src/                                 (Implementation)
│   ├── dump-events.js
│   └── ...
├── tests/                               (All tests for this scenario)
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/                             (Setup and management scripts)
│   ├── setup-eventhub.ps1
│   ├── create-subscription.py
│   └── monitor-events.sh
├── config/                              (Templates and examples)
│   ├── .env.example
│   └── terraform.tfvars.example
└── data/                                (Sample data and fixtures)
    └── sample-events/
```

### Level 2: Scripts Folder (For shared/cross-cutting tools)

Keep in `scripts/` only truly shared utilities:

```
scripts/
├── README.md                            (Index of all shared scripts)
├── shared/                              (Cross-scenario utilities)
│   ├── auth_helper.py
│   ├── config_loader.sh
│   └── secret_manager.ps1
├── graph/                               (Graph API shared utilities)
│   ├── auth_helper.py
│   └── graph_client.py  
└── DEPRECATION_NOTICE.md                (Point to scenario-specific scripts)
```

### Level 3: Root Test Folder (For infrastructure/integration tests only)

Keep in `test/` only tests that span multiple scenarios:

```
test/
├── infrastructure/                      (Cross-scenario infra tests)
├── integration/                         (Cross-scenario integration tests)
├── e2e/                                 (Full pipeline tests)
├── fixtures/                            (Shared test fixtures)
└── README.md                            (Testing strategy)
```

---

## Migration Plan

### Phase 1: EventHub Scenario (nobots-eventhub)

1. **Create structure**:
   ```bash
   mkdir -p nobots-eventhub/{tests,scripts,config,data}
   ```

2. **Move tests**:
   ```bash
   # EventHub-specific tests from test/ → nobots-eventhub/tests/
   cp -r test/integration/*eventhub* nobots-eventhub/tests/integration/
   cp -r test/e2e/*eventhub* nobots-eventhub/tests/e2e/
   ```

3. **Move scripts**:
   ```bash
   # EventHub setup scripts from scripts/graph → nobots-eventhub/scripts/
   mv scripts/graph/02-create-webhook-subscription.py nobots-eventhub/scripts/
   mv scripts/graph/03-create-test-meeting.py nobots-eventhub/scripts/
   ```

4. **Create documentation**:
   - `DEPLOYMENT.md` - How to set up EventHub in nobots-eventhub
   - Update `README.md` with scenario-specific setup

### Phase 2: Polling Scenario (nobots)

1. **Create structure**:
   ```bash
   mkdir -p nobots/{tests,scripts,config,data}
   ```

2. **Move polling-specific tests and scripts**

### Phase 3: Shared Scripts Cleanup

- Keep only truly shared utilities in `scripts/shared/`
- Add symlinks or import paths to scenario-specific scripts
- Create `scripts/DEPRECATION_NOTICE.md` pointing to scenario-specific locations

---

## File Locations: Before & After

### EventHub Subscription Creation

**BEFORE**:
- Script: `scripts/graph/02-create-webhook-subscription.py`
- Tests: `test/integration/webhooks.test.js` (mixed with other tests)
- Config: `scripts/config/.env.example`
- Docs: `nobots-eventhub/README.md`, `docs/GRAPH_SUBSCRIPTIONS_SETUP.md`

**AFTER**:
- Script: `nobots-eventhub/scripts/create-subscription.py`
- Tests: `nobots-eventhub/tests/integration/subscription.test.js`
- Config: `nobots-eventhub/config/.env.example`
- Docs: `nobots-eventhub/SETUP.md`, `nobots-eventhub/DEPLOYMENT.md`

### Event Hub Polling & Processing

**BEFORE**:
- Implementation: `nobots-eventhub/dump-events.js`
- Tests: `test/e2e/eventhub-flow.test.js`
- Monitoring script: `scripts/aws/subscription-tracker.py` (AWS-specific)
- Docs: `nobots-eventhub/README.md`

**AFTER**:
- Implementation: `nobots-eventhub/src/dump-events.js`
- Tests: `nobots-eventhub/tests/e2e/flow.test.js`
- Monitoring script: `nobots-eventhub/scripts/monitor.sh`
- Docs: `nobots-eventhub/README.md`, `nobots-eventhub/MONITORING.md`

---

## Benefits

1. **Self-contained scenarios**: Everything needed for EventHub is in one folder
2. **Easy onboarding**: New developer just reads nobots-eventhub/README.md
3. **Clearer dependencies**: Tests live with code they test
4. **Better documentation**: Scenario docs, setup, and deployment guides together
5. **Reduced clutter**: `scripts/` becomes utility library, not script dumping ground
6. **Easier comparison**: Want to understand polling vs event-driven? Compare nobots/ vs nobots-eventhub/

---

## Directory Template for New Scenarios

When adding a new scenario, use this template:

```
scenario-name/
├── README.md                            # What is this scenario? When to use it?
├── SETUP.md                             # Prerequisites and configuration
├── DEPLOYMENT.md                        # How to deploy (Terraform, Docker, etc.)
├── TROUBLESHOOTING.md                   # Common issues and solutions
├── src/                                 # Implementation code
│   └── [your code here]
├── tests/                               # All tests
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/                             # Setup and operational scripts
│   ├── setup.sh|ps1
│   ├── deploy.sh|ps1
│   └── monitor.sh|ps1
├── config/                              # Configuration templates
│   ├── .env.example
│   ├── terraform.tfvars.example
│   └── [other configs]
└── data/                                # Sample data and fixtures
    └── fixtures/
```

---

## Crosscutting Concerns (Remain in root-level folders)

✅ Keep in `scripts/shared/`:
- Graph API helpers (auth, client setup)
- Configuration loaders
- Secret management utilities
- Logging/monitoring utilities

✅ Keep in `iac/`:
- Terraform for all scenarios
- Infrastructure as Code (unified)

✅ Keep in `docs/`:
- Architecture overviews
- Decision records
- Integration guides across scenarios

✅ Keep in `test/`:
- Infrastructure tests (e2e, integration spanning scenarios)
- Shared test utilities
- Test fixtures used by multiple scenarios

---

## Next Action

To reorganize, we need to:

1. **Create scenario-specific folders** with subfolders (tests/, scripts/, config/, data/)
2. **Move scenario-specific files** into their folders
3. **Update imports and documentation** to reflect new paths
4. **Create README for each scenario** with complete setup-to-deployment guide
5. **Update root README** with new structure links

Would you like me to:
- [ ] Start with EventHub scenario organization (high priority)
- [ ] Create folders and move files
- [ ] Update documentation and import paths
- [ ] Create template READMEs with migration status

