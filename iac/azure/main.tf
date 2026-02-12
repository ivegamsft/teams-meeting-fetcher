// Azure deployment entry point.
// See specs/infrastructure-terraform-spec.md for the full resource design.

// Resource naming convention: {base}-{resource-type}-{region}-{suffix}
// Base: tmf (Teams Meeting Fetcher)
// Storage accounts use compact format (no hyphens): {base}{type}{region}{suffix}

// Generate unique deployment suffix
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
  numeric = true
  lower   = true
}

// Generate random pet name for test user
resource "random_pet" "test_user" {
  length    = 2
  separator = ""
}

// Generate secure random password for test user
resource "random_password" "test_user" {
  length  = 24
  special = true
  upper   = true
  lower   = true
  numeric = true

  min_special = 2
  min_upper   = 2
  min_lower   = 2
  min_numeric = 2
}

// Define naming convention
locals {
  base_name = "tmf"
  suffix    = random_string.suffix.result

  // Standard naming with hyphens
  rg_name = "${local.base_name}-rg-${var.region_short}-${local.suffix}"
  kv_name = "${local.base_name}-kv-${var.region_short}-${local.suffix}"

  // Storage account: no hyphens, lowercase + numbers only (Azure restriction)
  // Format: tmfst{region}{suffix} - keeps it under 24 char limit
  storage_name = "${local.base_name}st${var.region_short}${local.suffix}"

  // Test user UPN - use random pet name with default domain
  default_domain         = data.azuread_domains.aad_domains.domains[0].domain_name
  test_user_upn          = "${random_pet.test_user.id}@${local.default_domain}"
  test_user_display_name = "TMF ${title(random_pet.test_user.id)}"
}

// Get current client config
data "azurerm_client_config" "current" {}

// Get current Azure AD user/SPN for Key Vault access
data "azuread_client_config" "current" {}

// Get Azure AD domains to use default verified domain for test user
data "azuread_domains" "aad_domains" {
  only_default = true
}

// Get current public IP for firewall rules
data "http" "current_ip" {
  url = "https://api.ipify.org?format=text"
}

resource "azurerm_resource_group" "main" {
  name     = local.rg_name
  location = var.azure_region

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
    Suffix      = local.suffix
  }
}

// Azure AD Application Registration
resource "azuread_application" "tmf_app" {
  display_name = "${var.app_display_name} (${var.environment})"
  owners       = [data.azuread_client_config.current.object_id]

  required_resource_access {
    # Microsoft Graph
    resource_app_id = "00000003-0000-0000-c000-000000000000"

    # Application permissions for Microsoft Graph
    resource_access {
      id   = "1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9" # Application.ReadWrite.All
      type = "Role"
    }
    resource_access {
      id   = "798ee544-9d2d-430c-a058-570e29e34338" # Calendars.Read
      type = "Role"
    }
    resource_access {
      id   = "6931bccd-447a-43d1-b442-00a195474933" # OnlineMeetings.Read.All
      type = "Role"
    }
    resource_access {
      id   = "b633e1c5-b582-4048-a93e-9f11b44c7e96" # Group.Read.All
      type = "Role"
    }
  }

  web {
    homepage_url  = "https://teams-meeting-fetcher.example.com"
    redirect_uris = []
  }

  tags = ["terraform", var.environment]
}

// Service Principal for the application
resource "azuread_service_principal" "tmf_app" {
  client_id                    = azuread_application.tmf_app.client_id
  app_role_assignment_required = false
  owners                       = [data.azuread_client_config.current.object_id]

  tags = ["terraform", var.environment]
}

// Application password (client secret)
resource "azuread_application_password" "tmf_app" {
  application_id = azuread_application.tmf_app.id
  display_name   = "Terraform managed secret"
  end_date       = timeadd(timestamp(), "8760h") # 1 year
}

// Azure AD Group for admins
resource "azuread_group" "admins" {
  display_name     = "${var.admin_group_display_name} (${var.environment})"
  owners           = [data.azuread_client_config.current.object_id]
  security_enabled = true

  description = "Administrators for Teams Meeting Fetcher application"
}

// Test user for development (optional)
resource "azuread_user" "test_user" {
  count = var.create_test_user ? 1 : 0

  user_principal_name = local.test_user_upn
  display_name        = local.test_user_display_name
  mail_nickname       = random_pet.test_user.id
  password            = random_password.test_user.result

  usage_location = "US" # Required for license assignment

  lifecycle {
    ignore_changes = [password] # Don't update password on subsequent applies
  }
}

// Add test user to admin group (if created)
resource "azuread_group_member" "test_user_admin" {
  count = var.create_test_user ? 1 : 0

  group_object_id  = azuread_group.admins.id
  member_object_id = azuread_user.test_user[0].object_id
}

// Key Vault
resource "azurerm_key_vault" "main" {
  name                = local.kv_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = var.key_vault_sku

  enable_rbac_authorization     = true
  soft_delete_retention_days    = 7
  purge_protection_enabled      = false
  public_network_access_enabled = true

  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
    ip_rules       = [data.http.current_ip.response_body]
  }

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
    Suffix      = local.suffix
  }
}

// Grant Key Vault Secrets Officer to deployment SPN
resource "azurerm_role_assignment" "kv_deployment_spn" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

// Grant Key Vault Secrets User to application service principal
resource "azurerm_role_assignment" "kv_app_sp" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azuread_service_principal.tmf_app.object_id
}

// Store app client secret in Key Vault
resource "azurerm_key_vault_secret" "app_client_secret" {
  name         = "app-client-secret"
  value        = azuread_application_password.tmf_app.value
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.kv_deployment_spn]
}

// Storage Account for webhook payloads
resource "azurerm_storage_account" "webhook_storage" {
  name                     = local.storage_name
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  # Enforce RBAC-only access (no key-based authentication)
  shared_access_key_enabled     = false
  public_network_access_enabled = true

  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices"]
    ip_rules       = [data.http.current_ip.response_body]
  }

  blob_properties {
    versioning_enabled = true
  }

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
    Suffix      = local.suffix
  }
}

// Grant Storage Blob Data Contributor to deployment SPN for Terraform management
resource "azurerm_role_assignment" "storage_deployment_spn" {
  scope                = azurerm_storage_account.webhook_storage.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_storage_container" "webhooks" {
  name                  = "webhooks"
  storage_account_name  = azurerm_storage_account.webhook_storage.name
  container_access_type = "private"

  depends_on = [azurerm_role_assignment.storage_deployment_spn]
}

// Grant Storage Blob Data Contributor to application service principal
resource "azurerm_role_assignment" "storage_app_sp" {
  scope                = azurerm_storage_account.webhook_storage.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azuread_service_principal.tmf_app.object_id
}

// Log Analytics Workspace for Application Insights
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${local.base_name}-law-${var.region_short}-${local.suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
    Suffix      = local.suffix
  }
}

// Application Insights
resource "azurerm_application_insights" "main" {
  name                = "${local.base_name}-ai-${var.region_short}-${local.suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
    Suffix      = local.suffix
  }
}

// Event Grid Topic for webhook events
resource "azurerm_eventgrid_topic" "webhook_events" {
  name                = "${local.base_name}-egt-${var.region_short}-${local.suffix}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
    Suffix      = local.suffix
  }
}

// Store Event Grid key in Key Vault
resource "azurerm_key_vault_secret" "eventgrid_key" {
  name         = "eventgrid-access-key"
  value        = azurerm_eventgrid_topic.webhook_events.primary_access_key
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.kv_deployment_spn]
}

// Store Application Insights instrumentation key in Key Vault
resource "azurerm_key_vault_secret" "appinsights_key" {
  name         = "appinsights-instrumentation-key"
  value        = azurerm_application_insights.main.instrumentation_key
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.kv_deployment_spn]
}

// Future expansion:
// module "network" { source = "./modules/network" }
// module "container_apps" { source = "./modules/container-apps" }
// module "security" { source = "./modules/security" }
