// Bot Service module - Azure Bot Framework registration + Teams channel
// Manages the Azure Bot Service resource and Teams channel configuration.
//
// Bot Service uses "SingleTenant" app type — Azure deprecated MultiTenant bot creation.
// The Azure AD app registration (sign_in_audience = AzureADMultipleOrgs) is what
// Teams Admin Center validates. See modules/azure-ad/main.tf for details.

resource "azurerm_bot_service_azure_bot" "main" {
  name                    = var.bot_name
  resource_group_name     = var.resource_group_name
  location                = "global"
  sku                     = var.sku
  microsoft_app_id        = var.microsoft_app_id
  microsoft_app_type      = var.microsoft_app_type
  microsoft_app_tenant_id = var.microsoft_app_tenant_id

  developer_app_insights_key            = var.app_insights_key
  developer_app_insights_application_id = var.app_insights_app_id

  endpoint = var.messaging_endpoint

  tags = var.tags
}

// Diagnostic settings — send bot service logs to Log Analytics
resource "azurerm_monitor_diagnostic_setting" "bot" {
  name                       = "${var.bot_name}-diag"
  target_resource_id         = azurerm_bot_service_azure_bot.main.id
  log_analytics_workspace_id = var.log_analytics_workspace_id

  enabled_log {
    category = "BotRequest"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_bot_channel_ms_teams" "main" {
  bot_name            = azurerm_bot_service_azure_bot.main.name
  resource_group_name = var.resource_group_name
  location            = azurerm_bot_service_azure_bot.main.location
}
