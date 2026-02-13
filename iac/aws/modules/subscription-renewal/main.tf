// Subscription Renewal Module
// Automatically renews Graph API subscriptions before expiry

//=============================================================================
// IAM ROLE FOR LAMBDA
//=============================================================================

resource "aws_iam_role" "subscription_renewal_role" {
  name = "tmf-subscription-renewal-${var.environment}"
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

// Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.subscription_renewal_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

// Policy for DynamoDB access
resource "aws_iam_role_policy" "dynamodb_access" {
  name = "dynamodb-subscriptions-access"
  role = aws_iam_role.subscription_renewal_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem"
        ]
        Resource = var.subscriptions_table_arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query"
        ]
        Resource = "${var.subscriptions_table_arn}/index/*"
      }
    ]
  })
}

// Policy for Secrets Manager (to retrieve Graph API credentials)
resource "aws_iam_role_policy" "secrets_access" {
  name = "secrets-manager-access"
  role = aws_iam_role.subscription_renewal_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:tmf/*"
      }
    ]
  })
}

//=============================================================================
// LAMBDA FUNCTION - Subscription Renewal
//=============================================================================

resource "aws_lambda_function" "subscription_renewal" {
  filename      = data.archive_file.renewal_lambda.output_path
  function_name = "tmf-subscription-renewal-${var.environment}"
  role          = aws_iam_role.subscription_renewal_role.arn
  handler       = "renewal-function.lambda_handler"
  runtime       = "python3.11"
  timeout       = 60
  memory_size   = 256

  environment {
    variables = {
      SUBSCRIPTIONS_TABLE = var.subscriptions_table_name
      GRAPH_TENANT_ID     = var.graph_tenant_id
      GRAPH_CLIENT_ID     = var.graph_client_id
      GRAPH_CLIENT_SECRET = var.graph_client_secret
    }
  }

  source_code_hash = data.archive_file.renewal_lambda.output_base64sha256

  tags = var.tags

  depends_on = [
    aws_cloudwatch_log_group.subscription_renewal_logs,
    aws_iam_role_policy_attachment.lambda_basic_execution
  ]
}

//=============================================================================
// ARCHIVE FILE - Lambda Code
//=============================================================================

data "archive_file" "renewal_lambda" {
  type        = "zip"
  source_file = "${path.root}/${var.lambda_source_file}"
  output_path = "${path.module}/.build/renewal-function.zip"
}

//=============================================================================
// CLOUDWATCH LOG GROUP
//=============================================================================

resource "aws_cloudwatch_log_group" "subscription_renewal_logs" {
  name              = "/aws/lambda/tmf-subscription-renewal-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

//=============================================================================
// EVENTBRIDGE RULE - Schedule Subscription Renewal
//=============================================================================

resource "aws_cloudwatch_event_rule" "subscription_renewal_schedule" {
  name                = "tmf-renew-subscriptions-${var.environment}"
  description         = "Renew expiring Graph API subscriptions daily"
  schedule_expression = var.renewal_schedule_expression

  tags = var.tags
}

//=============================================================================
// EVENTBRIDGE TARGET - Link Rule to Lambda
//=============================================================================

resource "aws_cloudwatch_event_target" "subscription_renewal_lambda" {
  rule      = aws_cloudwatch_event_rule.subscription_renewal_schedule.name
  target_id = "SubscriptionRenewalLambda"
  arn       = aws_lambda_function.subscription_renewal.arn

  retry_policy {
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 3600
  }
}

//=============================================================================
// IAM ROLE - EventBridge Invoke Lambda
//=============================================================================

resource "aws_iam_role" "eventbridge_invoke_lambda" {
  name = "tmf-eventbridge-invoke-renewal-${var.environment}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "eventbridge_invoke_lambda_policy" {
  name = "invoke-lambda-policy"
  role = aws_iam_role.eventbridge_invoke_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = aws_lambda_function.subscription_renewal.arn
      }
    ]
  })
}

//=============================================================================
// LAMBDA PERMISSION - Allow EventBridge to Invoke
//=============================================================================

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.subscription_renewal.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.subscription_renewal_schedule.arn
}

//=============================================================================
// CLOUDWATCH ALARM - Monitor Lambda Failures
//=============================================================================

resource "aws_cloudwatch_metric_alarm" "renewal_function_errors" {
  alarm_name          = "tmf-subscription-renewal-errors-${var.environment}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Alert when subscription renewal Lambda has errors"

  dimensions = {
    FunctionName = aws_lambda_function.subscription_renewal.function_name
  }

  alarm_actions = var.alarm_actions

  tags = var.tags
}
