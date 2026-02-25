// AWS deployment entry point - Modularized structure
// See specs/infrastructure-minimal-serverless-spec.md for the full resource design.

locals {
  common_tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
  }
}

moved {
  from = module.storage.aws_dynamodb_table.graph_subscriptions
  to   = module.dynamodb.aws_dynamodb_table.graph_subscriptions
}

moved {
  from = module.storage.aws_dynamodb_table.eventhub_checkpoints
  to   = module.dynamodb.aws_dynamodb_table.eventhub_checkpoints
}

//=============================================================================
// STORAGE MODULE - S3 buckets for webhooks, transcripts, and checkpoints
//=============================================================================

module "storage" {
  source = "./modules/storage"

  buckets = {
    webhooks = {
      name              = var.webhook_bucket_name
      enable_versioning = false
    }
    transcripts = {
      name              = var.transcript_bucket_name
      enable_versioning = true
    }
    checkpoints = {
      name              = var.checkpoint_bucket_name
      enable_versioning = false
    }
    sanitized_transcripts = {
      name              = var.sanitized_transcript_bucket_name
      enable_versioning = true
    }
  }

  tags = local.common_tags
}

//=============================================================================
// DYNAMODB MODULE - Subscription metadata + Event Hub checkpoints
//=============================================================================

module "dynamodb" {
  source = "./modules/dynamodb"

  subscriptions_table_name        = var.subscriptions_table_name
  eventhub_checkpoints_table_name = var.eventhub_checkpoints_table_name
  resource_suffix                 = var.resource_suffix

  tags = local.common_tags
}

//=============================================================================
// NOTIFICATIONS MODULE - SNS topic for email alerts
//=============================================================================

module "notifications" {
  source = "./modules/notifications"

  topic_name         = "tmf-notifications-${var.environment}"
  display_name       = "Teams Meeting Fetcher Notifications"
  notification_email = var.notification_email
  aws_account_id     = var.aws_account_id

  tags = local.common_tags
}

//=============================================================================
// SECURITY MODULE - Azure RBAC credentials (Event Hub, Graph API, Teams Bot)
//=============================================================================

module "security" {
  source = "./modules/security"

  environment                   = var.environment
  eventhub_reader_tenant_id     = var.azure_eventhub_tenant_id
  eventhub_reader_client_id     = var.azure_eventhub_client_id
  eventhub_reader_client_secret = var.azure_eventhub_client_secret
  graph_api_tenant_id           = var.azure_graph_tenant_id
  graph_api_client_id           = var.azure_graph_client_id
  graph_api_client_secret       = var.azure_graph_client_secret
  bot_app_id                    = var.azure_bot_app_id
  bot_app_secret                = var.azure_bot_app_secret
  bot_allowed_group_id          = var.azure_allowed_group_id

  tags = local.common_tags
}

//=============================================================================
// SUBSCRIPTION RENEWAL MODULE - Auto-renewal of Graph API subscriptions
//=============================================================================

module "subscription_renewal" {
  source = "./modules/subscription-renewal"

  environment                 = var.environment
  aws_region                  = var.aws_region
  aws_account_id              = var.aws_account_id
  subscriptions_table_name    = module.dynamodb.subscriptions_table_name
  subscriptions_table_arn     = module.dynamodb.subscriptions_table_arn
  azure_graph_tenant_id       = module.security.graph_api_tenant_id
  azure_graph_client_id       = module.security.graph_api_client_id
  azure_graph_client_secret   = module.security.graph_api_client_secret
  renewal_schedule_expression = var.renewal_schedule_expression
  alarm_actions               = [module.notifications.topic_arn]

  tags = local.common_tags
}

//=============================================================================
// LAMBDA MODULE - Function for webhook processing
//=============================================================================

module "lambda" {
  source = "./modules/lambda"

  function_name = "tmf-webhook-writer-${var.environment}"
  handler       = "handler.handler"
  runtime       = "nodejs20.x"
  package_path  = var.lambda_package_path
  bucket_arn    = module.storage.bucket_arns["webhooks"]
  sns_topic_arn = module.notifications.topic_arn
  # No DynamoDB for this Lambda
  timeout     = 30
  memory_size = 128

  environment_variables = {
    BUCKET_NAME  = module.storage.bucket_name
    CLIENT_STATE = var.client_state
  }

  tags = local.common_tags
}

//=============================================================================
// AUTHORIZER MODULE - Lambda authorizer for API Gateway
//=============================================================================

module "authorizer" {
  source = "./modules/authorizer"

  function_name = "tmf-webhook-authorizer-${var.environment}"
  handler       = "authorizer.handler"
  runtime       = "nodejs20.x"
  package_path  = var.authorizer_package_path
  client_state  = var.client_state
  timeout       = 10
  memory_size   = 128

  tags = local.common_tags
}

//=============================================================================
// API GATEWAY MODULE - REST API for webhook receiver
//=============================================================================

module "api_gateway" {
  source = "./modules/api-gateway"

  api_name                 = "tmf-graph-webhooks-${var.environment}"
  api_description          = "Teams Meeting Fetcher Graph webhook receiver"
  path_part                = "graph"
  http_method              = "POST"
  authorization            = "NONE"
  lambda_invoke_arn        = module.lambda.invoke_arn
  lambda_function_name     = module.lambda.function_name
  authorizer_invoke_arn    = module.authorizer.invoke_arn
  authorizer_function_name = module.authorizer.function_name
  stage_name               = var.environment

  tags = local.common_tags
}

//=============================================================================
// MEETING BOT MODULE - Bot Lambda + DynamoDB
//=============================================================================

module "meeting_bot" {
  source = "./modules/meeting-bot"

  function_name                   = "tmf-meeting-bot-${var.environment}"
  handler                         = "index.handler"
  runtime                         = "nodejs20.x"
  package_path                    = var.meeting_bot_package_path
  timeout                         = 300
  memory_size                     = 512
  meetings_table_name             = "meeting-bot-sessions-${var.environment}"
  azure_graph_tenant_id           = module.security.graph_api_tenant_id
  azure_graph_client_id           = module.security.graph_api_client_id
  azure_graph_client_secret       = module.security.graph_api_client_secret
  azure_bot_app_id                = module.security.bot_app_id
  azure_bot_app_secret            = module.security.bot_app_secret
  azure_allowed_group_id          = var.azure_allowed_group_id
  group_cache_ttl_seconds         = var.group_cache_ttl_seconds
  transcript_bucket_name          = module.storage.bucket_names["transcripts"]
  transcript_bucket_arn           = module.storage.bucket_arns["transcripts"]
  teams_catalog_app_id            = var.teams_catalog_app_id
  watched_user_ids                = var.watched_user_ids
  poll_lookahead_minutes          = var.poll_lookahead_minutes
  graph_notification_url          = var.graph_notification_url
  graph_notification_client_state = var.graph_notification_client_state

  tags = local.common_tags
}

//=============================================================================
// EVENT HUB PROCESSOR - Lambda consumer (RBAC only)
//=============================================================================

module "eventhub_processor" {
  source = "./modules/eventhub-processor"

  function_name                = "tmf-eventhub-processor-${var.environment}"
  handler                      = "handler.handler"
  runtime                      = "nodejs20.x"
  timeout                      = 60
  memory_size                  = 256
  package_path                 = var.eventhub_lambda_package_path
  bucket_name                  = module.storage.bucket_names["webhooks"]
  bucket_arn                   = module.storage.bucket_arns["webhooks"]
  checkpoint_table_name        = module.dynamodb.eventhub_checkpoints_table_name
  checkpoint_table_arn         = module.dynamodb.eventhub_checkpoints_table_arn
  eventhub_namespace           = var.eventhub_namespace
  eventhub_name                = var.eventhub_name
  eventhub_consumer_group      = var.eventhub_consumer_group
  eventhub_max_events          = var.eventhub_max_events
  eventhub_poll_window_minutes = var.eventhub_poll_window_minutes
  message_processing_mode      = var.message_processing_mode
  azure_tenant_id              = module.security.eventhub_reader_tenant_id
  azure_client_id              = module.security.eventhub_reader_client_id
  azure_client_secret          = module.security.eventhub_reader_client_secret
  sns_topic_arn                = module.notifications.topic_arn

  tags = local.common_tags
}

//=============================================================================
// EVENT HUB POLLING SCHEDULE - EventBridge rule to invoke processor
//=============================================================================

resource "aws_cloudwatch_event_rule" "eventhub_poll" {
  name                = "tmf-eventhub-poll-${var.environment}"
  description         = "Poll Azure Event Hub for Graph notifications"
  schedule_expression = var.eventhub_poll_schedule_expression

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "eventhub_poll_target" {
  rule      = aws_cloudwatch_event_rule.eventhub_poll.name
  target_id = "EventHubProcessorLambda"
  arn       = module.eventhub_processor.function_arn

  retry_policy {
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 3600
  }
}

resource "aws_lambda_permission" "eventhub_poll_invoke" {
  statement_id  = "AllowEventBridgeInvokeEventHubProcessor"
  action        = "lambda:InvokeFunction"
  function_name = module.eventhub_processor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.eventhub_poll.arn
}

//=============================================================================
// BOT API GATEWAY MODULE - Meeting Bot Webhooks
//=============================================================================

module "bot_api_gateway" {
  source = "./modules/bot-api"

  api_name                 = "tmf-bot-api-${var.environment}"
  api_description          = "Teams Meeting Bot webhooks"
  lambda_invoke_arn        = module.meeting_bot.function_arn
  lambda_function_name     = module.meeting_bot.function_name
  authorizer_invoke_arn    = module.authorizer.invoke_arn
  authorizer_function_name = module.authorizer.function_name
  stage_name               = var.environment

  tags = local.common_tags
}

//=============================================================================
// ADMIN APP MODULE - ECS Fargate (VPC, ALB, ECR, Secrets Manager)
//=============================================================================

module "admin_app" {
  source = "./modules/admin-app"

  resource_suffix = var.resource_suffix
  environment     = var.environment
  aws_region      = var.aws_region

  # DynamoDB tables
  subscriptions_table_name        = module.dynamodb.subscriptions_table_name
  subscriptions_table_arn         = module.dynamodb.subscriptions_table_arn
  meetings_table_name             = module.dynamodb.meetings_table_name
  meetings_table_arn              = module.dynamodb.meetings_table_arn
  transcripts_table_name          = module.dynamodb.transcripts_table_name
  transcripts_table_arn           = module.dynamodb.transcripts_table_arn
  config_table_name               = module.dynamodb.config_table_name
  config_table_arn                = module.dynamodb.config_table_arn
  eventhub_checkpoints_table_name = module.dynamodb.eventhub_checkpoints_table_name
  eventhub_checkpoints_table_arn  = module.dynamodb.eventhub_checkpoints_table_arn

  # S3 buckets
  webhook_bucket_name              = module.storage.bucket_names["webhooks"]
  webhook_bucket_arn               = module.storage.bucket_arns["webhooks"]
  transcript_bucket_name           = module.storage.bucket_names["transcripts"]
  transcript_bucket_arn            = module.storage.bucket_arns["transcripts"]
  sanitized_transcript_bucket_name = module.storage.bucket_names["sanitized_transcripts"]
  sanitized_transcript_bucket_arn  = module.storage.bucket_arns["sanitized_transcripts"]
  checkpoint_bucket_name           = module.storage.bucket_names["checkpoints"]
  checkpoint_bucket_arn            = module.storage.bucket_arns["checkpoints"]

  # Graph API credentials
  graph_tenant_id     = var.azure_graph_tenant_id
  graph_client_id     = var.azure_graph_client_id
  graph_client_secret = var.azure_graph_client_secret
  entra_group_id      = var.azure_allowed_group_id

  # App secrets
  session_secret     = var.admin_app_session_secret
  api_key            = var.admin_app_api_key
  dashboard_password = var.admin_app_dashboard_password

  # Entra ID OIDC auth
  entra_tenant_id     = var.admin_app_entra_tenant_id
  entra_client_id     = var.admin_app_entra_client_id
  entra_client_secret = var.admin_app_entra_client_secret
  entra_redirect_uri  = var.admin_app_entra_redirect_uri

  tags = local.common_tags
}
