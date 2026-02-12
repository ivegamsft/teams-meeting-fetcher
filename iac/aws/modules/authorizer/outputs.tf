output "function_name" {
  description = "Name of the authorizer Lambda function"
  value       = aws_lambda_function.authorizer.function_name
}

output "function_arn" {
  description = "ARN of the authorizer Lambda function"
  value       = aws_lambda_function.authorizer.arn
}

output "invoke_arn" {
  description = "Invoke ARN of the authorizer Lambda function"
  value       = aws_lambda_function.authorizer.invoke_arn
}

output "role_arn" {
  description = "ARN of the authorizer IAM role"
  value       = aws_iam_role.authorizer_role.arn
}
