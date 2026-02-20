# Infrastructure as Code (IaC) — DEPRECATED

⚠️ **DEPRECATED — DO NOT USE THIS FOLDER FOR DEPLOYMENTS**

This folder contains old separate Terraform deployments split by cloud provider. **These should not be used anymore.**

## ⛔ DO NOT USE

The `iac/` folder is DEPRECATED. Using `iac/azure/` or `iac/aws/` will:

- ❌ Create duplicate Azure AD apps and security groups
- ❌ Create duplicate Lambda functions and API Gateways
- ❌ Create conflicting Terraform state files
- ❌ Cause unnecessary costs

## ✅ USE `infra/` INSTEAD

**All deployments now use the unified `infra/` directory** which manages both Azure and AWS together.

See [../infra/README.md](../infra/README.md) for the correct deployment approach.

---

## Legacy Structure (DO NOT USE)

For reference only:

```
iac/
├── azure/  # ⛔ OLD Azure-only deployment (DEPRECATED)
└── aws/    # ⛔ OLD AWS-only deployment (DEPRECATED)
```

## Previous References

If you see documentation mentioning:

- `iac/azure/terraform apply`
- `iac/aws/terraform apply`
- Separate Azure and AWS deployments

**IGNORE IT.** Use the unified [../infra/](../infra/) folder instead.

## Cleanup

If resources were deployed from this folder, delete the duplicates:

1. Check what was deployed: `terraform state list` (in the old folders)
2. Delete duplicates from Azure Portal and AWS Console
3. Run `rm -Force terraform.tfstate*` and `rm -Force .terraform` to clean up old state files
4. Deploy correctly from `infra/` folder instead
