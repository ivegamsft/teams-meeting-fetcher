output "resource_group_id" {
  description = "Resource group id"
  value       = null
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
