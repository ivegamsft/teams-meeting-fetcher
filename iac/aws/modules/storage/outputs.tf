output "bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.webhook_payloads.bucket
}

output "bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.webhook_payloads.arn
}

output "bucket_id" {
  description = "ID of the S3 bucket"
  value       = aws_s3_bucket.webhook_payloads.id
}

output "subscriptions_table_name" {
  description = "Name of the DynamoDB subscriptions table"
  value       = aws_dynamodb_table.graph_subscriptions.name
}

output "subscriptions_table_arn" {
  description = "ARN of the DynamoDB subscriptions table"
  value       = aws_dynamodb_table.graph_subscriptions.arn
}

output "subscriptions_table_stream_arn" {
  description = "Stream ARN of the DynamoDB subscriptions table"
  value       = aws_dynamodb_table.graph_subscriptions.stream_arn
}
