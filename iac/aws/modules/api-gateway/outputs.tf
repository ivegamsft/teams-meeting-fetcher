output "api_id" {
  description = "ID of the API Gateway REST API"
  value       = aws_api_gateway_rest_api.api.id
}

output "api_execution_arn" {
  description = "Execution ARN of the API Gateway REST API"
  value       = aws_api_gateway_rest_api.api.execution_arn
}

output "invoke_url" {
  description = "URL to invoke the API Gateway deployment"
  value       = aws_api_gateway_deployment.deployment.invoke_url
}

output "webhook_url" {
  description = "Full webhook URL (invoke_url + path)"
  value       = "${aws_api_gateway_deployment.deployment.invoke_url}/${var.path_part}"
}

output "deployment_id" {
  description = "ID of the API Gateway deployment"
  value       = aws_api_gateway_deployment.deployment.id
}
