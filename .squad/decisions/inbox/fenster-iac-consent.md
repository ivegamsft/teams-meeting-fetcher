## 2026-02-27: IaC Manages Graph API Admin Consent (Not CLI)

**By:** Fenster (DevOps/Infra)

**Decision:** All Microsoft Graph API permission grants (admin consent) MUST be managed through Terraform `azuread_app_role_assignment` resources — never via `az` CLI or Azure Portal manual clicks.

**Rationale:**
- McManus previously used `az` CLI to add/remove Graph permissions, causing state drift between what Terraform knows and what Azure has
- This led to "Not granted" entries in the Portal, stale "Other permissions", and general confusion about what's actually consented
- IaC is the single source of truth: `terraform apply` now declares permissions AND grants consent in one step
- The `grant-graph-permissions.ps1` script is demoted to bootstrap/fallback only

**Implementation:**
- `iac/azure/modules/azure-ad/main.tf` now has:
  - `data.azuread_service_principal.graph` — looks up Microsoft Graph SP at plan time
  - `azuread_app_role_assignment.tmf_graph_consent` — 6 permission grants for TMF SPN
  - `azuread_app_role_assignment.bot_graph_consent` — 5 permission grants for Bot SPN
  - `var.grant_admin_consent` (default true) — escape hatch if deployment SPN lacks permissions
- `Subscription.ReadWrite.All` removed — GUID `482be48f-8d13-42ab-b51e-677fdd881820` is NOT a valid Graph application permission (confirmed via MS Graph permissions reference; only delegated `Subscription.Read.All` exists)
- Deployment SPN requires `Application.Read.All` (already satisfied by `Application.ReadWrite.All` needed for app registration management)

**Impact:** Next `terraform apply` will create 11 new `azuread_app_role_assignment` resources (6 TMF + 5 Bot) and remove the `Subscription.ReadWrite.All` declaration from the TMF app registration.

---
