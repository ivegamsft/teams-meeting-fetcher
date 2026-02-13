// Meeting bot module - Lambda + DynamoDB

resource "aws_cloudwatch_log_group" "meeting_bot_logs" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

resource "aws_dynamodb_table" "meeting_bot_sessions" {
  name         = var.meetings_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "meeting_id"

  attribute {
    name = "meeting_id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = var.tags
}

resource "aws_iam_role" "meeting_bot_role" {
  name = var.function_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "meeting_bot_logs" {
  role       = aws_iam_role.meeting_bot_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "meeting_bot_dynamodb" {
  name = "${var.function_name}-dynamodb"
  role = aws_iam_role.meeting_bot_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.meeting_bot_sessions.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "meeting_bot_dynamodb_indexes" {
  name = "${var.function_name}-dynamodb-indexes"
  role = aws_iam_role.meeting_bot_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = "${aws_dynamodb_table.meeting_bot_sessions.arn}/index/*"
      }
    ]
  })
}

resource "aws_lambda_function" "meeting_bot" {
  function_name    = var.function_name
  role             = aws_iam_role.meeting_bot_role.arn
  handler          = var.handler
  runtime          = var.runtime
  filename         = data.archive_file.meeting_bot_zip.output_path
  source_code_hash = data.archive_file.meeting_bot_zip.output_base64sha256
  timeout          = var.timeout
  memory_size      = var.memory_size

  environment {
    variables = {
      GRAPH_TENANT_ID         = var.azure_graph_tenant_id
      GRAPH_CLIENT_ID         = var.azure_graph_client_id
      GRAPH_CLIENT_SECRET     = var.azure_graph_client_secret
      BOT_APP_ID              = var.azure_bot_app_id
      BOT_APP_SECRET          = var.azure_bot_app_secret
      ALLOWED_GROUP_ID        = var.azure_allowed_group_id
      GROUP_CACHE_TTL_SECONDS = tostring(var.group_cache_ttl_seconds)
      MEETINGS_TABLE          = aws_dynamodb_table.meeting_bot_sessions.name
      CALLBACK_URL            = var.callback_url
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.meeting_bot_logs,
    aws_iam_role_policy_attachment.meeting_bot_logs
  ]

  tags = var.tags
}

// Package the Lambda code from repo

data "archive_file" "meeting_bot_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../../lambda/meeting-bot"
  output_path = "${path.module}/.build/meeting-bot.zip"

  excludes = [".git", ".gitignore", "package-lock.json"]
}
// Lambda Function URL for direct webhook invocation (no API Gateway)
resource "aws_lambda_function_url" "meeting_bot_webhook" {
  function_name      = aws_lambda_function.meeting_bot.function_name
  authorization_type = "NONE"
  cors {
    allow_origins = ["*"]
    allow_methods = ["POST", "GET"]
    allow_headers = ["*"]
    max_age       = 86400
  }
}
