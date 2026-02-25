// Unified deployment for Teams Meeting Fetcher
// Deploys Azure resources first, then AWS resources that depend on Azure outputs

terraform {
  required_version = ">= 1.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

//=============================================================================
// PROVIDER CONFIGURATION
//=============================================================================

provider "azurerm" {
  subscription_id = var.azure_subscription_id
  tenant_id       = var.azure_tenant_id
  client_id       = var.azure_client_id
  client_secret   = var.use_oidc ? null : var.azure_client_secret
  use_oidc        = var.use_oidc

  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }

  storage_use_azuread = true
}

provider "azuread" {
  tenant_id     = var.azure_tenant_id
  client_id     = var.azure_client_id
  client_secret = var.use_oidc ? null : var.azure_client_secret
  use_oidc      = var.use_oidc
}

provider "aws" {
  region  = var.aws_region
  profile = var.use_oidc ? null : var.aws_profile

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "teams-meeting-fetcher"
      ManagedBy   = "terraform"
    }
  }
}

provider "random" {}

//=============================================================================
// AZURE DEPLOYMENT
//=============================================================================

module "azure" {
  source = "./azure"

  environment                 = var.environment
  azure_region                = var.azure_region
  region_short                = var.azure_region_short
  azure_subscription_id       = var.azure_subscription_id
  azure_tenant_id             = var.azure_tenant_id
  azure_client_id             = var.azure_client_id
  azure_client_secret         = var.azure_client_secret
  create_test_user            = var.create_test_user
  bot_app_display_name        = var.bot_app_display_name
  bot_messaging_endpoint      = var.bot_messaging_endpoint
  allowed_ip_addresses        = var.allowed_ip_addresses
  current_user_object_id      = var.current_user_object_id
  eventhub_local_auth_enabled = var.eventhub_local_auth_enabled
  admin_app_redirect_uri      = ""
}

//=============================================================================
// AWS DEPLOYMENT (depends on Azure outputs)
//=============================================================================

module "aws" {
  source = "./aws"

  # Ensures Azure resources are created first
  depends_on = [module.azure]

  # AWS configuration
  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = var.aws_account_id
  aws_profile    = var.aws_profile

  # S3 buckets
  webhook_bucket_name    = var.webhook_bucket_name
  transcript_bucket_name = var.transcript_bucket_name
  checkpoint_bucket_name = var.checkpoint_bucket_name

  # Lambda packages
  lambda_package_path          = var.lambda_package_path
  authorizer_package_path      = var.authorizer_package_path
  eventhub_lambda_package_path = var.eventhub_lambda_package_path

  # Webhook validation
  client_state       = var.client_state
  notification_email = var.notification_email

  # Azure credentials from Azure module outputs
  azure_graph_tenant_id     = module.azure.app_tenant_id
  azure_graph_client_id     = module.azure.app_client_id
  azure_graph_client_secret = module.azure.app_client_secret

  # Azure EventHub reader credentials (Lambda SPN)
  azure_eventhub_tenant_id     = module.azure.lambda_tenant_id
  azure_eventhub_client_id     = module.azure.lambda_client_id
  azure_eventhub_client_secret = module.azure.lambda_client_secret

  # Bot credentials from Azure module outputs
  azure_bot_app_id       = module.azure.bot_app_client_id
  azure_bot_app_secret   = module.azure.bot_app_client_secret
  azure_allowed_group_id = module.azure.admin_group_id

  # Event Hub from Azure module outputs
  eventhub_namespace      = module.azure.eventhub_namespace_name
  eventhub_name           = module.azure.eventhub_name
  eventhub_consumer_group = module.azure.eventhub_lambda_consumer_group
  message_processing_mode = var.message_processing_mode

  # Bot configuration
  group_cache_ttl_seconds = var.group_cache_ttl_seconds
  teams_catalog_app_id    = var.teams_catalog_app_id
  watched_user_ids        = var.watched_user_ids
  poll_lookahead_minutes  = var.poll_lookahead_minutes

  # Graph notifications (will be updated after first deploy)
  graph_notification_url          = var.graph_notification_url
  graph_notification_client_state = var.graph_notification_client_state

  # Schedules
  renewal_schedule_expression       = var.renewal_schedule_expression
  eventhub_poll_schedule_expression = var.eventhub_poll_schedule_expression
  eventhub_poll_window_minutes      = var.eventhub_poll_window_minutes
  eventhub_max_events               = var.eventhub_max_events
  eventhub_checkpoints_table_name   = var.eventhub_checkpoints_table_name

  # Admin app configuration
  resource_suffix                  = module.azure.deployment_suffix
  sanitized_transcript_bucket_name = var.sanitized_transcript_bucket_name
  admin_app_session_secret         = var.admin_app_session_secret
  admin_app_api_key                = var.admin_app_api_key
  admin_app_dashboard_password     = var.admin_app_dashboard_password

  # Admin app Entra ID OIDC auth (from Azure module outputs)
  admin_app_entra_tenant_id     = module.azure.app_tenant_id
  admin_app_entra_client_id     = module.azure.admin_app_client_id
  admin_app_entra_client_secret = module.azure.admin_app_client_secret
  admin_app_entra_redirect_uri  = ""
}

//=============================================================================
// ADMIN APP REDIRECT URI (depends on ECS being deployed, then sets Entra URI)
// Uses data "external" to discover the Fargate task's public IP, then
// azuread_application_redirect_uris to register it on the Entra app.
//=============================================================================

data "external" "admin_app_ip" {
  depends_on = [module.aws]

  program = ["bash", "${path.module}/scripts/get-ecs-task-ip.sh"]

  query = {
    cluster = module.aws.admin_app_ecs_cluster_name
    service = module.aws.admin_app_ecs_service_name
  }
}

resource "azuread_application_redirect_uris" "admin_app" {
  application_id = "/applications/${module.azure.admin_app_object_id}"
  type           = "Web"

  redirect_uris = data.external.admin_app_ip.result.ip != "" ? [
    "http://${data.external.admin_app_ip.result.ip}:3000/auth/callback"
  ] : [
    "http://localhost:3000/auth/callback"
  ]
}
