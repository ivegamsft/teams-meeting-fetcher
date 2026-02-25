// Variables for unified deployment

//=============================================================================
// COMMON VARIABLES
//=============================================================================

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

//=============================================================================
// AZURE VARIABLES
//=============================================================================

variable "azure_region" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "azure_region_short" {
  description = "Short form of Azure region"
  type        = string
  default     = "eus"
}

variable "azure_subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "azure_tenant_id" {
  description = "Azure AD tenant ID"
  type        = string
}

variable "azure_client_id" {
  description = "Azure Service Principal client ID"
  type        = string
}

variable "azure_client_secret" {
  description = "Azure Service Principal client secret (not required when use_oidc = true)"
  type        = string
  sensitive   = true
  default     = null
}

variable "use_oidc" {
  description = "Use OIDC authentication for Azure provider (true for CI/CD, false for local with SPN)"
  type        = bool
  default     = false
}

variable "create_test_user" {
  description = "Whether to create a test user"
  type        = bool
  default     = false
}

variable "bot_app_display_name" {
  description = "Display name for the Teams bot application"
  type        = string
  default     = "Teams Meeting Fetcher Bot"
}

variable "bot_messaging_endpoint" {
  description = "Bot messaging endpoint URL"
  type        = string
}

variable "allowed_ip_addresses" {
  description = "List of IP addresses allowed to access Key Vault and Storage"
  type        = list(string)
  default     = []
}

variable "current_user_object_id" {
  description = "Object ID of the current user for RBAC role assignments (e.g., for Event Hub access). If not provided, uses the Terraform executor's identity."
  type        = string
  default     = null
}

variable "eventhub_local_auth_enabled" {
  description = "Enable local authentication (SharedAccessKey) for Event Hub. Set to false to enforce RBAC only."
  type        = bool
  default     = false
}

//=============================================================================
// AWS VARIABLES
//=============================================================================

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
}

variable "aws_profile" {
  description = "AWS CLI profile name"
  type        = string
  default     = "default"
}

variable "webhook_bucket_name" {
  description = "S3 bucket name for webhook payloads"
  type        = string
}

variable "transcript_bucket_name" {
  description = "S3 bucket name for meeting transcripts"
  type        = string
}

variable "checkpoint_bucket_name" {
  description = "S3 bucket name for Event Hub checkpoints"
  type        = string
}

variable "lambda_package_path" {
  description = "Path to Lambda deployment package"
  type        = string
  default     = "../apps/aws-lambda/lambda.zip"
}

variable "authorizer_package_path" {
  description = "Path to authorizer Lambda package"
  type        = string
  default     = "../apps/aws-lambda-authorizer/authorizer.zip"
}

variable "eventhub_lambda_package_path" {
  description = "Path to Event Hub processor Lambda package"
  type        = string
  default     = "../apps/aws-lambda-eventhub/lambda.zip"
}

variable "client_state" {
  description = "Client state secret for webhook validation"
  type        = string
  sensitive   = true
}

variable "notification_email" {
  description = "Email address for notifications"
  type        = string
  default     = ""
}

//=============================================================================
// EVENT HUB VARIABLES
//=============================================================================

variable "eventhub_consumer_group" {
  description = "Event Hub consumer group (unused in unified deployment — flows from Azure module output)"
  type        = string
  default     = "lambda-processor"
}

variable "eventhub_poll_schedule_expression" {
  description = "EventBridge schedule for Event Hub polling"
  type        = string
  default     = "rate(1 minute)"
}

variable "eventhub_poll_window_minutes" {
  description = "Minutes to look back when polling Event Hub"
  type        = number
  default     = 10
}

variable "eventhub_max_events" {
  description = "Maximum events to process per poll"
  type        = number
  default     = 50
}

variable "eventhub_checkpoints_table_name" {
  description = "DynamoDB table name for Event Hub checkpoints"
  type        = string
  default     = "eventhub-checkpoints"
}

variable "message_processing_mode" {
  description = "Event Hub message processing mode: 'consume' (default) or 'peek' (testing)"
  type        = string
  default     = "consume"
}

//=============================================================================
// BOT CONFIGURATION VARIABLES
//=============================================================================

variable "group_cache_ttl_seconds" {
  description = "Group membership cache TTL in seconds"
  type        = number
  default     = 900
}

variable "teams_catalog_app_id" {
  description = "Teams app catalog ID"
  type        = string
  default     = ""
}

variable "watched_user_ids" {
  description = "Comma-separated list of user IDs to watch"
  type        = string
  default     = ""
}

variable "poll_lookahead_minutes" {
  description = "Minutes to look ahead for upcoming meetings"
  type        = number
  default     = 60
}

variable "graph_notification_url" {
  description = "Graph notification webhook URL"
  type        = string
  default     = ""
}

variable "graph_notification_client_state" {
  description = "Client state for Graph notifications"
  type        = string
  default     = ""
}

variable "renewal_schedule_expression" {
  description = "Schedule for subscription renewal"
  type        = string
  default     = "cron(0 2 * * ? *)"
}
//=============================================================================
// ROOT-LEVEL VARIABLES (passed to submodules)
//=============================================================================

variable "region_short" {
  description = "Short form of region for naming"
  type        = string
  default     = "eus"
}

variable "meeting_bot_package_path" {
  description = "Path to meeting bot Lambda zip package"
  type        = string
  default     = "../../lambda/meeting-bot/meeting-bot.zip"
}

variable "eventhub_namespace" {
  description = "Event Hub namespace FQDN"
  type        = string
  default     = ""
}

//=============================================================================
// ADMIN APP VARIABLES
//=============================================================================

variable "sanitized_transcript_bucket_name" {
  description = "S3 bucket name for sanitized transcripts"
  type        = string
  default     = "tmf-sanitized-transcripts"
}

variable "admin_app_session_secret" {
  description = "Express session secret for admin app"
  type        = string
  sensitive   = true
  default     = ""
}

variable "admin_app_api_key" {
  description = "API key for admin app"
  type        = string
  sensitive   = true
  default     = ""
}

variable "admin_app_dashboard_password" {
  description = "Dashboard password for admin app"
  type        = string
  sensitive   = true
  default     = ""
}

variable "admin_app_entra_redirect_uri" {
  description = "Entra ID OIDC redirect URI for admin app (ALB DNS + /auth/callback). If empty, constructed from ALB DNS at deploy time."
  type        = string
  default     = ""
}
