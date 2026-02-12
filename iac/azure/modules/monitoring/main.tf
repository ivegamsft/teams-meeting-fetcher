// Monitoring module for Log Analytics, Application Insights, and Event Grid
// Manages Azure monitoring and eventing infrastructure

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
