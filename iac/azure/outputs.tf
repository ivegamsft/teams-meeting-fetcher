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

// Azure AD Application outputs
output "app_client_id" {
  description = "Application (client) ID for the Teams Meeting Fetcher app"
  value       = azuread_application.tmf_app.client_id
}

output "app_object_id" {
  description = "Object ID of the application"
  value       = azuread_application.tmf_app.object_id
}

output "app_tenant_id" {
  description = "Tenant ID for the application"
  value       = data.azurerm_client_config.current.tenant_id
}

output "service_principal_object_id" {
  description = "Object ID of the service principal"
  value       = azuread_service_principal.tmf_app.object_id
}

output "admin_group_id" {
  description = "Object ID of the admin group"
  value       = azuread_group.admins.id
}

output "admin_group_name" {
  description = "Display name of the admin group"
  value       = azuread_group.admins.display_name
}

// Key Vault outputs
output "key_vault_name" {
  description = "Key Vault name"
  value       = azurerm_key_vault.main.name
}

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = azurerm_key_vault.main.vault_uri
}

// Storage outputs
output "storage_account_name" {
  description = "Storage account name for webhook payloads"
  value       = azurerm_storage_account.webhook_storage.name
}

output "storage_container_name" {
  description = "Storage container name for webhooks"
  value       = azurerm_storage_container.webhooks.name
}

output "storage_account_primary_connection_string" {
  description = "Storage account connection string"
  value       = azurerm_storage_account.webhook_storage.primary_connection_string
  sensitive   = true
}

// Event Grid outputs
output "eventgrid_topic_endpoint" {
  description = "Event Grid topic endpoint"
  value       = azurerm_eventgrid_topic.webhook_events.endpoint
}

output "eventgrid_topic_name" {
  description = "Event Grid topic name"
  value       = azurerm_eventgrid_topic.webhook_events.name
}

output "eventgrid_topic_key" {
  description = "Event Grid topic access key"
  value       = azurerm_eventgrid_topic.webhook_events.primary_access_key
  sensitive   = true
}

// Application Insights outputs
output "appinsights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}

output "appinsights_connection_string" {
  description = "Application Insights connection string"
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "appinsights_app_id" {
  description = "Application Insights application ID"
  value       = azurerm_application_insights.main.app_id
}

// Test user outputs (if created)
output "test_user_principal_name" {
  description = "Test user principal name (email)"
  value       = var.create_test_user ? azuread_user.test_user[0].user_principal_name : null
}

output "test_user_object_id" {
  description = "Test user object ID"
  value       = var.create_test_user ? azuread_user.test_user[0].object_id : null
}

output "test_user_display_name" {
  description = "Test user display name"
  value       = var.create_test_user ? azuread_user.test_user[0].display_name : null
}
