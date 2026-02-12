output "resource_group_name" {
  description = "Resource group name"
  value       = azurerm_resource_group.main.name
}

output "resource_group_id" {
  description = "Resource group id"
  value       = azurerm_resource_group.main.id
}

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

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = null
}

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
