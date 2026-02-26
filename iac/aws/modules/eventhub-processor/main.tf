resource "aws_iam_role" "eventhub_role" {
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

resource "aws_iam_role_policy_attachment" "eventhub_logs" {
  role       = aws_iam_role.eventhub_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "eventhub_s3" {
  name = "${var.function_name}-s3"
  role = aws_iam_role.eventhub_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${var.bucket_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = var.bucket_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "eventhub_checkpoints" {
  name = "${var.function_name}-checkpoints"
  role = aws_iam_role.eventhub_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DescribeTable"
        ]
        Resource = var.checkpoint_table_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "eventhub_sns" {
  name = "${var.function_name}-sns"
  role = aws_iam_role.eventhub_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = var.sns_topic_arn
      }
    ]
  })
}

resource "aws_lambda_function" "eventhub" {
  function_name = var.function_name
  role          = aws_iam_role.eventhub_role.arn
  handler       = var.handler
  runtime       = var.runtime
  timeout       = var.timeout
  memory_size   = var.memory_size

  filename         = var.package_path
  source_code_hash = try(filebase64sha256(var.package_path), null)

  environment {
    variables = merge(
      {
        EVENT_HUB_NAMESPACE           = var.eventhub_namespace
        EVENT_HUB_NAME                = var.eventhub_name
        CONSUMER_GROUP                = var.eventhub_consumer_group
        EVENT_HUB_MAX_EVENTS          = tostring(var.eventhub_max_events)
        EVENT_HUB_POLL_WINDOW_MINUTES = tostring(var.eventhub_poll_window_minutes)
        MESSAGE_PROCESSING_MODE       = var.message_processing_mode
        EVENTHUB_CHECKPOINT_TABLE     = var.checkpoint_table_name
        BUCKET_NAME                   = var.bucket_name
        AZURE_TENANT_ID               = var.azure_tenant_id
        AZURE_CLIENT_ID               = var.azure_client_id
        AZURE_CLIENT_SECRET           = var.azure_client_secret
      },
      var.sns_topic_arn != null ? { SNS_TOPIC_ARN = var.sns_topic_arn } : {},
      var.admin_app_webhook_url != "" ? { ADMIN_APP_WEBHOOK_URL = var.admin_app_webhook_url } : {},
      var.webhook_auth_secret != "" ? { WEBHOOK_AUTH_SECRET = var.webhook_auth_secret } : {}
    )
  }

  tags = var.tags
}
