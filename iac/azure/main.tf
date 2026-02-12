// Azure deployment entry point.
// See specs/infrastructure-terraform-spec.md for the full resource design.

// Resource naming convention: tmf-{resource}-{env}-{region_short}

resource "azurerm_resource_group" "main" {
  name     = "tmf-rg-${var.environment}-${var.region_short}"
  location = var.azure_region

  tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
  }
}

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

// Future expansion:
// module "network" { source = "./modules/network" }
// module "container_apps" { source = "./modules/container-apps" }
// module "security" { source = "./modules/security" }
