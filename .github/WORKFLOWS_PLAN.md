# GitHub Deployment Workflows Plan

## Overview

Organized GitHub Actions workflows for deploying different application scenarios:

- **norobots**: Graph API change tracking + EventGrid subscription management
- **norobots-eventhub**: Graph API → EventHub → Lambda processor
- **meeting-bot**: Teams Bot Service deployment

## Directory Structure

```
.github/workflows/
├── README.md
├── _templates/
│   ├── build-and-deploy.yml          (reusable workflow)
│   └── test-and-validate.yml         (reusable workflow)
│
├── scenarios/
│   ├── norobots/
│   │   ├── deploy.yml                (Graph API + EventGrid)
│   │   ├── test.yml                  (end-to-end testing)
│   │   └── README.md
│   │
│   ├── norobots-eventhub/
│   │   ├── deploy.yml                (Graph API + Lambda Reader)
│   │   ├── test.yml                  (end-to-end testing)
│   │   └── README.md
│   │
│   └── meeting-bot/
│       ├── deploy.yml                (Bot Service)
│       ├── test.yml                  (unit + integration tests)
│       └── README.md
└── manual-triggers/
    ├── update-lambda-env.yml         (Update Lambda environment)
    └── terraform-plan.yml            (Preview infrastructure changes)
```

## Workflow Implementation Checklist

### Phase 1: MVP - EventHub Processor

- [ ] Create `.github/workflows/scenarios/norobots-eventhub/` directory
- [ ] Create `deploy.yml` - Build, test, deploy Lambda
- [ ] Create `test.yml` - Integration testing
- [ ] Create reusable workflow templates in `_templates/`

### Phase 2: Graph API (norobots)

- [ ] Create `.github/workflows/scenarios/norobots/` directory
- [ ] Create `deploy.yml` - Terraform + scripts
- [ ] Create `test.yml` - Subscription validation

### Phase 3: Bot Service

- [ ] Create `.github/workflows/scenarios/meeting-bot/` directory
- [ ] Create `deploy.yml` - Build, test, deploy bot
- [ ] Create `test.yml` - Bot integration tests

### Phase 4: Manual Utilities

- [ ] Create `.github/workflows/manual-triggers/` directory
- [ ] Create `update-lambda-env.yml`
- [ ] Create `terraform-plan.yml`

## Current Implementation Status

**Status**: ✅ Plan Created | ⏳ Awaiting Implementation

See main Workflows Plan document for detailed specifications and example implementations.
