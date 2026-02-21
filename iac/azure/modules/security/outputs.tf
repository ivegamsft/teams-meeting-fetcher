//=============================================================================
// Azure Security Module - Outputs
//=============================================================================

output "app_storage_role_assignment_id" {
  description = "ID of the app storage role assignment"
  value       = azurerm_role_assignment.app_storage.id
}

output "lambda_eventhub_role_assignment_id" {
  description = "ID of the Lambda EventHub role assignment"
  value       = azurerm_role_assignment.lambda_eventhub_reader.id
}
