// Lambda module - Lambda function with IAM role and policies

// IAM role for Lambda
resource "aws_iam_role" "lambda_role" {
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

// Policy for S3 access
resource "aws_iam_role_policy" "lambda_s3" {
  name = "${var.function_name}-s3"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = "${var.s3_bucket_arn}/*"
    }]
  })
}

// Policy for SNS publish (always created, includes SNS permissions)
resource "aws_iam_role_policy" "lambda_sns" {
  name = "${var.function_name}-sns"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sns:Publish"]
      Resource = "*"
    }]
  })
}

// CloudWatch Logs policy
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

// Lambda function
resource "aws_lambda_function" "function" {
  function_name    = var.function_name
  role             = aws_iam_role.lambda_role.arn
  handler          = var.handler
  runtime          = var.runtime
  filename         = var.package_path
  source_code_hash = filebase64sha256(var.package_path)
  timeout          = var.timeout
  memory_size      = var.memory_size

  environment {
    variables = merge(
      var.environment_variables,
      var.sns_topic_arn != null ? { SNS_TOPIC_ARN = var.sns_topic_arn } : {}
    )
  }

  tags = var.tags
}
