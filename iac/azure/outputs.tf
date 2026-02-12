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

// Event Grid outputs (for future use)
output "eventgrid_topic_endpoint" {
  description = "Event Grid topic endpoint"
  value       = null
}

output "eventgrid_topic_key" {
  description = "Event Grid topic access key"
  value       = null
  sensitive   = true
}

output "appinsights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  value       = null
  sensitive   = true
}
