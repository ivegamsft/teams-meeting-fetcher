output "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID"
  value       = azurerm_log_analytics_workspace.main.id
}

output "app_insights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  value       = azurerm_application_insights.main.instrumentation_key
  sensitive   = true
}

output "app_insights_connection_string" {
  description = "Application Insights connection string"
  value       = azurerm_application_insights.main.connection_string
  sensitive   = true
}

output "app_insights_app_id" {
  description = "Application Insights application ID"
  value       = azurerm_application_insights.main.app_id
}

output "eventgrid_topic_id" {
  description = "Event Grid topic ID"
  value       = azurerm_eventgrid_topic.main.id
}

output "eventgrid_topic_endpoint" {
  description = "Event Grid topic endpoint"
  value       = azurerm_eventgrid_topic.main.endpoint
}

output "eventgrid_topic_name" {
  description = "Event Grid topic name"
  value       = azurerm_eventgrid_topic.main.name
}

output "eventgrid_topic_primary_access_key" {
  description = "Event Grid topic primary access key"
  value       = azurerm_eventgrid_topic.main.primary_access_key
  sensitive   = true
}

output "eventhub_namespace_name" {
  description = "Event Hub namespace name"
  value       = azurerm_eventhub_namespace.main.name
}

output "eventhub_name" {
  description = "Event Hub name"
  value       = azurerm_eventhub.main.name
}

output "eventhub_lambda_consumer_group" {
  description = "Event Hub consumer group for Lambda processor"
  value       = azurerm_eventhub_consumer_group.lambda.name
}

output "eventhub_connection_string" {
  description = "Event Hub connection string"
  value       = azurerm_eventhub_authorization_rule.main.primary_connection_string
  sensitive   = true
}
