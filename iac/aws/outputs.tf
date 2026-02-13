// Outputs for modularized AWS deployment

//=============================================================================
// API GATEWAY OUTPUTS
//=============================================================================

output "api_webhook_url" {
  description = "API Gateway webhook URL"
  value       = module.api_gateway.webhook_url
}

output "api_id" {
  description = "API Gateway REST API ID"
  value       = module.api_gateway.api_id
}

//=============================================================================
// LAMBDA OUTPUTS
//=============================================================================

output "lambda_function_name" {
  description = "Lambda function name"
  value       = module.lambda.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = module.lambda.function_arn
}

//=============================================================================
// AUTHORIZER OUTPUTS
//=============================================================================

output "authorizer_function_name" {
  description = "Authorizer Lambda function name"
  value       = module.authorizer.function_name
}

output "authorizer_function_arn" {
  description = "Authorizer Lambda function ARN"
  value       = module.authorizer.function_arn
}

//=============================================================================
// STORAGE OUTPUTS
//=============================================================================

output "s3_bucket_name" {
  description = "S3 bucket for webhook payloads"
  value       = module.storage.bucket_name
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = module.storage.bucket_arn
}

output "subscriptions_table_name" {
  description = "DynamoDB table for subscription tracking"
  value       = module.storage.subscriptions_table_name
}

output "subscriptions_table_arn" {
  description = "DynamoDB subscriptions table ARN"
  value       = module.storage.subscriptions_table_arn
}

//=============================================================================
// NOTIFICATIONS OUTPUTS
//=============================================================================

output "sns_topic_arn" {
  description = "SNS topic ARN for notifications"
  value       = module.notifications.topic_arn
}

output "sns_topic_name" {
  description = "SNS topic name"
  value       = module.notifications.topic_name
}

output "sns_subscription_arn" {
  description = "SNS email subscription ARN (pending confirmation if email provided)"
  value       = module.notifications.subscription_arn
}

//=============================================================================
// SUBSCRIPTION RENEWAL OUTPUTS
//=============================================================================

output "renewal_lambda_function_name" {
  description = "Lambda function name for subscription renewal"
  value       = module.subscription_renewal.lambda_function_name
}

output "renewal_lambda_function_arn" {
  description = "Lambda function ARN for subscription renewal"
  value       = module.subscription_renewal.lambda_function_arn
}

output "renewal_eventbridge_rule_name" {
  description = "EventBridge rule name for scheduled subscription renewal"
  value       = module.subscription_renewal.eventbridge_rule_name
}

output "renewal_log_group_name" {
  description = "CloudWatch log group for subscription renewal Lambda"
  value       = module.subscription_renewal.log_group_name
}

//=============================================================================
// MEETING BOT OUTPUTS
//=============================================================================

output "meeting_bot_function_name" {
  description = "Meeting bot Lambda function name"
  value       = module.meeting_bot.function_name
}

output "meeting_bot_function_arn" {
  description = "Meeting bot Lambda function ARN"
  value       = module.meeting_bot.function_arn
}

output "meeting_bot_webhook_url" {
  description = "Direct Lambda Function URL for Graph webhook notifications"
  value       = module.meeting_bot.webhook_url
}

output "meeting_bot_table_name" {
  description = "Meeting bot DynamoDB table name"
  value       = module.meeting_bot.meetings_table_name
}

output "bot_api_base_url" {
  description = "Base URL for meeting bot API"
  value       = module.bot_api_gateway.api_base_url
}

output "bot_callbacks_url" {
  description = "Bot callbacks URL"
  value       = module.bot_api_gateway.callbacks_url
}
