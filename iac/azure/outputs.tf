// Outputs for modularized deployment

output "deployment_suffix" {
  description = "Unique deployment suffix for resource names"
  value       = random_string.suffix.result
}

output "resource_group_name" {
  description = "Resource group name"
  value       = azurerm_resource_group.main.name
}

output "resource_group_id" {
  description = "Resource group id"
  value       = azurerm_resource_group.main.id
}

//=============================================================================
// AZURE AD OUTPUTS
//=============================================================================

output "app_client_id" {
  description = "Application (client) ID for the Teams Meeting Fetcher app"
  value       = module.azure_ad.app_client_id
}

output "app_client_secret" {
  description = "Application client secret"
  value       = module.azure_ad.app_client_secret
  sensitive   = true
}

output "bot_app_client_id" {
  description = "Bot application (client) ID"
  value       = module.azure_ad.bot_app_client_id
}

output "bot_app_client_secret" {
  description = "Bot application client secret"
  value       = module.azure_ad.bot_app_client_secret
  sensitive   = true
}

output "app_object_id" {
  description = "Object ID of the application"
  value       = module.azure_ad.app_object_id
}

output "app_tenant_id" {
  description = "Tenant ID for the application"
  value       = data.azurerm_client_config.current.tenant_id
}

output "service_principal_object_id" {
  description = "Object ID of the service principal"
  value       = module.azure_ad.service_principal_object_id
}

output "bot_service_principal_object_id" {
  description = "Bot service principal object ID"
  value       = module.azure_ad.bot_service_principal_object_id
}

output "admin_group_id" {
  description = "Object ID of the admin group"
  value       = module.azure_ad.admin_group_id
}

output "admin_group_name" {
  description = "Display name of the admin group"
  value       = module.azure_ad.admin_group_name
}

//=============================================================================
// TEST USER OUTPUTS
//=============================================================================

output "test_user_principal_name" {
  description = "Test user principal name (email)"
  value       = module.azure_ad.test_user_principal_name
}

output "test_user_display_name" {
  description = "Test user display name"
  value       = module.azure_ad.test_user_display_name
}

output "test_user_object_id" {
  description = "Test user object ID"
  value       = module.azure_ad.test_user_object_id
}

output "test_user_password" {
  description = "Test user password (auto-generated)"
  value       = var.create_test_user ? random_password.test_user.result : null
  sensitive   = true
}

output "default_domain" {
  description = "Default verified Azure AD domain"
  value       = data.azuread_domains.aad_domains.domains[0].domain_name
}

//=============================================================================
// KEY VAULT OUTPUTS
//=============================================================================

output "key_vault_name" {
  description = "Key Vault name"
  value       = module.key_vault.key_vault_name
}

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = module.key_vault.key_vault_uri
}

//=============================================================================
// STORAGE OUTPUTS
//=============================================================================

output "storage_account_name" {
  description = "Storage account name for webhook payloads"
  value       = module.storage.storage_account_name
}

output "storage_container_name" {
  description = "Storage container name for webhooks"
  value       = module.storage.container_names[0]
}

output "storage_account_primary_connection_string" {
  description = "Storage account connection string"
  value       = module.storage.storage_account_primary_connection_string
  sensitive   = true
}

//=============================================================================
// MONITORING OUTPUTS
//=============================================================================

output "eventgrid_topic_endpoint" {
  description = "Event Grid topic endpoint"
  value       = module.monitoring.eventgrid_topic_endpoint
}

output "eventgrid_topic_name" {
  description = "Event Grid topic name"
  value       = module.monitoring.eventgrid_topic_name
}

output "eventgrid_topic_key" {
  description = "Event Grid topic access key"
  value       = module.monitoring.eventgrid_topic_primary_access_key
  sensitive   = true
}

output "appinsights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  value       = module.monitoring.app_insights_instrumentation_key
  sensitive   = true
}

output "appinsights_connection_string" {
  description = "Application Insights connection string"
  value       = module.monitoring.app_insights_connection_string
  sensitive   = true
}

output "appinsights_app_id" {
  description = "Application Insights application ID"
  value       = module.monitoring.app_insights_app_id
}

//=============================================================================
// BOT SERVICE OUTPUTS
//=============================================================================

output "bot_service_name" {
  description = "Azure Bot Service resource name"
  value       = azurerm_bot_service_azure_bot.meeting_bot.name
}

output "bot_messaging_endpoint" {
  description = "Bot messaging endpoint URL"
  value       = azurerm_bot_service_azure_bot.meeting_bot.endpoint
}
