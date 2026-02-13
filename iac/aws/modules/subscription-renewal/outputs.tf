output "lambda_function_name" {
  description = "Name of the subscription renewal Lambda function"
  value       = aws_lambda_function.subscription_renewal.function_name
}

output "lambda_function_arn" {
  description = "ARN of the subscription renewal Lambda function"
  value       = aws_lambda_function.subscription_renewal.arn
}

output "lambda_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.subscription_renewal_role.arn
}

output "eventbridge_rule_name" {
  description = "Name of the EventBridge rule for scheduled renewal"
  value       = aws_cloudwatch_event_rule.subscription_renewal_schedule.name
}

output "eventbridge_rule_arn" {
  description = "ARN of the EventBridge rule"
  value       = aws_cloudwatch_event_rule.subscription_renewal_schedule.arn
}

output "log_group_name" {
  description = "CloudWatch log group for Lambda logs"
  value       = aws_cloudwatch_log_group.subscription_renewal_logs.name
}

output "log_group_arn" {
  description = "ARN of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.subscription_renewal_logs.arn
}

output "cloudwatch_alarm_arn" {
  description = "ARN of the CloudWatch alarm for monitoring errors"
  value       = aws_cloudwatch_metric_alarm.renewal_function_errors.arn
}
