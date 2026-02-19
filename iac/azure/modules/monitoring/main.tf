// Monitoring module for Log Analytics, Application Insights, and Event Grid
// Manages Azure monitoring and eventing infrastructure

// Get current client configuration for RBAC assignments
data "azurerm_client_config" "current" {}

// Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "main" {
  name                = var.log_analytics_workspace_name
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = var.log_analytics_sku
  retention_in_days   = var.log_retention_days

  tags = var.tags
}

// Application Insights
resource "azurerm_application_insights" "main" {
  name                = var.app_insights_name
  location            = var.location
  resource_group_name = var.resource_group_name
  application_type    = var.application_type
  workspace_id        = azurerm_log_analytics_workspace.main.id

  tags = var.tags
}

// Event Grid Topic
resource "azurerm_eventgrid_topic" "main" {
  name                = var.eventgrid_topic_name
  location            = var.location
  resource_group_name = var.resource_group_name

  tags = var.tags
}

// Event Hub Namespace
resource "azurerm_eventhub_namespace" "main" {
  name                         = var.eventhub_namespace_name
  location                     = var.location
  resource_group_name          = var.resource_group_name
  sku                          = var.eventhub_sku
  capacity                     = var.eventhub_capacity
  local_authentication_enabled = var.eventhub_local_auth_enabled

  tags = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

// Event Hub
resource "azurerm_eventhub" "main" {
  name                = var.eventhub_name
  namespace_name      = azurerm_eventhub_namespace.main.name
  resource_group_name = var.resource_group_name
  message_retention   = var.eventhub_message_retention
  partition_count     = 2
}

// Authorization rule for app consumption
// NOTE: This uses SharedAccessKey authentication, which is legacy.
// For improved security, use Azure RBAC (role assignments below) instead.
resource "azurerm_eventhub_authorization_rule" "main" {
  name                = "tmf-eventhub-access"
  namespace_name      = azurerm_eventhub_namespace.main.name
  eventhub_name       = azurerm_eventhub.main.name
  resource_group_name = var.resource_group_name

  listen = true
  send   = true
  manage = false
}

//=============================================================================
// RBAC CONFIGURATION
//=============================================================================

// Grant current user Azure Event Hubs Data Owner role at namespace level
// This allows the user to send and receive messages from any Event Hub in the namespace
resource "azurerm_role_assignment" "eventhub_data_owner" {
  scope                = azurerm_eventhub_namespace.main.id
  role_definition_name = "Azure Event Hubs Data Owner"
  principal_id         = coalesce(var.current_user_object_id, data.azurerm_client_config.current.object_id)

  description = "Grant Event Hubs Data Owner role to current user for RBAC authentication"
}

// Additional role assignment for the Service Principal (Terraform executor)
// This ensures Terraform can manage Event Hub resources
resource "azurerm_role_assignment" "eventhub_contributor" {
  scope                = azurerm_eventhub_namespace.main.id
  role_definition_name = "Contributor"
  principal_id         = data.azurerm_client_config.current.object_id

  description = "Grant Contributor role for Event Hub management"
}

// Grant Azure Event Hubs Data Sender role to Microsoft Graph Change Tracking service principal
// Allows Graph API to send change notifications to Event Hub
resource "azurerm_role_assignment" "eventhub_graph_change_tracking" {
  scope                = azurerm_eventhub.main.id
  role_definition_name = "Azure Event Hubs Data Sender"
  principal_id         = "f9263d58-0948-4f6f-96b9-206a737c9de7" // Microsoft Graph Change Tracking service principal (tenant: 62837751-4e48-4d06-8bcb-57be1a669b78)

  description = "Grant Event Hubs Data Sender role to Graph Change Tracking service for sending notifications"
}

