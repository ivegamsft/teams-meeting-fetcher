## 2026-02-25: Cross-Cloud Resource Wiring Must Use Module Outputs

**By:** Fenster (DevOps/Infra)

**Decision:** When `iac/main.tf` passes Azure-created resource names to the AWS module, always use `module.azure.<output_name>`, never `var.<variable_name>` with manual defaults.

**Rationale:**
- The EventHub consumer group mismatch was caused by `iac/main.tf` passing `var.eventhub_consumer_group` (default `$Default`) instead of `module.azure.eventhub_lambda_consumer_group` (`lambda-processor`). The Lambda couldn't read messages because it was using the wrong consumer group.
- Variables with hardcoded defaults create silent drift between what Azure provisions and what AWS consumes. Module outputs are always in sync with the actual deployed state.
- This pattern already works correctly for `eventhub_namespace` and `eventhub_name` (lines 140-141 in main.tf use `module.azure.*`). The consumer group was the only one using a variable instead.

**Implementation:**
- `iac/main.tf` line 142: Changed from `var.eventhub_consumer_group` to `module.azure.eventhub_lambda_consumer_group`
- Updated all variable defaults from `$Default` to `lambda-processor` for standalone AWS usage
- Lambda code fix: replaced `.subscribe().catch()` with try-catch (subscribe returns Subscription, not Promise)

**Action Required:** Manually trigger `deploy-unified.yml` with `mode: apply` to push the env var change to the deployed Lambda function.

---
