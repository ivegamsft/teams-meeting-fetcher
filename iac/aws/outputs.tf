output "api_webhook_url" {
  description = "API Gateway webhook URL"
  value       = "${aws_api_gateway_deployment.graph.invoke_url}/graph"
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.webhook_writer.function_name
}

output "s3_bucket_name" {
  description = "S3 bucket for webhook payloads"
  value       = aws_s3_bucket.webhook_payloads.bucket
}
