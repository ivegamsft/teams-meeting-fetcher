// AWS deployment entry point - Modularized structure
// See specs/infrastructure-minimal-serverless-spec.md for the full resource design.

locals {
  common_tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
  }
}

//=============================================================================
// STORAGE MODULE - S3 bucket for webhook payloads
//=============================================================================

module "storage" {
  source = "./modules/storage"

  bucket_name       = var.s3_bucket_name
  enable_versioning = false

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
// SUBSCRIPTION RENEWAL MODULE - Auto-renewal of Graph API subscriptions
//=============================================================================

module "subscription_renewal" {
  source = "./modules/subscription-renewal"

  environment                 = var.environment
  aws_region                  = var.aws_region
  aws_account_id              = var.aws_account_id
  subscriptions_table_name    = module.storage.subscriptions_table_name
  subscriptions_table_arn     = module.storage.subscriptions_table_arn
  azure_graph_tenant_id       = var.azure_graph_tenant_id
  azure_graph_client_id       = var.azure_graph_client_id
  azure_graph_client_secret   = var.azure_graph_client_secret
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
  runtime       = "nodejs18.x"
  package_path  = var.lambda_package_path
  s3_bucket_arn = module.storage.bucket_arn
  sns_topic_arn = module.notifications.topic_arn
  timeout       = 30
  memory_size   = 128

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
  runtime       = "nodejs18.x"
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

  function_name           = "tmf-meeting-bot-${var.environment}"
  handler                 = "index.handler"
  runtime                 = "nodejs18.x"
  timeout                 = 300
  memory_size             = 512
  meetings_table_name     = "meeting-bot-sessions-${var.environment}"
  azure_graph_tenant_id   = var.azure_graph_tenant_id
  azure_graph_client_id   = var.azure_graph_client_id
  azure_graph_client_secret = var.azure_graph_client_secret
  azure_bot_app_id        = var.azure_bot_app_id
  azure_bot_app_secret    = var.azure_bot_app_secret
  azure_allowed_group_id  = var.azure_allowed_group_id
  group_cache_ttl_seconds = var.group_cache_ttl_seconds

  tags = local.common_tags
}

//=============================================================================
// BOT API GATEWAY MODULE - Meeting Bot Webhooks
//=============================================================================

module "bot_api_gateway" {
  source = "./modules/bot-api"

  api_name             = "tmf-bot-api-${var.environment}"
  api_description      = "Teams Meeting Bot webhooks"
  lambda_invoke_arn    = module.meeting_bot.function_arn
  lambda_function_name = module.meeting_bot.function_name
  stage_name           = var.environment

  tags = local.common_tags
}
