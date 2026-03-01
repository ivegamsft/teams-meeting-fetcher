# Deployment Rules - READ THIS FIRST

## The Law of the Land

### 1. **ONLY use `iac/` for deployments**

```
✅ CORRECT:   cd iac && terraform plan && terraform apply
❌ WRONG:     cd iac/azure && terraform apply
❌ WRONG:     cd iac/aws && terraform apply
```

### 2. **Structure: Single `iac/` folder contains everything**

```
iac/                          ← DEPLOY FROM HERE (unified orchestration + modules)├── main.tf                     Orchestrates ./azure + ./aws
├── variables.tf
├── outputs.tf
├── terraform.tfvars
├── terraform.tfstate          Unified state file
│
├── azure/                      Module library (called by main.tf)
│   ├── main.tf
│   └── modules/
│
└── aws/                        Module library (called by main.tf)
    ├── main.tf
    └── modules/
```

**NOT** two separate folders. Everything in one place.

### 3. **Why this matters**

**Violating these rules causes:**

- ❌ Separate state files (confusion & data loss)
- ❌ Deployments that fail mid-way (broken dependencies)
- ❌ Inability to manage resources together

### 4. **The unified deployment model**

All in one place:

```
cd iac
terraform init       # First time
terraform plan       # Review Azure + AWS changes
terraform apply      # Deploy both clouds together
```

**That's it. One folder. One deployment.**

### 5. **Deployment checklist**

Before running any terraform command:

```bash
# 1. Navigate to iac/ (THE ONLY DEPLOYMENT FOLDER)
cd iac

# 2. Verify you're in the right place
pwd  # should end with /iac

# 3. Verify correct tenant (for Azure changes only)
az account show --query "tenantId" --output tsv
# Expected: <YOUR_TENANT_ID>

# 4. Initialize (first time only)
terraform init

# 5. Review the plan
terraform plan

# 6. Apply
terraform apply
```

### 6. **Key files in iac/**

- `main.tf` - Unified orchestration (calls ./azure and ./aws)
- `terraform.tfvars` - Configuration (edit this for your values)
- `terraform.tfstate` - Single unified state file
- `azure/` - Azure module library
- `aws/` - AWS module library

### 7. **If you see old iac/azure or iac/aws state files**

Those are just **modules** - ignore them. The real state is `iac/terraform.tfstate`.

### 8. **Reference**

- Deployment guide: [iac/README.md](iac/README.md)
- Copilot rules: [.github/copilot-instructions.md](.github/copilot-instructions.md)
- Copilot rules: [.github/copilot-instructions.md](.github/copilot-instructions.md)

---

## Azure Security Rules

### 9. **RBAC-only authentication — no key-based access**

All Azure resources use RBAC (role-based access control) exclusively:

- Key Vault: `rbac_authorization_enabled = true` (no access policies)
- Storage Account: `shared_access_key_enabled = false` (no connection strings)
- Event Hub: `local_auth_enabled = false` (no SAS tokens)

**Never** enable key-based auth, generate SAS tokens, or use connection strings for authentication. All access must go through Azure AD / RBAC role assignments.

### 10. **Firewall rules — default Deny, specific IPs only**

Key Vault and Storage Account firewalls are set to `default_action = "Deny"`. Only approved IPs and Azure-trusted services are allowed through.

**Do NOT** change `default_action` to `Allow` unless public access is being intentionally disabled entirely. Use specific IP rules only.

### 11. **CI/CD runner firewall management pattern**

When a GitHub Actions workflow needs to access a firewalled resource:

```
1. Use a SINGLE JOB (runner IP changes between jobs)
2. Get runner IP:  curl -s https://api.ipify.org
3. Add IP to firewall:  az keyvault network-rule add / az storage account network-rule add
4. Do work (Terraform, secret reads, blob ops)
5. ALWAYS remove IP:  use  if: always()  to ensure cleanup even on failure
```

**Rules:**

- Check `defaultAction` before modifying — skip if the resource is not firewalled
- Every firewall add **must** have a corresponding remove in the same job
- Log the IP being added/removed for audit trail
- Use `az` CLI for firewall changes, **not** Terraform (avoids state conflicts)
- Wait ~15 seconds after adding an IP for propagation
- The remove step must use `|| true` to avoid failing on already-removed IPs

### 12. **Private link recommendation**

For production deployments, use Azure Private Link endpoints for Key Vault and Storage Account access from Azure-hosted services (Container Apps, Functions). The firewall pattern above is for CI/CD runners that run on GitHub-hosted infrastructure outside Azure.

---

**TLDR: `infra/` only. Always. No exceptions.**
