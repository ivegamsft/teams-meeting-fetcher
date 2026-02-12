// Notifications module - SNS topic for email notifications

resource "aws_sns_topic" "notifications" {
  name         = var.topic_name
  display_name = var.display_name

  tags = var.tags
}

// Email subscription for notifications
resource "aws_sns_topic_subscription" "email" {
  count     = var.notification_email != null ? 1 : 0
  topic_arn = aws_sns_topic.notifications.arn
  protocol  = "email"
  endpoint  = var.notification_email

  # Note: Email subscriptions require manual confirmation via email
  # The subscription will be in "PendingConfirmation" state until confirmed
}

// Optional: SNS topic policy to allow Lambda to publish
resource "aws_sns_topic_policy" "notifications" {
  count  = var.allow_lambda_publish ? 1 : 0
  arn    = aws_sns_topic.notifications.arn
  policy = data.aws_iam_policy_document.sns_topic_policy[0].json
}

data "aws_iam_policy_document" "sns_topic_policy" {
  count = var.allow_lambda_publish ? 1 : 0

  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = [
      "SNS:Publish"
    ]

    resources = [
      aws_sns_topic.notifications.arn
    ]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [var.aws_account_id]
    }
  }
}
