//=============================================================================
// Azure Security Module - RBAC Role Assignments
//=============================================================================
// Consolidated role assignments for all infrastructure components.
// Only role assignments WITHOUT resource dependencies are placed here.
// Co-locate RBAC with resources only when there's an actual Terraform
// dependency (e.g., resource outputs used by dependent modules).
//=============================================================================

//-----------------------------------------------------------------------------
// Storage Account RBAC
//-----------------------------------------------------------------------------

// Grant Storage Blob Data Contributor to application service principal
resource "azurerm_role_assignment" "app_storage" {
  scope                = var.storage_account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.app_principal_id
}

//=============================================================================
// KNOWN ISSUE: Graph Change Tracking Storage RBAC
//=============================================================================
// Grant Storage Blob Data Contributor to Microsoft Graph Change Tracking service principal
// Allows Graph API to store rich notification payloads > 1MB in storage account
//
// TEMPORARILY DISABLED: Terraform apply hangs during azurerm_role_assignment creation
// Error: HTTP connection reset / timeout when applying role assignment
// Workaround: Manually assign via Azure Portal or Azure CLI after initial deployment
//   az role assignment create \
//     --role "Storage Blob Data Contributor" \
//     --assignee 0bf30f3b-4a52-48df-9a82-234910c4a086 \
//     --scope /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/{name}
//
resource "azurerm_role_assignment" "graph_change_tracking_storage" {
  scope                = var.storage_account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = var.graph_change_tracking_principal_id

  # Temporarily disabled due to timeout issues
  count = 0

  lifecycle {
    # Prevent accidental changes to this sensitive assignment
    prevent_destroy = false
  }
}

//-----------------------------------------------------------------------------
// Event Hub RBAC
//-----------------------------------------------------------------------------

// Grant EventHub Data Receiver to Lambda service principal
resource "azurerm_role_assignment" "lambda_eventhub_reader" {
  scope                = var.eventhub_namespace_id
  role_definition_name = "Azure Event Hubs Data Receiver"
  principal_id         = var.lambda_principal_id

  description = "Allow Lambda to read messages from EventHub (change tracking)"
}
