## Decision: Never add keepers to random_string.suffix

**By:** Fenster (DevOps/Infra)
**Date:** 2026-02-26

**Decision:** The `random_string.suffix` resource in `iac/azure/main.tf` must NEVER have a `keepers` block. Adding keepers forces suffix regeneration, which cascades to destroy/recreate ALL Azure resources that embed the suffix (storage account, key vault, resource group, etc.).

**Context:** Commit daf35c7 added `keepers = { environment, base_name }` to the suffix, random_pet, and random_password resources. This caused the deploy-unified plan to fail with "Instance cannot be destroyed" because the Azure Storage Account has `lifecycle.prevent_destroy = true`.

**Fix applied:** Removed all three `keepers` blocks. The suffix is meant to be generated once and remain stable.

**Rule:** If you need environment-specific resource isolation, use separate Terraform workspaces or state files — never change the random suffix.
