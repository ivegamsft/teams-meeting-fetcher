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
# Expected: 62837751-4e48-4d06-8bcb-57be1a669b78

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

**TLDR: `infra/` only. Always. No exceptions.**
