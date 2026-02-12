output "storage_account_id" {
  description = "Storage account resource ID"
  value       = azurerm_storage_account.main.id
}

output "storage_account_name" {
  description = "Storage account name"
  value       = azurerm_storage_account.main.name
}

output "storage_account_primary_connection_string" {
  description = "Storage account connection string"
  value       = azurerm_storage_account.main.primary_connection_string
  sensitive   = true
}

output "container_names" {
  description = "Names of created containers"
  value       = [for c in azurerm_storage_container.containers : c.name]
}
