// Authorizer module - Lambda REQUEST authorizer for API Gateway
// Validates Microsoft Graph webhook callbacks

// IAM role for authorizer Lambda
resource "aws_iam_role" "authorizer_role" {
  name = var.function_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

// CloudWatch Logs policy for authorizer
resource "aws_iam_role_policy_attachment" "authorizer_logs" {
  role       = aws_iam_role.authorizer_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

// Authorizer Lambda function
resource "aws_lambda_function" "authorizer" {
  function_name    = var.function_name
  role             = aws_iam_role.authorizer_role.arn
  handler          = var.handler
  runtime          = var.runtime
  filename         = var.package_path
  source_code_hash = filebase64sha256(var.package_path)
  timeout          = var.timeout
  memory_size      = var.memory_size

  environment {
    variables = {
      CLIENT_STATE = var.client_state
    }
  }

  tags = var.tags
}

// CloudWatch log group for authorizer
resource "aws_cloudwatch_log_group" "authorizer" {
  name              = "/aws/lambda/${aws_lambda_function.authorizer.function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}
