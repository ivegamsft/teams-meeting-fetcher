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
