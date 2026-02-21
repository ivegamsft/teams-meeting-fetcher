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

output "eventhub_checkpoints_table_name" {
  description = "Name of the Event Hub checkpoints table"
  value       = aws_dynamodb_table.eventhub_checkpoints.name
}

output "eventhub_checkpoints_table_arn" {
  description = "ARN of the Event Hub checkpoints table"
  value       = aws_dynamodb_table.eventhub_checkpoints.arn
}
