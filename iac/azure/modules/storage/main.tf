// Storage Account module for webhook payloads
// Manages Azure Storage Account with RBAC-only access and firewall rules

resource "azurerm_storage_account" "main" {
  name                     = var.storage_account_name
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = var.account_tier
  account_replication_type = var.replication_type

  // Enforce RBAC-only access (no key-based authentication)
  shared_access_key_enabled     = false
  public_network_access_enabled = true

  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices"]
    ip_rules       = var.allowed_ip_addresses
  }

  blob_properties {
    versioning_enabled = var.blob_versioning_enabled
  }

  tags = var.tags
}

// Grant Storage Blob Data Contributor to deployment SPN for Terraform management
resource "azurerm_role_assignment" "deployment_storage" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.deployment_principal_id
}

// Create storage containers
resource "azurerm_storage_container" "containers" {
  for_each = toset(var.container_names)

  name                  = each.value
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "private"

  depends_on = [azurerm_role_assignment.deployment_storage]
}

// Grant Storage Blob Data Contributor to application service principal
resource "azurerm_role_assignment" "app_storage" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.app_principal_id
}
