// Azure deployment entry point.
// See specs/infrastructure-terraform-spec.md for the full resource design.

// Resource naming convention: tmf-{resource}-{env}-{region_short}

// Get current client config
data "azurerm_client_config" "current" {}

// Get current Azure AD user/SPN for Key Vault access
data "azuread_client_config" "current" {}

resource "azurerm_resource_group" "main" {
  name     = "tmf-rg-${var.environment}-${var.region_short}"
  location = var.azure_region

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
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

// Key Vault
resource "azurerm_key_vault" "main" {
  name                = "tmf-kv-${var.environment}-${var.region_short}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = var.key_vault_sku

  enable_rbac_authorization = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false

  network_acls {
    default_action = "Allow"
    bypass         = "AzureServices"
  }

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
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
  name                     = "tmfwebhooks${var.environment}${var.region_short}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  
  blob_properties {
    versioning_enabled = true
  }

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
  }
}

resource "azurerm_storage_container" "webhooks" {
  name                  = "webhooks"
  storage_account_name  = azurerm_storage_account.webhook_storage.name
  container_access_type = "private"
}

// Grant Storage Blob Data Contributor to application service principal
resource "azurerm_role_assignment" "storage_app_sp" {
  scope                = azurerm_storage_account.webhook_storage.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azuread_service_principal.tmf_app.object_id
}

// Future expansion:
// module "network" { source = "./modules/network" }
// module "container_apps" { source = "./modules/container-apps" }
// module "security" { source = "./modules/security" }
