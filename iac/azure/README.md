# Azure IaC

Terraform deployment for the full Azure infrastructure (Container Apps, VNet, ACR, Key Vault, Storage, Event Grid, App Insights).

Spec reference: [specs/infrastructure-terraform-spec.md](../../specs/infrastructure-terraform-spec.md)

Planned contents:

- main.tf
- variables.tf
- outputs.tf
- providers.tf
- modules/

Generate local environment file after apply:

```powershell
./scripts/generate-azure-env.ps1
```

```bash
./scripts/generate-azure-env.sh
```
