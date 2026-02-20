// Outputs from unified deployment

//=============================================================================
// AZURE OUTPUTS
//=============================================================================

output "azure_resource_group_name" {
  description = "Azure resource group name"
  value       = module.azure.resource_group_name
}

output "azure_app_client_id" {
  description = "Azure app registration client ID"
  value       = module.azure.app_client_id
}

output "azure_app_client_secret" {
  description = "Azure app registration client secret"
  value       = module.azure.app_client_secret
  sensitive   = true
}

output "azure_bot_app_id" {
  description = "Azure bot app ID"
  value       = module.azure.bot_app_client_id
}

output "azure_admin_group_id" {
  description = "Azure admin group ID"
  value       = module.azure.admin_group_id
}

output "azure_eventhub_namespace" {
  description = "Azure Event Hub namespace"
  value       = module.azure.eventhub_namespace_name
}

output "azure_eventhub_name" {
  description = "Azure Event Hub name"
  value       = module.azure.eventhub_name
}

output "azure_eventhub_connection_string" {
  description = "Azure Event Hub connection string"
  value       = module.azure.eventhub_connection_string
  sensitive   = true
}

output "azure_key_vault_name" {
  description = "Azure Key Vault name"
  value       = module.azure.key_vault_name
}

output "azure_storage_account_name" {
  description = "Azure Storage account name"
  value       = module.azure.storage_account_name
}

//=============================================================================
// AWS OUTPUTS
//=============================================================================

output "aws_s3_bucket_name" {
  description = "AWS S3 bucket name"
  value       = module.aws.s3_bucket_name
}

output "aws_api_gateway_url" {
  description = "AWS API Gateway URL"
  value       = module.aws.api_webhook_url
}

output "aws_meeting_bot_webhook_url" {
  description = "AWS meeting bot webhook URL"
  value       = module.aws.meeting_bot_webhook_url
}

output "aws_lambda_function_name" {
  description = "AWS main Lambda function name"
  value       = module.aws.lambda_function_name
}

output "aws_eventhub_processor_name" {
  description = "AWS Event Hub processor Lambda name"
  value       = module.aws.eventhub_processor_function_name
}

output "aws_checkpoint_table_name" {
  description = "AWS DynamoDB checkpoint table name"
  value       = module.aws.eventhub_checkpoints_table_name
}

//=============================================================================
// DEPLOYMENT INFO
//=============================================================================

output "deployment_summary" {
  description = "Summary of deployed resources"
  value = {
    environment          = var.environment
    azure_resource_group = module.azure.resource_group_name
    azure_event_hub      = "${module.azure.eventhub_namespace_name}/${module.azure.eventhub_name}"
    aws_s3_bucket        = module.aws.s3_bucket_name
    aws_api_gateway      = module.aws.api_webhook_url
    bot_webhook          = module.aws.meeting_bot_webhook_url
    eventhub_processor   = module.aws.eventhub_processor_function_name
    checkpoint_table     = module.aws.eventhub_checkpoints_table_name
  }
}
