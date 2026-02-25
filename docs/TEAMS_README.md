# Teams Configuration Documentation — Start Here

## Overview

This folder contains comprehensive documentation for Teams Meeting Fetcher configuration that is **fully repeatable across any tenant**.

---

## 📌 Quick Start

**New to this project?**  
→ Start with [TEAMS_CONFIGURATION_INDEX.md](./TEAMS_CONFIGURATION_INDEX.md) — it has a quick navigation table

**Deploying to a new tenant?**  
→ Print and use [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md)

**Want to understand current setup?**  
→ Read [TEAMS_CONFIGURATION_CURRENT_REFERENCE.md](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md)

**Need to replicate somewhere else?**  
→ Follow [TEAMS_CONFIGURATION_REPRODUCIBLE.md](./TEAMS_CONFIGURATION_REPRODUCIBLE.md)

---

## 📚 Documentation Files

| File                                                                                         | Purpose                                                       | Audience                       | Format              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ | ------------------- |
| [TEAMS_CONFIGURATION_INDEX.md](./TEAMS_CONFIGURATION_INDEX.md)                               | **Central hub** — Navigation and quick reference              | Everyone                       | Markdown w/ tables  |
| [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md) | **Step-by-step** — Actual deployment guide                    | Deployment teams               | Printable checklist |
| [TEAMS_CONFIGURATION_REPRODUCIBLE.md](./TEAMS_CONFIGURATION_REPRODUCIBLE.md)                 | **Complete reference** — How to reproduce setup in any tenant | Architects, Engineers          | Detailed guide      |
| [TEAMS_CONFIGURATION_CURRENT_REFERENCE.md](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md)       | **Current state** — What's deployed in our tenant             | Support staff, Troubleshooters | Reference snapshot  |
| [TEAMS_BOT_SPEC.md](./TEAMS_BOT_SPEC.md)                                                     | **Architecture** — System design and requirements             | Architects, Developers         | Spec + diagrams     |
| [COMMUNICATION_FLOW_DIAGRAMS.md](./COMMUNICATION_FLOW_DIAGRAMS.md)                           | **Flows** — Message flows and interactions                    | Developers, Architects         | Mermaid diagrams    |
| [TEAMS_INVENTORY_AUTOMATION.md](./TEAMS_INVENTORY_AUTOMATION.md)                             | **Automation** — How to audit and document deployment         | DevOps, QA                     | Script guide        |

---

## 🔄 Multi-Tenant Approach

**Key Principle**: All configuration is code and can be repeated in any tenant.

### What's the Same Across Tenants?

- Lambda function code
- API Gateway setup
- GitHub Actions workflows
- Data models (DynamoDB schemas)

### What's Different Per Tenant?

- Azure AD app (bot identity)
- Security group (allow-list)
- Teams manifest (bot ID, domains)
- Teams policies (scoped to group)
- Lambda environment variables
- Webhook subscription

### Result

✅ **Setup is fully reproducible** — Use the Reproducible Setup Guide + Deployment Checklist in any tenant

---

## ✅ Validation Checklist

After deployment, verify using this quick checklist:

- [ ] Azure AD app exists with all permissions granted
- [ ] Security group exists and has members
- [ ] Teams manifest uploaded to org catalog
- [ ] "Recorded Line" app setup policy exists and assigned
- [ ] "Recorded Line" meeting policy exists and assigned
- [ ] Application Access Policy granted to bot
- [ ] Lambda environment variables configured
- [ ] Webhook subscription is active
- [ ] End-to-end test: Create meeting → Auto-recording starts

See **full validation checklist** in [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md#phase-7-end-to-end-testing)

---

## 🛠️ Tools & Scripts

### Auto-Document Your Deployment

After completing setup, run the inventory script to create permanent documentation:

```bash
python scripts/teams/run-inventory.py
```

**Output**: `inventory/teams-config-inventory-{timestamp}.md` + JSON files + ZIP backup

---

### Automation Scripts by Phase

| Phase  | Script                           | Purpose               |
| ------ | -------------------------------- | --------------------- |
| 1      | `bootstrap-azure-spn.ps1`        | Create Azure AD app   |
| 5      | `setup-teams-policies.ps1`       | Create Teams policies |
| 6      | `create_webhook_subscription.py` | Create webhook        |
| Verify | `check_latest_webhook.py`        | Verify webhook active |
| All    | `run-inventory.py`               | Document everything   |

---

## 📋 Typical Deployment (by Role)

### Teams Administrator

1. Read: [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md) Phases 4-5
2. Upload manifest to Teams org catalog (Phase 4)
3. Run setup-teams-policies.ps1 (Phase 5)
4. Verify policies in Teams Admin Center

**Time**: ~30 minutes

### Identity / Security Engineer

1. Read: [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md) Phases 1-2
2. Create Azure AD app (Phase 1) — automated or manual
3. Create security group (Phase 2)
4. Record all values from these phases

**Time**: ~25 minutes

### Backend / DevOps Engineer

1. Read: [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md) Phases 3, 6-7
2. Update manifest files (Phase 3)
3. Configure Lambda environment (Phase 6)
4. Create webhook subscription (Phase 6)
5. Run end-to-end test (Phase 7)

**Time**: ~35 minutes

**Total**: ~2-3 hours for full deployment

---

## 🚀 Common Scenarios

### Scenario 1: Deploy to Brand New Tenant

**Process**:

1. Use [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md)
2. Reference [TEAMS_CONFIGURATION_REPRODUCIBLE.md](./TEAMS_CONFIGURATION_REPRODUCIBLE.md) for detailed steps
3. Record values in [TEAMS_CONFIGURATION_CURRENT_REFERENCE.md](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md) (create new copy)
4. Run inventory to document

**Time**: 2-3 hours

---

### Scenario 2: Troubleshoot Current Deployment

**Process**:

1. Open [TEAMS_CONFIGURATION_CURRENT_REFERENCE.md](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md) for current values
2. Check against [TEAMS_CONFIGURATION_INDEX.md](./TEAMS_CONFIGURATION_INDEX.md#troubleshooting-quick-links) troubleshooting
3. Verify using checklist in [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md#phase-7-end-to-end-testing)

**Time**: Varies

---

### Scenario 3: Add New User to Allow-List

**Process**:

1. Open [TEAMS_CONFIGURATION_CURRENT_REFERENCE.md](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md)
2. Note the security group ID
3. Add user to group in Azure AD
4. Wait 60 minutes for policies to propagate
5. User sees Meeting Fetcher auto-pinned + auto-recording enabled

**Time**: <5 minutes + 60 min propagation

---

### Scenario 4: Replicate Setup in Another Tenant

**Process**:

1. Read [TEAMS_CONFIGURATION_CURRENT_REFERENCE.md](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md) (source tenant)
2. Follow [TEAMS_CONFIGURATION_REPRODUCIBLE.md](./TEAMS_CONFIGURATION_REPRODUCIBLE.md) (process)
3. Use [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md) (execution)
4. Create new [TEAMS_CONFIGURATION_CURRENT_REFERENCE.md](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md) (document)

**Time**: 2-3 hours

---

## 📖 Related Documentation

- **[CONFIGURATION.md](../CONFIGURATION.md)** — General project configuration (env setup, database, servers)
- **[SETUP_AND_AUTOMATION_GUIDE.md](./SETUP_AND_AUTOMATION_GUIDE.md)** — Bootstrap & automation options
- **[SECURITY_RECOMMENDATIONS.md](../SECURITY_RECOMMENDATIONS.md)** — Security best practices
- **[README.md](../README.md)** — Project overview & architecture

---

## 🔐 Security Note

**Never commit secrets to git**:

- Client secrets → use AWS Secrets Manager or Azure Key Vault
- Personal credentials → save locally in `.env.local` (git-ignored)
- API keys → use environment variables in Lambda config, not code

All documentation shows **how to configure securely** — follow those patterns.

---

## ❓ FAQ

### Q: Can I skip any phases?

**A**: No. All phases are required:

- **Phases 1-2**: Identity & access (required)
- **Phases 3-5**: Teams app & policies (required)
- **Phases 6-7**: Bot integration & testing (required)

### Q: How long does a full deployment take?

**A**: 2-3 hours with 2-3 people (Teams Admin, Identity Eng, Backend Eng)

### Q: Do I need to update docs after deployment?

**A**: Yes — create or update [TEAMS_CONFIGURATION_CURRENT_REFERENCE.md](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md) with your tenant values. Run `python scripts/teams/run-inventory.py` to auto-document.

### Q: What if something goes wrong?

**A**: See troubleshooting sections in:

- [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md#troubleshooting-quick-reference)
- [TEAMS_CONFIGURATION_INDEX.md](./TEAMS_CONFIGURATION_INDEX.md#troubleshooting-quick-links)

Or roll back using rollback procedure in [TEAMS_CONFIGURATION_REPRODUCIBLE.md](./TEAMS_CONFIGURATION_REPRODUCIBLE.md#rollback-procedure)

---

## 📞 Support

| Question        | Contact                   |
| --------------- | ------------------------- |
| Teams/policies  | Kobashi (Teams Architect) |
| Azure AD/app    | Identity Engineer         |
| Lambda/webhooks | Backend/DevOps Engineer   |

---

## 📅 Maintenance Schedule

- [ ] **Monthly**: Run inventory; check for drift
- [ ] **Quarterly**: Review & update documentation
- [ ] **Annually**: Rotate client secrets; review permissions

---

## Document Index

```
docs/
├── TEAMS_CONFIGURATION_INDEX.md ............... Central hub (start here)
├── TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md  Printable deployment guide
├── TEAMS_CONFIGURATION_REPRODUCIBLE.md ....... How to reproduce anywhere
├── TEAMS_CONFIGURATION_CURRENT_REFERENCE.md .. Current deployment state
├── TEAMS_BOT_SPEC.md ......................... Architecture & spec
├── TEAMS_INVENTORY_AUTOMATION.md ............. Automation scripts
├── COMMUNICATION_FLOW_DIAGRAMS.md ............ Message flows
└── README.md ................................ You are here
```

---

**Last Updated**: February 24, 2026  
**Owned By**: Kobashi (Teams Architect)  
**Next Review**: May 24, 2026 (quarterly)
