output "topic_arn" {
  description = "ARN of the SNS topic"
  value       = aws_sns_topic.notifications.arn
}

output "topic_name" {
  description = "Name of the SNS topic"
  value       = aws_sns_topic.notifications.name
}

output "topic_id" {
  description = "ID of the SNS topic"
  value       = aws_sns_topic.notifications.id
}

output "subscription_arn" {
  description = "ARN of the email subscription (if created)"
  value       = var.notification_email != null ? aws_sns_topic_subscription.email[0].arn : null
}
