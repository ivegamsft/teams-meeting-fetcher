# Teams Configuration Documentation Index

**Purpose**: Central reference for all Teams configuration documentation and deployment guidance.

**Audience**: Teams Architects, Deployment Engineers, QA, Developers

**Last Updated**: February 24, 2026  
**Maintained By**: Kobashi (Teams Architect)

---

## Quick Navigation

### I Need To...

| Task                                      | Document                                                    | Time    |
| ----------------------------------------- | ----------------------------------------------------------- | ------- |
| **Deploy to a new tenant**                | [Deployment Checklist](#deployment-checklist)               | 90 min  |
| **Understand what's currently deployed**  | [Current Reference](#current-reference)                     | 10 min  |
| **Reproduce the setup in another tenant** | [Reproducible Setup Guide](#reproducible-setup-guide)       | 2 hours |
| **Troubleshoot configuration issues**     | [See troubleshooting section](#troubleshooting-quick-links) | Varies  |
| **Understand the architecture**           | [TEAMS_BOT_SPEC.md](./TEAMS_BOT_SPEC.md)                    | 30 min  |
| **Auto-document current state**           | Run inventory script (below)                                | 15 min  |

---

## Documentation Landscape

### Core Configuration Documents

#### 1. Deployment Checklist

**File**: [TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md)

**Use this for**: Actual deployment to a new tenant  
**Format**: Printable step-by-step checklist with approval gates  
**Contains**:

- Pre-deployment verification (access, tools, approvals)
- 7 phases with specific action steps
- Values to record at each phase
- Sign-off section for deployment tracking
- Troubleshooting quick reference

**Best for**: Teams performing a live deployment  
**Print it**: Yes — designed for printing and checking off

---

#### 2. Reproducible Setup Guide

**File**: [TEAMS_CONFIGURATION_REPRODUCIBLE.md](./TEAMS_CONFIGURATION_REPRODUCIBLE.md)

**Use this for**: Understanding how to replicate setup in ANY tenant  
**Format**: Detailed technical reference with automation scripts  
**Contains**:

- Complete overview of tenant-scoped components
- Step-by-step instructions for all 6 phases
- Automated and manual approaches for each phase
- Configuration inventory table
- Multi-tenant deployment strategy
- Rollback procedures
- FAQ

**Best for**: Teams who need detailed understanding or are troubleshooting  
**Print it**: Optional — reference during deployment

---

#### 3. Current Deployment Reference

**File**: [TEAMS_CONFIGURATION_CURRENT_REFERENCE.md](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md)

**Use this for**: Understanding what's currently deployed  
**Format**: Snapshot of current tenant configuration  
**Contains**:

- Current tenant IDs and identifiers
- Azure AD app details (permissions, SPN)
- Teams manifest configuration (field by field)
- Teams policies currently in place
- Lambda environment variables
- API Gateway endpoints
- Webhook subscription status
- Infrastructure overview (AWS & Azure)

**Best for**: Reference during troubleshooting, validation checks, or planning changes  
**Print it**: Yes — handy as printed reference card

---

### Related Documentation

#### Architecture & Specification

- **[TEAMS_BOT_SPEC.md](./TEAMS_BOT_SPEC.md)** — System architecture, requirements, flow diagrams
- **[COMMUNICATION_FLOW_DIAGRAMS.md](./COMMUNICATION_FLOW_DIAGRAMS.md)** — Mermaid diagrams of message flows

#### General Configuration

- **[CONFIGURATION.md](../CONFIGURATION.md)** — General configuration guide (env files, database, server setup)
- **[SETUP_AND_AUTOMATION_GUIDE.md](./SETUP_AND_AUTOMATION_GUIDE.md)** — Automation options and setup paths

#### Inventory & Automation

- **[TEAMS_INVENTORY_AUTOMATION.md](./TEAMS_INVENTORY_AUTOMATION.md)** — How to run inventory scripts
- **[BOOTSTRAP_AND_INVENTORY_SYSTEM.md](../BOOTSTRAP_AND_INVENTORY_SYSTEM.md)** — Bootstrap automation reference

#### Security & Compliance

- **[AZURE_SPN_SECURITY.md](./AZURE_SPN_SECURITY.md)** — SPN security hardening, least privilege
- **[SECURITY_RECOMMENDATIONS.md](../SECURITY_RECOMMENDATIONS.md)** — Org-wide security best practices

---

## Automation & Inventory Scripts

### Run Inventory (Auto-Document Current State)

After deploying, document what you've built:

```bash
# In repo root:
python scripts/teams/run-inventory.py

# Outputs:
# - inventory/teams-config-inventory-{timestamp}.md (main doc)
# - inventory/*.json files (structured exports)
# - inventory/teams-config-inventory-{timestamp}.zip (backup archive)
```

**Use this to**:

- Create permanent record of your deployment
- Share configuration with new team members
- Back up configuration for disaster recovery
- Audit what's actually deployed vs. documented

---

### Automated Setup Scripts

| Script                             | Purpose                                 | Location         | Params                           |
| ---------------------------------- | --------------------------------------- | ---------------- | -------------------------------- |
| **bootstrap-azure-spn.ps1**        | Create Azure AD app & service principal | `scripts/setup/` | Tenant ID, app name              |
| **setup-teams-policies.ps1**       | Create & assign Teams policies          | `scripts/setup/` | Group ID, App ID, Catalog App ID |
| **create_webhook_subscription.py** | Create Graph subscription               | `scripts/graph/` | Tenant ID, Client ID, Secret     |
| **check_latest_webhook.py**        | Verify subscription active              | `scripts/graph/` | Tenant ID, Client ID, Secret     |
| **inventory-teams-config.py**      | Export configuration state              | `scripts/teams/` | Env vars                         |

---

## Configuration Inventory Table

### Components & Their Configuration Locations

| Component                     | Type           | Configured In                   | Where to Verify                          |
| ----------------------------- | -------------- | ------------------------------- | ---------------------------------------- |
| **Azure AD App**              | Infrastructure | bootstrap script or Portal      | Azure Portal → App registrations         |
| **Graph Permissions**         | IAM            | bootstrap script or Portal      | Azure Portal → API permissions           |
| **Security Group**            | IAM            | Portal or PowerShell            | Azure Portal → Groups                    |
| **Teams Manifest**            | Configuration  | `apps/teams-app/manifest*.json` | File + Teams Admin Center                |
| **Teams Policies**            | Policy         | setup-teams-policies.ps1        | Teams Admin Center → Policies            |
| **Application Access Policy** | Policy         | setup-teams-policies.ps1        | Teams Admin Center → Permission policies |
| **Lambda Env Vars**           | Configuration  | `.env.local` OR AWS Console     | Lambda function environment              |
| **Webhook Subscription**      | Integration    | create_webhook_subscription.py  | Graph API / DynamoDB                     |
| **DynamoDB Tables**           | Infrastructure | `iac/terraform.tfvars`          | AWS Console                              |
| **API Gateway**               | Infrastructure | Lambda configuration            | AWS Console                              |

---

## Typical Deployment Workflow

### New Tenant Deployment (First Time)

```
1. Read Deployment Checklist
   ↓
2. Verify prerequisites (Phase 1 pre-check)
   ↓
3. Execute Phase 1 (Azure AD App)
   ↓
4. Execute Phase 2 (Security Group)
   ↓
5. Execute Phase 3-5 (Teams Manifest + Policies)
   ↓
6. Execute Phase 6 (Lambda + Webhook)
   ↓
7. Execute Phase 7 (End-to-end testing)
   ↓
8. Sign off checklist
   ↓
9. Run inventory to document deployment
   ↓
10. Announce to organization
```

**Total Time**: ~2-3 hours  
**Facilitators**: 2-3 people (Teams Admin, Identity Engineer, Backend)

---

### Subsequent Deployment (Same Tenant, Code Update)

```
1. Update code / manifest files
   ↓
2. Push to git / deploy Lambda
   ↓
3. Re-upload Teams app (if manifest changed)
   ↓
4. Run quick validation tests (Phase 7)
   ↓
5. Run inventory to document changes
```

**Total Time**: ~30-60 minutes

---

### Different Tenant (Copy Configuration)

```
1. Open Current Reference for source tenant
   ↓
2. Follow Reproducible Setup Guide (uses same steps)
   ↓
3. Substitute values from source tenant reference
   ↓
4. Execute all phases
   ↓
5. Create new Current Reference for target tenant
```

**Total Time**: ~2-3 hours  
**Benefit**: Fully repeatable across organizations

---

## Configuration Change Procedure

### When Configuration Needs to Change

| Change                          | Procedure                       | Documents to Update             | Impact                                   |
| ------------------------------- | ------------------------------- | ------------------------------- | ---------------------------------------- |
| **Add user to allow-list**      | Azure Portal → Group → Members  | Current Reference               | Immediate; user gets policies in ~60 min |
| **Update Lambda endpoint**      | Update manifest + Lambda env    | Manifest, Current Reference     | Must re-upload Teams app                 |
| **Rotate client secret**        | Azure Portal; update Lambda env | Current Reference (secret date) | None if Lambda env updated correctly     |
| **Change policy names**         | Delete old policies; create new | Reproducible Guide, Scripts     | Must re-run Phase 5 script               |
| **Update app name/description** | Manifest file + re-upload       | Manifest, Current Reference     | Visual only; no functional impact        |
| **Add new Graph permission**    | Azure Portal → API permissions  | Reproducible Guide              | May require re-upload Teams app          |

---

## Troubleshooting Quick Links

### Common Issues

| Issue                      | Root Cause                           | Reference                         | Solution                                              |
| -------------------------- | ------------------------------------ | --------------------------------- | ----------------------------------------------------- |
| Users don't see bot pinned | Policy not applied; group membership | Checklist Phase 5 Troubleshooting | Verify group membership, wait 60 min, restart Teams   |
| No meeting notifications   | Webhook subscription expired         | Current Reference                 | Recreate subscription (Phase 6)                       |
| Recording doesn't start    | Bot can't join meeting               | Checklist Phase 7                 | Check GraphAPI permissions, Application Access Policy |
| Lambda returns 403 errors  | Client secret invalid or expired     | Current Reference                 | Verify env vars, rotate secret if needed              |
| Manifest validation fails  | JSON syntax error or invalid domain  | Reproducible Guide Phase 3        | Validate JSON, verify endpoint domain                 |

---

## Compliance & Auditing

### What Gets Logged

| Data                       | Location                        | Purpose                  |
| -------------------------- | ------------------------------- | ------------------------ |
| **Deployment checklist**   | Printed + filed                 | Proof of deployment      |
| **Inventory export**       | `inventory/` directory          | Configuration snapshot   |
| **Azure AD audit log**     | Azure Portal → Audit logs       | App registration changes |
| **Teams admin audit**      | Teams Admin Center → Audit logs | Policy changes           |
| **Lambda CloudWatch logs** | AWS CloudWatch → `/aws/lambda/` | Bot activity             |

### Recommended Audit Schedule

- [ ] **Monthly**: Run inventory to verify no unauthorized changes
- [ ] **Quarterly**: Review and update documentation
- [ ] **Annually**: Rotate client secrets, review permissions

---

## Multi-Tenant Scenarios

### Using Same Lambda for Multiple Tenants

**Strategy**: Deploy Lambda once; configure once per tenant; route by tenant ID

**Configuration differences per tenant**:

- Azure AD app + secret
- Security group ID
- Teams manifest + policies
- DynamoDB table (or shared table with tenant ID prefix)

**Shared across tenants**:

- Lambda code
- API Gateway
- GitHub workflows

**Setup**: Follow Reproducible Guide Phases 1-6 for each tenant  
**Isolation**: DynamoDB tables keyed by tenant ID

---

### Separate Lambda Per Tenant

**Strategy**: Full isolation; Lambda per AWS account or per Lambda environment

**Benefits**: Complete data/execution isolation  
**Drawbacks**: Duplicate infrastructure; higher cost

**Setup**: Same as above + deploy Lambda to separate AWS account/environment

---

## Document Maintenance

### How to Update These Docs

| Document               | When to Update                   | How                         |
| ---------------------- | -------------------------------- | --------------------------- |
| **Current Reference**  | After any config change          | Manual edit + git commit    |
| **Checklist**          | If process changes               | Edit phases; test new steps |
| **Reproducible Guide** | If any phase steps change        | Update specific phase; test |
| **This Index**         | Quarterly or if docs reorganized | Update navigation + links   |

### Change Procedure

1. [ ] Make change in documentation
2. [ ] Update "Last Updated" date
3. [ ] Update "Change Log" (if document has one)
4. [ ] Commit to git with message: `docs(teams): update [topic]`
5. [ ] Announce changes in team chat/email

---

## Appendix A: Quick Command Reference

### PowerShell Azure AD

```powershell
# List all groups
Get-AzureADGroup | Select DisplayName, ObjectId

# Get group members
Get-AzureADGroupMember -ObjectId <group-id> | Select UserPrincipalName

# Create group
New-AzADGroup -DisplayName "Group Name" -MailNickname "groupname" | Select Id
```

### PowerShell Teams

```powershell
# Connect
Connect-MicrosoftTeams

# List policies
Get-CsTeamsAppSetupPolicy | Select Identity, AppPresetList
Get-CsTeamsMeetingPolicy | Select Identity

# Verify Application Access Policy
Get-CsApplicationAccessPolicy | Select Identity, AllowedAadAppIds
```

### Azure CLI

```bash
# Get tenant ID
az account show --query tenantId

# Get current subscription
az account show --query name

# List app registrations
az ad app list --display-name "Teams Meeting" --output table
```

### Curl (Graph API)

```bash
# Get access token
TOKEN=$(az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv)

# Test access
curl -X GET "https://graph.microsoft.com/v1.0/me" \
  -H "Authorization: Bearer $TOKEN"

# List subscriptions
curl -X GET "https://graph.microsoft.com/v1.0/subscriptions" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Appendix B: File Structure

```
docs/
├── TEAMS_CONFIGURATION_REPRODUCIBLE.md .......... (THIS FILE) Complete setup guide
├── TEAMS_CONFIGURATION_CURRENT_REFERENCE.md .... Current tenant values
├── TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md . Printable checklist
├── TEAMS_CONFIGURATION_INDEX.md ................ You are here
├── TEAMS_BOT_SPEC.md ........................... Architecture & spec
├── TEAMS_INVENTORY_AUTOMATION.md ............... Inventory scripts
├── COMMUNICATION_FLOW_DIAGRAMS.md .............. Message flows
└── ... other docs

apps/teams-app/
├── manifest.json ............................... Production manifest
├── manifest-dev.json ........................... Dev manifest
├── icon-color.png .............................. App icon
└── icon-outline.png ............................ App outline

scripts/setup/
├── bootstrap-azure-spn.ps1 ..................... Create Azure AD app
└── setup-teams-policies.ps1 .................... Create policies

scripts/teams/
├── run-inventory.py ............................ Run full inventory
└── inventory-teams-config.py ................... Core inventory logic

scripts/graph/
├── create_webhook_subscription.py .............. Create webhook
└── check_latest_webhook.py ..................... Verify webhook

iac/
├── main.tf .................................... Root Terraform config
├── terraform.tfvars ............................ Variables (include tenant ID)
├── aws/ ........................................ AWS modules
└── azure/ ...................................... Azure modules
```

---

## Support & Escalation

### Who to Contact

| Issue            | Primary              | Escalation                  |
| ---------------- | -------------------- | --------------------------- |
| Teams policies   | Kobashi (Teams Arch) | Microsoft Teams Support     |
| Azure AD app     | Identity Engineer    | Microsoft Identity Support  |
| Lambda / AWS     | Backend Engineer     | AWS Support                 |
| Graph API access | Kobashi + Identity   | Microsoft Graph API Support |

### Response Time SLA

| Severity                               | SLA            |
| -------------------------------------- | -------------- |
| **Critical** (bot down, no recordings) | 30 minutes     |
| **High** (partial functionality)       | 2 hours        |
| **Medium** (minor issues)              | 1 business day |
| **Low** (documentation, UX)            | 1 week         |

---

## Examples & Templates

### Example: Deploy to Second Tenant

**Scenario**: You've deployed to Tenant A (prod) and now need Tenant B (support organization)

**Steps**:

1. Review [Current Reference](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md) for Tenant A (source)
2. Review [Reproducible Guide](./TEAMS_CONFIGURATION_REPRODUCIBLE.md) for step details
3. Follow [Deployment Checklist](./TEAMS_CONFIGURATION_DEPLOYMENT_CHECKLIST.md) with values from Tenant B
4. Create new [Current Reference](./TEAMS_CONFIGURATION_CURRENT_REFERENCE.md) for Tenant B
5. Run inventory to document Tenant B setup

---

## Change Log

| Date       | Version | Changed                                                 | Author  |
| ---------- | ------- | ------------------------------------------------------- | ------- |
| 2026-02-24 | 1.0     | Created comprehensive Teams configuration documentation | Kobashi |

---

## Version & Approval

| Field                | Value                     |
| -------------------- | ------------------------- |
| **Document Version** | 1.0                       |
| **Created**          | 2026-02-24                |
| **Last Updated**     | 2026-02-24                |
| **Owner**            | Kobashi (Teams Architect) |
| **Reviewed By**      | —                         |
| **Approved By**      | —                         |
| **Next Review Date** | 2026-05-24 (quarterly)    |

---

**For questions or updates**, open an issue in the repository or contact Kobashi (Teams Architect).
