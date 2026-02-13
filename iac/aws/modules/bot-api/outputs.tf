output "api_id" {
  description = "API Gateway ID"
  value       = aws_api_gateway_rest_api.api.id
}

output "api_base_url" {
  description = "Base URL for the bot API"
  value       = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${data.aws_region.current.id}.amazonaws.com/${aws_api_gateway_stage.stage.stage_name}"
}

output "callbacks_url" {
  description = "Callback URL for bot call state updates"
  value       = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${data.aws_region.current.id}.amazonaws.com/${aws_api_gateway_stage.stage.stage_name}/bot/callbacks"
}

output "messages_url" {
  description = "Bot Framework messaging endpoint URL"
  value       = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${data.aws_region.current.id}.amazonaws.com/${aws_api_gateway_stage.stage.stage_name}/bot/messages"
}
