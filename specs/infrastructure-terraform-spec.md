# Teams Meeting Fetcher - Infrastructure as Code (Terraform)

Complete Terraform infrastructure specification for deploying Teams Meeting Fetcher on Azure with enterprise-grade security, networking, and observability.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Networking Design](#networking-design)
3. [Resource Specifications](#resource-specifications)
4. [Security Architecture](#security-architecture)
5. [RBAC Configuration](#rbac-configuration)
6. [Private Endpoints](#private-endpoints)
7. [Monitoring & Logging](#monitoring--logging)
8. [Best Practices Applied](#best-practices-applied)
9. [Resource Naming Convention](#resource-naming-convention)
10. [Terraform Variables](#terraform-variables)
11. [Terraform Outputs](#terraform-outputs)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Azure Subscription                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Resource Group (RG)                             │   │
│  │              Location: [selected-region]                     │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │  Virtual Network (VNet)                              │  │   │
│  │  │  CIDR: 10.0.0.0/16                                  │  │   │
│  │  ├──────────────────────────────────────────────────────┤  │   │
│  │  │ Subnet: ContainerApps      (10.0.1.0/24)            │  │   │
│  │  │ Subnet: PrivateEndpoints   (10.0.2.0/24)            │  │   │
│  │  │ Subnet: Integration        (10.0.3.0/24)            │  │   │
│  │  │ Subnet: Bastion            (10.0.4.0/26) [optional] │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                              │   │
│  │  ┌──────────────────┐  ┌──────────────────┐               │   │
│  │  │  Container App   │  │  Key Vault       │               │   │
│  │  │  Environment     │  │  (Secrets)       │               │   │
│  │  │  (Managed        │  │  (Config)        │               │   │
│  │  │   Identity)      │  │                  │               │   │
│  │  └──────────────────┘  └──────────────────┘               │   │
│  │                                                              │   │
│  │  ┌──────────────────┐  ┌──────────────────┐               │   │
│  │  │  ACR             │  │  Blob Storage    │               │   │
│  │  │  (Images)        │  │  (Logs/Data)     │               │   │
│  │  └──────────────────┘  └──────────────────┘               │   │
│  │                                                              │   │
│  │  ┌──────────────────┐  ┌──────────────────┐               │   │
│  │  │  Event Grid      │  │  Log Analytics   │               │   │
│  │  │  (Notifications) │  │  (Observability) │               │   │
│  │  └──────────────────┘  └──────────────────┘               │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │  Private Endpoints Subnet                            │  │   │
│  │  │  • ACR PE                                            │  │   │
│  │  │  • Key Vault PE                                      │  │   │
│  │  │  • Blob Storage PE                                   │  │   │
│  │  │  • Event Grid PE                                     │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Private DNS Zones (per service):                                   │
│  • privatelink.azurecr.io                                          │
│  • privatelink.vaultcore.azure.net                                 │
│  • privatelink.blob.core.windows.net                               │
│  • privatelink.eventgrid.azure.net                                 │
│  • privatelink.monitor.azure.com (Log Analytics)                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Networking Design

### VNet Structure

```
VNet: 10.0.0.0/16
├── ContainerApps Subnet: 10.0.1.0/24 (250 IPs)
│   └── Used by: Container App Environment
│       NSG: Allow outbound to Private Endpoints subnet
│
├── PrivateEndpoints Subnet: 10.0.2.0/24 (250 IPs)
│   └── Used by: ACR PE, Key Vault PE, Blob Storage PE, Event Grid PE
│       NSG: Allow inbound from ContainerApps & Integration subnets
│
├── Integration Subnet: 10.0.3.0/24 (250 IPs)
│   └── Used by: Future service integrations, admins
│       NSG: Allow outbound to Private Endpoints & Azure services
│
└── Bastion Subnet: 10.0.4.0/26 (62 IPs) [OPTIONAL]
    └── Used by: Azure Bastion for secure admin access
        NSG: Allow RDP/SSH from Internet (guarded by Bastion)
```

### Subnet Design Rationale

| Subnet | CIDR | Hosts | Purpose | NSG |
|--------|------|-------|---------|-----|
| ContainerApps | 10.0.1.0/24 | 250 | Container App instances | Egress only to PE subnet |
| PrivateEndpoints | 10.0.2.0/24 | 250 | Hosts all private endpoints | Ingress from CA & Integ subnets |
| Integration | 10.0.3.0/24 | 250 | Developer workstations, future services | Flexible, outbound to PEs |
| Bastion | 10.0.4.0/26 | 62 | Azure Bastion host | Standard Bastion NSG |

---

## Resource Specifications

### 1. Resource Group

```hcl
resource "azurerm_resource_group" "main" {
  name     = "rg-${var.environment}-${var.region_short}"
  location = var.azure_region
  
  tags = local.common_tags
}
```

**Properties**:
- **Location**: Variable (user-selected)
- **Tags**: Applied to all resources (environment, project, cost-center, managed-by)

---

### 2. Virtual Network (VNet)

```hcl
resource "azurerm_virtual_network" "main" {
  name                = "vnet-${var.environment}-${var.region_short}"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  tags = local.common_tags
}
```

**Properties**:
- **Address Space**: 10.0.0.0/16 (65,536 IPs)
- **Subnets**: 4 subnets (see Networking Design)
- **DNS**: Azure-provided DNS
- **DDoS Protection**: Standard (included)

---

### 3. Subnets

```hcl
resource "azurerm_subnet" "containerapps" {
  name                 = "snet-${var.environment}-ca"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
  
  delegation {
    name = "delegation"
    service_delegation {
      name = "Microsoft.App/environments"
    }
  }
}

resource "azurerm_subnet" "private_endpoints" {
  name                 = "snet-${var.environment}-pe"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.2.0/24"]
  
  private_endpoint_network_policies_enabled = true
  private_link_service_network_policies_enabled = true
}

resource "azurerm_subnet" "integration" {
  name                 = "snet-${var.environment}-integ"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.3.0/24"]
}

resource "azurerm_subnet" "bastion" {
  name                 = "AzureBastionSubnet"  # Must be this exact name
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.4.0/26"]
}
```

---

### 4. Network Security Groups (NSGs)

#### ContainerApps NSG

```
Inbound Rules:
- DENY All

Outbound Rules:
- ALLOW TCP/UDP to 10.0.2.0/24 (Private Endpoints subnet)
- ALLOW TCP to 443 (HTTPS - for Graph API, Azure services)
- ALLOW TCP to 53 (DNS)
- DENY All else
```

#### PrivateEndpoints NSG

```
Inbound Rules:
- ALLOW TCP/UDP from 10.0.1.0/24 (ContainerApps subnet)
- ALLOW TCP/UDP from 10.0.3.0/24 (Integration subnet)
- DENY All else

Outbound Rules:
- ALLOW All
```

#### Integration NSG

```
Inbound Rules:
- ALLOW RDP/SSH from 10.0.4.0/26 (Bastion subnet)
- DENY All else

Outbound Rules:
- ALLOW to 10.0.2.0/24 (Private Endpoints)
- ALLOW TCP to 443 (HTTPS)
- ALLOW TCP to 53 (DNS)
- DENY All else
```

---

### 5. Container App Environment

```hcl
resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${var.environment}-${var.region_short}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  infrastructure_subnet_id   = azurerm_subnet.containerapps.id
  
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  
  internal_load_balancer_enabled = true
  
  tags = local.common_tags
}
```

**Properties**:
- **Infrastructure Subnet**: Dedicated subnet for workload scaling
- **Log Analytics**: Connected for all diagnostics
- **Internal Load Balancer**: Enabled (workload accessible only within VNet)
- **Managed Identity**: Assigned at Container App level

**Note**: Container App will use User-Assigned Managed Identity (created separately) for accessing Key Vault, ACR, and Blob Storage

---

### 6. Container Registry (ACR)

```hcl
resource "azurerm_container_registry" "main" {
  name                = "acr${var.environment}${var.region_short}${random_string.acr_suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  sku                 = "Premium"  # Required for private endpoints
  admin_enabled       = false       # Use RBAC + Managed Identity only
  
  public_network_access_enabled = false  # Requires private endpoint
  
  tags = local.common_tags
}
```

**Properties**:
- **SKU**: Premium (required for private endpoints)
- **Admin Account**: Disabled (use managed identity instead)
- **Public Access**: Disabled (force private endpoint)
- **Encryption**: Customer-managed keys (CMK) supported but optional
- **Image Retention**: 30 days (configurable)

---

### 7. Key Vault

```hcl
resource "azurerm_key_vault" "main" {
  name                = "kv-${var.environment}-${var.region_short}-${random_string.kv_suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  
  sku_name = "premium"  # For HSM, use: "premium" (or "standard" for non-HSM)
  
  enabled_for_disk_encryption = false
  enabled_for_deployment      = false
  enabled_for_template_deployment = false
  
  public_network_access_enabled = false  # Requires private endpoint
  rbac_authorization_enabled    = true   # Use RBAC instead of access policies
  
  purge_protection_enabled   = true      # Prevent accidental deletion
  soft_delete_retention_days = 90        # Retention period
  
  network_rules {
    bypass = "AzureServices"
    default_action = "Deny"
    virtual_network_subnet_ids = [azurerm_subnet.integration.id]
  }
  
  tags = local.common_tags
}
```

**Properties**:
- **SKU**: Premium (recommended for production)
- **RBAC**: Enabled (no access policies)
- **Public Access**: Disabled (private endpoint only)
- **Purge Protection**: Enabled (prevent accidental deletion)
- **Soft Delete**: 90 days retention
- **Network Rules**: Only allow from Integration subnet + Azure services (Microsoft-hosted services)

**Stored Secrets** (via Terraform):
- `graph-tenant-id` → Entra tenant ID
- `graph-client-id` → App registration client ID
- `graph-client-secret` → Client secret
- `entra-group-id` → Target monitoring group ID
- `webhook-auth-secret` → Random Bearer token for webhooks
- `database-connection-string` → SQLite or PostgreSQL connection

---

### 8. Storage Account (Blob Storage)

```hcl
resource "azurerm_storage_account" "main" {
  name                     = "st${var.environment}${var.region_short}${random_string.storage_suffix.result}"
  location                 = azurerm_resource_group.main.location
  resource_group_name      = azurerm_resource_group.main.name
  account_tier             = "Standard"
  account_replication_type = "GRS"  # Geo-redundant
  
  https_only                     = true
  min_tls_version                = "TLS1_2"
  public_network_access_enabled  = false  # Requires private endpoint
  
  identity {
    type = "SystemAssigned"
  }
  
  network_rules {
    default_action             = "Deny"
    bypass                     = ["AzureServices"]
    virtual_network_subnet_ids = [azurerm_subnet.integration.id]
  }
  
  tags = local.common_tags
}

resource "azurerm_storage_container" "logs" {
  name                  = "meeting-fetcher-logs"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}

resource "azurerm_storage_container" "transcriptions" {
  name                  = "transcriptions"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"
}
```

**Properties**:
- **Tier**: Standard
- **Replication**: GRS (Geo-redundant for HA)
- **HTTPS Only**: Enforced
- **Public Access**: Disabled (private endpoint only)
- **Network Rules**: Only Integration subnet + Azure services
- **Containers**: 
  - `meeting-fetcher-logs` → App logs
  - `transcriptions` → Long-term transcript storage

**Lifecycle Policies**:
- Archive logs after 30 days
- Delete logs after 365 days

---

### 9. Event Grid Namespace (for webhooks)

```hcl
resource "azurerm_eventgrid_topic" "main" {
  name                = "evgt-${var.environment}-${var.region_short}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  public_network_access_enabled = false  # Requires private endpoint
  
  identity {
    type = "SystemAssigned"
  }
  
  network_rules {
    public_network_access = "Disabled"
  }
  
  tags = local.common_tags
}
```

**Properties**:
- **Public Access**: Disabled (private endpoint only)
- **Purpose**: Forward Graph API webhook notifications internally if needed
- **Alternative**: Can use Service Bus or Event Hubs instead

---

### 10. Application Insights / Log Analytics

```hcl
resource "azurerm_log_analytics_workspace" "main" {
  name                = "law-${var.environment}-${var.region_short}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  sku               = "PerGB2018"
  retention_in_days = 30  # Adjust as needed
  
  tags = local.common_tags
}

resource "azurerm_application_insights" "main" {
  name                = "appi-${var.environment}-${var.region_short}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  application_type    = "web"
  
  workspace_id = azurerm_log_analytics_workspace.main.id
  
  tags = local.common_tags
}
```

**Properties**:
- **Log Analytics**: Central logging workspace
- **App Insights**: Connected to Log Analytics (no separate costs)
- **Retention**: 30 days (configurable)
- **Ingestion**: 2GB/day included, pay-per-GB after

---

### 11. User-Assigned Managed Identity

```hcl
resource "azurerm_user_assigned_identity" "container_app" {
  name                = "msi-${var.environment}-ca"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  tags = local.common_tags
}
```

**Purpose**: Used by Container App to authenticate to:
- ACR (pull images)
- Key Vault (read secrets)
- Storage Account (write logs)
- Event Grid (publish events)

---

### 12. Entra Group and App Registration

#### 12.1 Entra Group (Data Source or Resource)

**Option A: Reference Existing Group (Recommended)**

```hcl
data "azuread_group" "monitoring_target" {
  display_name = var.entra_group_name
}
```

**Option B: Create New Group**

```hcl
resource "azuread_group" "monitoring_target" {
  display_name       = "Teams-Meeting-Fetcher-${var.environment}"
  description        = "Target group for Teams Meeting Fetcher monitoring"
  security_enabled   = true
  mail_enabled       = false
  
  owners = [data.azurerm_client_config.current.object_id]
}

locals {
  entra_group_id = try(azuread_group.monitoring_target.id, data.azuread_group.monitoring_target.id)
}
```

**Purpose**: Specifies which Entra group members' Teams meetings are monitored

---

#### 12.2 Azure AD Application (App Registration)

```hcl
resource "azuread_application" "main" {
  display_name = "teams-meeting-fetcher-${var.environment}"
  
  description = "Teams Meeting Fetcher webhook and Graph API client"
  
  web {
    redirect_uris = [
      "https://${var.webhook_domain}/auth/callback"
    ]
    
    implied_redirect_uris = [
      "https://${var.webhook_domain}"
    ]
  }
  
  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000"  # Microsoft Graph
    
    resource_access {
      id   = "e1fe6dd8-ba31-4d61-89e7-88639da4683d"  # User.Read (Delegated)
      type = "Scope"
    }
    
    resource_access {
      id   = "5f8c8dbb-01c1-4f79-83c8-a80a4ce7e231"  # GroupMember.Read.All (Application)
      type = "Role"
    }
    
    resource_access {
      id   = "2ba27b99-cd9d-430e-b8ad-8f8e5ccc726c"  # Calendars.Read.All (Application)
      type = "Role"
    }
    
    resource_access {
      id   = "dfabfca4-ee0f-4218-b897-c24fb2fb4698"  # OnlineMeetingRecording.Read.All (Application)
      type = "Role"
    }
    
    resource_access {
      id   = "d55c4eca-6f3f-4d6a-b7bd-dc7c28c3906e"  # CallTranscripts.Read.All (Application)
      type = "Role"
    }
  }
  
  owners = [data.azurerm_client_config.current.object_id]
}
```

**Properties**:
- **Display Name**: Unique, environment-tagged
- **Redirect URIs**: For future UI integration
- **Required Resource Access**: 
  - `User.Read` (delegated) - Minimal user info
  - `GroupMember.Read.All` (application) - Read group membership to enumerate users
  - `Calendars.Read.All` (application) - Read user calendar events to track meetings
  - `OnlineMeetingRecording.Read.All` (application) - Access to meeting recordings
  - `CallTranscripts.Read.All` (application) - Access to call transcripts

---

#### 12.3 Service Principal

```hcl
resource "azuread_service_principal" "main" {
  client_id = azuread_application.main.client_id
  
  app_role_assignment_required = false
  
  owners = [data.azurerm_client_config.current.object_id]
  
  tags = ["teams-meeting-fetcher"]
}
```

**Purpose**: Represents application identity in Azure AD for Graph API authentication

---

#### 12.4 Client Secret

```hcl
resource "azuread_application_password" "main" {
  application_id    = azuread_application.main.id
  display_name      = "graph-api-secret-${var.environment}"
  end_date_relative = "8760h"  # 1 year
}

resource "azurerm_key_vault_secret" "graph_client_secret" {
  name            = "graph-client-secret"
  value           = azuread_application_password.main.value
  key_vault_id    = azurerm_key_vault.main.id
  
  depends_on = [azurerm_role_assignment.kv_secrets_officer]
  
  tags = local.common_tags
}
```

**Properties**:
- **Rotation**: 1 year (set reminder for renewal 30 days before expiry)
- **Storage**: Immediately stored in Key Vault (secret never exposed in code/state)
- **Container App Access**: Retrieved via managed identity at startup

---

#### 12.5 API Permissions Grant (Admin Consent)

```hcl
# This requires admin consent - typically done manually or with Azure CLI
# az ad app permission admin-consent --id ${APPLICATION_ID}

# Alternatively, use this resource if your Terraform service principal has admin consent delegation
resource "azuread_service_principal_delegated_permission_grant" "graph" {
  service_principal_id          = azuread_service_principal.main.id
  resource_service_principal_id = azuread_service_principal.msgraph.id
  claim_values                  = ["User.Read"]
}

# For application permissions (OnlineMeetingRecording.Read.All, etc.)
resource "azuread_app_role_assignment" "graph_group_member_read" {
  app_role_id         = "5f8c8dbb-01c1-4f79-83c8-a80a4ce7e231"  # GroupMember.Read.All
  principal_object_id = azuread_service_principal.main.object_id
  resource_object_id  = azuread_service_principal.msgraph.object_id
}

resource "azuread_app_role_assignment" "graph_calendars_read" {
  app_role_id         = "2ba27b99-cd9d-430e-b8ad-8f8e5ccc726c"  # Calendars.Read.All
  principal_object_id = azuread_service_principal.main.object_id
  resource_object_id  = azuread_service_principal.msgraph.object_id
}

resource "azuread_app_role_assignment" "graph_recording_read" {
  app_role_id         = "dfabfca4-ee0f-4218-b897-c24fb2fb4698"  # OnlineMeetingRecording.Read.All
  principal_object_id = azuread_service_principal.main.object_id
  resource_object_id  = azuread_service_principal.msgraph.object_id
}

resource "azuread_app_role_assignment" "graph_transcript_read" {
  app_role_id         = "d55c4eca-6f3f-4d6a-b7bd-dc7c28c3906e"  # CallTranscripts.Read.All
  principal_object_id = azuread_service_principal.main.object_id
  resource_object_id  = azuread_service_principal.msgraph.object_id
}

# Data source for Microsoft Graph service principal
data "azuread_service_principal" "msgraph" {
  client_id = "00000003-0000-0000-c000-000000000000"  # Microsoft Graph
}
```

**Note**: Application permissions must be granted by tenant admin. If Terraform runs with insufficient permissions, this step may need manual completion via Azure Portal or Azure CLI.

---

#### 12.6 Key Vault Secrets (Graph Configuration)

```hcl
resource "azurerm_key_vault_secret" "graph_tenant_id" {
  name         = "graph-tenant-id"
  value        = data.azurerm_client_config.current.tenant_id
  key_vault_id = azurerm_key_vault.main.id
  
  tags = local.common_tags
}

resource "azurerm_key_vault_secret" "graph_client_id" {
  name         = "graph-client-id"
  value        = azuread_application.main.client_id
  key_vault_id = azurerm_key_vault.main.id
  
  tags = local.common_tags
}

resource "azurerm_key_vault_secret" "entra_group_id" {
  name         = "entra-group-id"
  value        = local.entra_group_id
  key_vault_id = azurerm_key_vault.main.id
  
  tags = local.common_tags
}

resource "azurerm_key_vault_secret" "webhook_auth_secret" {
  name         = "webhook-auth-secret"
  value        = random_password.webhook_secret.result
  key_vault_id = azurerm_key_vault.main.id
  
  tags = local.common_tags
}

# Generate random webhook auth secret
resource "random_password" "webhook_secret" {
  length  = 32
  special = true
}
```

---

### 13. Private Endpoints & Private DNS Zones

```hcl
# ACR Private Endpoint
resource "azurerm_private_endpoint" "acr" {
  name                = "pe-acr-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.private_endpoints.id
  
  private_service_connection {
    name                           = "psc-acr"
    is_manual_connection           = false
    private_connection_resource_id = azurerm_container_registry.main.id
    subresource_names              = ["registry"]
  }
  
  private_dns_zone_group {
    name                 = "default"
    private_dns_zone_ids = [azurerm_private_dns_zone.acr.id]
  }
}

# Private DNS Zone for ACR
resource "azurerm_private_dns_zone" "acr" {
  name                = "privatelink.azurecr.io"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "acr" {
  name                  = "vnet-link-acr"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.acr.name
  virtual_network_id    = azurerm_virtual_network.main.id
}

# [Repeat for Key Vault, Storage, Event Grid private endpoints]
```

**Private DNS Zones Required**:
| Service | Private DNS Zone | Endpoint Subnet |
|---------|-----------------|-----------------|
| ACR | privatelink.azurecr.io | Private Endpoints |
| Key Vault | privatelink.vaultcore.azure.net | Private Endpoints |
| Blob Storage | privatelink.blob.core.windows.net | Private Endpoints |
| Event Grid | privatelink.eventgrid.azure.net | Private Endpoints |
| Log Analytics | privatelink.monitor.azure.com | Private Endpoints |

---

## Security Architecture

### Zero-Trust Principles Applied

```
┌──────────────────────────────────┐
│  Identity Verification (RBAC)    │
│  • All access via Managed ID     │
│  • No storage keys or secrets    │
│  • Short-lived token scopes      │
└──────────────────────────────────┘
              ↓
┌──────────────────────────────────┐
│  Least Privilege Access          │
│  • Container App = Read-only ACR │
│  • Container App = Secrets read  │
│  • Only what's needed, nothing   │
└──────────────────────────────────┘
              ↓
┌──────────────────────────────────┐
│  Network Segmentation            │
│  • Private Endpoints only        │
│  • No public internet access     │
│  • NSGs restrict all traffic     │
└──────────────────────────────────┘
              ↓
┌──────────────────────────────────┐
│  Encryption in Transit & Rest    │
│  • TLS 1.2+ only                 │
│  • HTTPS enforced                │
│  • Secrets in Key Vault (HSM)    │
└──────────────────────────────────┘
```

### Secrets Management

**NO secrets in code, env files, or terraform state**

All secrets stored in Key Vault:
```
graph-client-secret
  → Used by: Container App
  → Rotation: Every 90 days (admin task)

webhook-auth-secret
  → Used by: API Manager/nginx
  → Rotation: Every 30 days (admin task)

database-connection-string
  → Used by: Container App
  → Stored in Key Vault
  → Retrieved at runtime
```

Container App retrieves secrets at startup via managed identity.

---

## RBAC Configuration

### Managed Identity Roles

#### Container App Managed Identity (msi-container-app)

```
Role Assignments:
1. AcrPull (ACR)
   Scope: Container Registry
   Purpose: Pull container images

2. Key Vault Secrets User (Key Vault)
   Scope: Key Vault
   Purpose: Read secrets (client secret, webhook secret, etc.)

3. Storage Blob Data Contributor (Storage Account)
   Scope: Storage Account
   Purpose: Write logs and transcriptions

4. EventGrid Data Sender (Event Grid)
   Scope: Event Grid Topic
   Purpose: Publish events
```

#### Graph API Authentication (Service Principal)

```
Service Principal: teams-meeting-fetcher-${environment}

Application Permissions (require admin consent):
1. OnlineMeetingRecording.Read.All
   Purpose: Fetch meeting recordings from scheduled meetings

2. CallTranscripts.Read.All
   Purpose: Fetch transcription availability and content

3. User.Read (Delegated)
   Purpose: Minimal user information (rarely used)

Authentication Flow:
1. Container App retrieves client_id and client_secret from Key Vault
   (via managed identity - no keys in code)
2. Calls Microsoft Graph API with Client Credentials flow
3. Receives access token with application permissions scope
4. Uses token to query meeting recordings and transcripts
5. Token auto-expires and is refreshed on next request
```

**Important**: Service Principal (not Managed Identity) is used for Graph API because:
- Graph API client credentials flow only works with Service Principals
- Managed Identities authenticate to Azure resources (VMs, containers)
- Container App can access Graph API via Service Principal stored in Key Vault

#### Log Analytics Contributor (User-assigned)

```
Purpose: Container App can write logs to Log Analytics
Scope: Log Analytics Workspace
```

### Multi-Layer Authentication Summary

| Layer | Authentication | Credentials | Rotation |
|-------|---|---|---|
| **Graph API (Client Credentials)** | Service Principal | Client secret in KV | Annual |
| **Azure Resources (ACR, KV, Storage)** | Managed Identity | AAD token (auto) | Per-request |
| **Webhook Validation** | Bearer Token | webhook-auth-secret in KV | 30-90 days |
| **Terraform State** | Azure Service Principal | az login or env vars | Project-specific |

### No Secrets in Code

All authentication uses:
- **Managed Identities** (automatic credential management)
- **Azure AD tokens** (time-bound, automatic refresh)
- **RBAC role assignments** (deny by default, allow explicitly)

---

## Private Endpoints

### Endpoint Configuration

| Service | Resource | Endpoint Subnet | Private DNS Zone | Port |
|---------|----------|-----------------|-----------------|------|
| ACR | Container Registry | Private Endpoints | privatelink.azurecr.io | 443 |
| Key Vault | Key Vault | Private Endpoints | privatelink.vaultcore.azure.net | 443 |
| Blob Storage | Storage Account | Private Endpoints | privatelink.blob.core.windows.net | 443 |
| Event Grid | Event Grid Topic | Private Endpoints | privatelink.eventgrid.azure.net | 443 |
| Log Analytics | Log Analytics | Private Endpoints | privatelink.monitor.azure.com | 443 |

### Network Flow for Private Endpoints

```
Container App (10.0.1.x)
  ↓ queries private DNS (10.0.2.x:53)
  ↓ resolves to private IP (10.0.2.y)
  ↓ connects to PE NIC
  ↓ NSG allows (from CA subnet)
  ↓ reaches Azure resource (securely)
```

---

## Monitoring & Logging

### Application Insights

Captures:
- HTTP requests/responses
- Exception tracking
- Performance counters
- Custom events (meeting recorded, transcript fetched, etc.)
- Dependencies (Graph API calls, storage operations)

### Log Analytics Queries

```kusto
# Failed transcription fetches
AzureDiagnostics
| where ResourceType == "CONTAINERAPPSCONSOLE_MAIN"
| where OperationName contains "transcription" and Level == "ERROR"
| summarize count() by bin(TimeGenerated, 1h)

# ACR image pulls
AzureDiagnostics
| where ResourceType == "REGISTRIES"
| where OperationName == "PullArtifact"
| summarize count() by Repository

# Key Vault access
AzureDiagnostics
| where ResourceType == "VAULTS"
| where OperationName == "SecretGet"
| summarize count() by CallerIPAddress
```

### Alerts (via Action Groups)

- High error rate (>5% in 5 min)
- Container App restart loops
- Storage quota 80%+ full
- Key Vault throttling detected

---

## Best Practices Applied

### 1. **Security by Design**

✅ No keys in code, terraform state, or logs
✅ RBAC for all access (no shared credentials)
✅ Private endpoints (no internet exposure)
✅ Network segmentation (subnets + NSGs)
✅ Purge protection on Key Vault
✅ Soft delete on all deletable resources
✅ Encryption in transit (TLS 1.2+)
✅ Encryption at rest (default: AES-256)

### 2. **High Availability**

✅ Geo-redundant storage (GRS)
✅ Container App Environment (managed scaling)
✅ Azure service replication (built-in HA)
✅ Multiple availability zones (regional resilience)

### 3. **Operational Excellence**

✅ Infrastructure as Code (IaC) via Terraform
✅ Centralized logging (Log Analytics)
✅ Application monitoring (App Insights)
✅ Automated alerting (Action Groups)
✅ Tags on all resources (cost tracking, automation)
✅ Resource naming convention (easy identification)

### 4. **Compliance & Governance**

✅ RBAC (who can do what)
✅ Audit logging (who did what, when)
✅ Compliance policies enforced (via Azure Policy)
✅ Data residency (region-locked)
✅ Retention policies (data lifecycle)

### 5. **Cost Optimization**

✅ Premium SKUs only where needed (PE support)
✅ Pay-as-you-go for ephemeral compute
✅ Log retention limits (30 days)
✅ Auto-scaling Container Apps
✅ Reserved capacity for predictable workloads

---

## Resource Naming Convention

### Pattern: `{resource-type}-{environment}-{region}-{random}`

```
RG:           rg-prod-eastus
VNet:         vnet-prod-eus
Subnet (CA):  snet-prod-ca
Subnet (PE):  snet-prod-pe
ACR:          acrprodeus{random}
KV:           kv-prod-eus-{random}
Storage:      stprodeus{random}
Event Grid:   evgt-prod-eus
App Insights: appi-prod-eus
MSI (CA):     msi-prod-ca
```

### Tagging Strategy

All resources tagged with:

```hcl
tags = {
  Environment = var.environment          # prod, staging, dev
  Project     = "TeamsMeetingFetcher"
  Owner       = "Platform Engineering"
  CostCenter  = "Department123"
  ManagedBy   = "Terraform"
  CreatedDate = timestamp()
}
```

---

## Terraform Variables

### Required Variables

```hcl
variable "azure_subscription_id" {
  description = "Azure Subscription ID"
  type        = string
  sensitive   = true
}

variable "azure_region" {
  description = "Azure region (e.g., eastus, westeurope)"
  type        = string
  default     = "eastus"
}

variable "region_short" {
  description = "Short region name for naming (e.g., eus, weu)"
  type        = string
  default     = "eus"
}

variable "environment" {
  description = "Environment name (prod, staging, dev)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}
```

### Optional Variables

```hcl
variable "enable_bastion" {
  description = "Deploy Azure Bastion for secure admin access"
  type        = bool
  default     = true
}

variable "enable_ddos_protection" {
  description = "Enable DDoS Protection Standard on VNet"
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "Log retention in Log Analytics (days)"
  type        = number
  default     = 30
}

variable "container_app_min_replicas" {
  description = "Minimum container replicas"
  type        = number
  default     = 1
}

variable "container_app_max_replicas" {
  description = "Maximum container replicas"
  type        = number
  default     = 10
}

variable "entra_group_name" {
  description = "Name of existing Entra group to monitor (or leave empty to create new)"
  type        = string
  default     = ""
}

variable "create_entra_group" {
  description = "Create a new Entra group (set false to use existing group via entra_group_name)"
  type        = bool
  default     = true
}

variable "webhook_domain" {
  description = "Domain for webhook callbacks (e.g., webhook.example.com)"
  type        = string
}

variable "graph_app_display_name" {
  description = "Display name for Azure AD app registration"
  type        = string
  default     = "teams-meeting-fetcher"
}

variable "graph_secret_rotation_days" {
  description = "Days until Graph API client secret expires (default: 365)"
  type        = number
  default     = 365
}
```

---

## Terraform Outputs

```hcl
output "resource_group_id" {
  value = azurerm_resource_group.main.id
}

output "vnet_id" {
  value = azurerm_virtual_network.main.id
}

output "acr_login_server" {
  value = azurerm_container_registry.main.login_server
}

output "acr_id" {
  value = azurerm_container_registry.main.id
}

output "key_vault_id" {
  value = azurerm_key_vault.main.id
}

output "key_vault_uri" {
  value = azurerm_key_vault.main.vault_uri
}

output "storage_account_id" {
  value = azurerm_storage_account.main.id
}

output "storage_account_name" {
  value = azurerm_storage_account.main.name
}

output "container_app_environment_id" {
  value = azurerm_container_app_environment.main.id
}

output "container_app_managed_identity_id" {
  value = azurerm_user_assigned_identity.container_app.id
}

output "log_analytics_workspace_id" {
  value = azurerm_log_analytics_workspace.main.id
}

output "application_insights_instrumentation_key" {
  value = azurerm_application_insights.main.instrumentation_key
  sensitive = true
}

output "event_grid_topic_id" {
  value = azurerm_eventgrid_topic.main.id
}

output "entra_group_id" {
  value       = local.entra_group_id
  description = "Entra Group ID being monitored"
}

output "entra_group_name" {
  value       = var.create_entra_group ? azuread_group.monitoring_target[0].display_name : var.entra_group_name
  description = "Entra Group display name"
}

output "graph_app_id" {
  value       = azuread_application.main.client_id
  description = "Azure AD App Registration Client ID"
}

output "graph_app_object_id" {
  value       = azuread_application.main.object_id
  description = "Azure AD App Registration Object ID"
}

output "service_principal_object_id" {
  value       = azuread_service_principal.main.object_id
  description = "Service Principal Object ID (for RBAC assignments)"
}

output "graph_api_secret_vault_uri" {
  value       = azurerm_key_vault_secret.graph_client_secret.id
  sensitive   = true
  description = "Key Vault URI for Graph API client secret"
}

output "webhook_secret_vault_uri" {
  value       = azurerm_key_vault_secret.webhook_auth_secret.id
  sensitive   = true
  description = "Key Vault URI for webhook authentication secret"
}

output "graph_credentials_summary" {
  value = {
    tenant_id      = data.azurerm_client_config.current.tenant_id
    client_id      = azuread_application.main.client_id
    key_vault_uri  = azurerm_key_vault.main.vault_uri
    secret_names = {
      tenant_id           = azurerm_key_vault_secret.graph_tenant_id.name
      client_id           = azurerm_key_vault_secret.graph_client_id.name
      client_secret       = azurerm_key_vault_secret.graph_client_secret.name
      entra_group_id      = azurerm_key_vault_secret.entra_group_id.name
      webhook_auth_secret = azurerm_key_vault_secret.webhook_auth_secret.name
    }
  }
  description = "Graph API and authentication credentials stored in Key Vault"
  sensitive   = true
}
```

---

## Deployment & Operations

### Prerequisites

```bash
# 1. Install Terraform >= 1.0
terraform --version

# 2. Install Azure CLI
az --version

# 3. Install Azure AD Terraform Provider
# (included in terraform init if properly configured)

# 4. Authenticate to Azure
az login
az account set --subscription "${SUBSCRIPTION_ID}"

# 5. Verify tenant admin access (for Graph API permissions)
az account show --query "id, tenantId"
```

### Create terraform.tfvars

```hcl
# terraform.tfvars
azure_subscription_id = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
azure_region = "eastus"
region_short = "eus"
environment = "prod"

# Entra/Graph Configuration
webhook_domain = "webhook.yourdomain.com"
create_entra_group = true
entra_group_name = ""  # Leave empty if creating new; set to existing group name if create_entra_group = false

graph_app_display_name = "teams-meeting-fetcher-prod"
graph_secret_rotation_days = 365

# Container App Configuration
container_app_min_replicas = 1
container_app_max_replicas = 10

# Logging
log_retention_days = 30

# Optional: Bastion and DDoS
enable_bastion = true
enable_ddos_protection = false
```

**Important Variables Explained**:

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `azure_subscription_id` | Yes | UUID | Target Azure subscription |
| `webhook_domain` | Yes | webhook.example.com | Domain where webhooks are received |
| `create_entra_group` | No | true/false | Auto-create or use existing group |
| `entra_group_name` | If `create_entra_group=false` | "Teams Users" | Name of existing Entra group to monitor |
| `environment` | Yes | prod, staging, dev | Environment tag and naming |

### Deployment

```bash
# 1. Initialize Terraform
terraform init

# 2. Plan deployment
terraform plan -out=tfplan

# 3. Review plan
cat tfplan  # Optional: detailed review

# 4. Apply
terraform apply tfplan

# 5. Save outputs
terraform output -json > deployment-outputs.json
```

### Post-Deployment: Graph API Admin Consent

After Terraform apply, grant admin consent to Graph API permissions:

```bash
# 1. Get the App Registration ID from outputs
APP_ID=$(terraform output -raw graph_app_id)
TENANT_ID=$(terraform output -raw graph_credentials_summary | jq -r .tenant_id)

# 2. Navigate to Azure Portal or use Azure CLI to grant admin consent
az ad app permission admin-consent --id $APP_ID

# 3. Verify permissions were granted
az ad app permission list --id $APP_ID

# 4. Grant app role assignments for application permissions
# (May have been done by Terraform if service principal has sufficient permissions)
```

Or via Azure Portal:
1. Go to **Azure AD** → **App registrations**
2. Find `teams-meeting-fetcher-${environment}`
3. Click **API permissions**
4. Click **Grant admin consent for [Tenant]**
5. Confirm with admin account

**Permissions Requiring Admin Consent**:
- ✅ OnlineMeetingRecording.Read.All (Application)
- ✅ CallTranscripts.Read.All (Application)
- ⚠️ User.Read (User/Delegated) - may auto-grant

### Verify Infrastructure

```bash
# 1. Check Key Vault secrets created
az keyvault secret list --vault-name $(terraform output -raw key_vault_uri | grep -oP '(?<=https://)[^.]*')

# 2. Check Container App Environment
az containerapp env show --name $(terraform output -raw container_app_environment_id | grep -oP 'environments/\K[^/]+') \
  --resource-group $(terraform output -raw resource_group_id | grep -oP 'resourceGroups/\K[^/]+')

# 3. Check ACR
az acr show --name $(terraform output -raw acr_login_server | cut -d. -f1)

# 4. Verify Managed Identity roles
az role assignment list --assignee $(terraform output -raw container_app_managed_identity_id)
```

### State Management

**Best Practice**: Store terraform.tfstate in remote backend (Azure Storage)

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "rg-terraform-state"
    storage_account_name = "stterraformstate"
    container_name       = "tfstate"
    key                  = "teams-meeting-fetcher.tfstate"
  }
}
```

---

## Additional Resources Considered

### Optional: Azure Bastion

```hcl
resource "azurerm_bastion_host" "main" {
  name                = "bst-${var.environment}-${var.region_short}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  ip_configuration {
    name                 = "configuration"
    subnet_id            = azurerm_subnet.bastion.id
    public_ip_address_id = azurerm_public_ip.bastion.id
  }
  
  tags = local.common_tags
}
```

Purpose: Secure admin access without exposing RDP/SSH to internet

### Optional: Azure Policy

Enforce compliance:
- Require HTTPS on all storage
- Deny unencrypted databases
- Require tags on resources
- Enforce Key Vault purge protection

### Optional: Service Bus (Alternative to Event Grid)

If Event Grid's topic capabilities are insufficient:
- Use `azurerm_servicebus_namespace`
- Queue for reliable messaging
- Subscription model for filtering

---

## Cost Estimation

| Resource | SKU | Est. Monthly Cost |
|----------|-----|-------------------|
| Container App Environment | Based on usage | $30-100 |
| ACR | Premium | $100 |
| Key Vault | Premium | $0-50 |
| Storage Account | Standard GRS | $20-50 |
| Event Grid | 1M ops | $1-10 |
| Log Analytics | PerGB2018 | $20-50 |
| Application Insights | (via Log Analytics) | Included |
| Bastion | Std | ~$15/hour active |
| **Estimated Total** | | **$180-375/mo** |

*Costs vary by region and usage*

