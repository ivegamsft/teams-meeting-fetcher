provider "azurerm" {
  subscription_id = var.azure_subscription_id
  tenant_id       = var.azure_tenant_id
  client_id       = var.azure_client_id
  client_secret   = var.azure_client_secret

  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }

    # Use Azure AD (RBAC) authentication for storage operations
    # Required when shared_access_key_enabled = false
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }

  storage_use_azuread = true
}

provider "azuread" {
  tenant_id     = var.azure_tenant_id
  client_id     = var.azure_client_id
  client_secret = var.azure_client_secret
}

provider "random" {}

provider "http" {}
