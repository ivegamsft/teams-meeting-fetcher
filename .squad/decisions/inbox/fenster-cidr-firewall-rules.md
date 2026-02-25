## Azure Firewall Rules: Use /24 CIDR, Not /32 Single IP

**By:** Fenster (DevOps/Infra)
**Date:** 2026-02-25

**Decision:** All Azure firewall rule management for GitHub Actions runners must use a /24 CIDR range derived from the detected runner IP, not a single /32 IP address.

**Rationale:**
- GitHub Actions runners use multiple outbound IPs from the same subnet (NAT pool)
- The IP returned by `api.ipify.org` may differ from the actual IP used for Azure API calls
- This caused `ForbiddenByFirewall` errors on Key Vault during Terraform plan (detected IP: `20.161.60.20`, actual API IP: `20.161.60.19`)
- A /24 CIDR covers all 256 IPs in the subnet, handling all runner outbound IPs

**Implementation:**
- Derive CIDR: `CIDR=$(echo "$IP" | sed 's/\.[0-9]*$/.0\/24/')`
- Use CIDR for `az keyvault network-rule add/remove`, `az storage account network-rule add/remove`, and `TF_VAR_allowed_ip_addresses`
- Applied to: `deploy-unified.yml`, `deploy-azure.yml`, `azure-resource-access.yml`, `azure-firewall-access/action.yml`

**Scope:** All workflows and actions that manage Azure resource firewalls for CI/CD runner access.
