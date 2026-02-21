// Storage Account module for webhook payloads
// Manages Azure Storage Account with RBAC-only access and firewall rules

resource "azurerm_storage_account" "main" {
  name                     = var.storage_account_name
  resource_group_name      = var.resource_group_name
  location                 = var.location
  account_tier             = var.account_tier
  account_replication_type = var.replication_type

  allow_nested_items_to_be_public  = false
  cross_tenant_replication_enabled = true

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

  lifecycle {
    prevent_destroy = true
  }
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
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"

  depends_on = [azurerm_role_assignment.deployment_storage]
}

// Diagnostic settings — send storage logs to Log Analytics
resource "azurerm_monitor_diagnostic_setting" "storage" {
  name                       = "${var.storage_account_name}-diag"
  target_resource_id         = azurerm_storage_account.main.id
  log_analytics_workspace_id = var.log_analytics_workspace_id

  enabled_metric {
    category = "Transaction"
  }
}

// Diagnostic settings for blob service
resource "azurerm_monitor_diagnostic_setting" "storage_blob" {
  name                       = "${var.storage_account_name}-blob-diag"
  target_resource_id         = "${azurerm_storage_account.main.id}/blobServices/default"
  log_analytics_workspace_id = var.log_analytics_workspace_id

  enabled_log {
    category = "StorageRead"
  }

  enabled_log {
    category = "StorageWrite"
  }

  enabled_log {
    category = "StorageDelete"
  }

  enabled_metric {
    category = "Transaction"
  }
}

//=============================================================================
// NOTE: RBAC Role Assignments
//=============================================================================
// All role assignments for storage have been moved to the security module
// for centralized RBAC management. See: ../security/main.tf
//
// Role assignments moved:
//   - Storage Blob Data Contributor → App Service Principal
//   - Storage Blob Data Contributor → Graph Change Tracking (disabled due to timeout)
//=============================================================================

