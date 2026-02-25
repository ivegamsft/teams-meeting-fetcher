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

output "meetings_table_name" {
  description = "Name of the meetings DynamoDB table"
  value       = aws_dynamodb_table.meetings.name
}

output "meetings_table_arn" {
  description = "ARN of the meetings DynamoDB table"
  value       = aws_dynamodb_table.meetings.arn
}

output "transcripts_table_name" {
  description = "Name of the transcripts DynamoDB table"
  value       = aws_dynamodb_table.transcripts.name
}

output "transcripts_table_arn" {
  description = "ARN of the transcripts DynamoDB table"
  value       = aws_dynamodb_table.transcripts.arn
}

output "config_table_name" {
  description = "Name of the config DynamoDB table"
  value       = aws_dynamodb_table.config.name
}

output "config_table_arn" {
  description = "ARN of the config DynamoDB table"
  value       = aws_dynamodb_table.config.arn
}
