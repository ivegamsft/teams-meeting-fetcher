variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "aws_region" {
  description = "AWS region (e.g., us-east-1)"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
  sensitive   = true
}

variable "webhook_bucket_name" {
  description = "S3 bucket name for webhook payload storage"
  type        = string
}

variable "transcript_bucket_name" {
  description = "S3 bucket name for meeting transcript storage"
  type        = string
}

variable "checkpoint_bucket_name" {
  description = "S3 bucket name for Event Hub checkpoint storage"
  type        = string
}

variable "sanitized_transcript_bucket_name" {
  description = "S3 bucket name for sanitized transcript storage"
  type        = string
  default     = "tmf-sanitized-transcripts"
}

variable "resource_suffix" {
  description = "Unique suffix for resource naming (e.g., 8akfpg)"
  type        = string
  default     = ""
}

variable "eventhub_checkpoints_table_name" {
  description = "DynamoDB table name for Event Hub checkpoints"
  type        = string
  default     = "eventhub-checkpoints"
}

variable "subscriptions_table_name" {
  description = "DynamoDB table name for Graph subscription tracking"
  type        = string
  default     = "graph-subscriptions"
}

variable "lambda_package_path" {
  description = "Path to Lambda zip package"
  type        = string
  default     = "../apps/aws-lambda/lambda.zip"
}

variable "eventhub_lambda_package_path" {
  description = "Path to Event Hub processor Lambda zip package"
  type        = string
  default     = "../apps/aws-lambda-eventhub/lambda.zip"
}

variable "authorizer_package_path" {
  description = "Path to authorizer Lambda zip package"
  type        = string
  default     = "../apps/aws-lambda-authorizer/authorizer.zip"
}

variable "meeting_bot_package_path" {
  description = "Path to meeting bot Lambda zip package"
  type        = string
  default     = "../apps/meeting-bot/meeting-bot.zip"
}

variable "client_state" {
  description = "Client state secret for validating Graph webhook notifications"
  type        = string
  sensitive   = true
}

variable "notification_email" {
  description = "Email address to send notifications to (requires confirmation)"
  type        = string
  default     = null
}

variable "aws_profile" {
  description = "AWS CLI profile name (optional, for credential isolation)"
  type        = string
  default     = null
}

//=============================================================================
// SUBSCRIPTION RENEWAL VARIABLES
//=============================================================================

variable "azure_graph_tenant_id" {
  description = "Microsoft Graph tenant ID for subscription renewal"
  type        = string
  sensitive   = true
}

variable "azure_graph_client_id" {
  description = "Microsoft Graph app client ID for subscription renewal"
  type        = string
  sensitive   = true
}

variable "azure_graph_client_secret" {
  description = "Microsoft Graph app client secret for subscription renewal"
  type        = string
  sensitive   = true
}

variable "azure_eventhub_tenant_id" {
  description = "Azure tenant ID for EventHub reader (Lambda SPN)"
  type        = string
  sensitive   = true
}

variable "azure_eventhub_client_id" {
  description = "Azure client ID for EventHub reader (Lambda SPN)"
  type        = string
  sensitive   = true
}

variable "azure_eventhub_client_secret" {
  description = "Azure client secret for EventHub reader (Lambda SPN)"
  type        = string
  sensitive   = true
}

//=============================================================================
// EVENT HUB PROCESSOR VARIABLES
//=============================================================================

variable "eventhub_namespace" {
  description = "Event Hub namespace FQDN"
  type        = string
}

variable "eventhub_name" {
  description = "Event Hub name"
  type        = string
}

variable "eventhub_consumer_group" {
  description = "Event Hub consumer group for Lambda processor"
  type        = string
  default     = "lambda-processor"
}

variable "eventhub_max_events" {
  description = "Max events per poll"
  type        = number
  default     = 50
}

variable "eventhub_poll_window_minutes" {
  description = "Lookback window (minutes) for polling"
  type        = number
  default     = 10
}

variable "eventhub_poll_schedule_expression" {
  description = "EventBridge schedule for Event Hub polling"
  type        = string
  default     = "rate(1 minute)"
}

variable "message_processing_mode" {
  description = "Event Hub message processing mode: 'consume' (default) or 'peek' (testing)"
  type        = string
  default     = "consume"
}

variable "graph_tenant_domain" {
  description = "Azure AD tenant domain for EventHub Graph API notifications"
  type        = string
  default     = ""
}

variable "renewal_schedule_expression" {
  description = "AWS Events schedule expression (cron) for subscription renewal (default: 2 AM UTC daily)"
  type        = string
  default     = "cron(0 2 * * ? *)"
}

//=============================================================================
// MEETING BOT VARIABLES
//=============================================================================

variable "azure_bot_app_id" {
  description = "Teams bot app (client) ID"
  type        = string
  sensitive   = true
}

variable "azure_bot_app_secret" {
  description = "Teams bot app secret"
  type        = string
  sensitive   = true
}

variable "azure_allowed_group_id" {
  description = "Entra group ID for bot allow-list"
  type        = string
}

variable "group_cache_ttl_seconds" {
  description = "Group membership cache TTL in seconds"
  type        = number
  default     = 900
}

//=============================================================================
// AUTO-INSTALL VARIABLES
//=============================================================================

variable "teams_catalog_app_id" {
  description = "Teams app catalog ID for auto-installation (Get-TeamsApp -DistributionMethod Organization)"
  type        = string
  default     = ""
}

variable "watched_user_ids" {
  description = "Comma-separated AAD user IDs whose calendars are polled. If empty, uses group members."
  type        = string
  default     = ""
}

variable "poll_lookahead_minutes" {
  description = "How many minutes ahead to look for upcoming meetings"
  type        = number
  default     = 60
}

variable "graph_notification_url" {
  description = "Base URL for Graph change notification webhooks (Lambda Function URL). Set after first deploy."
  type        = string
  default     = ""
}

variable "graph_notification_client_state" {
  description = "Secret client state string for Graph notification validation"
  type        = string
  default     = ""
  sensitive   = true
}

//=============================================================================
// ADMIN APP VARIABLES
//=============================================================================

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

//=============================================================================
// ADMIN APP ENTRA ID AUTH
//=============================================================================

variable "admin_app_entra_tenant_id" {
  description = "Entra ID tenant ID for admin app OIDC sign-in"
  type        = string
}

variable "admin_app_entra_client_id" {
  description = "Entra ID client ID for admin app OIDC sign-in"
  type        = string
}

variable "admin_app_entra_client_secret" {
  description = "Entra ID client secret for admin app OIDC sign-in"
  type        = string
  sensitive   = true
}

variable "admin_app_entra_redirect_uri" {
  description = "Entra ID OIDC redirect URI"
  type        = string
  default     = ""
}

variable "admin_app_webhook_url" {
  description = "URL of the admin app webhook endpoint for notification forwarding"
  type        = string
  default     = ""
}

variable "webhook_auth_secret" {
  description = "Shared secret for webhook authentication between Lambda and admin app"
  type        = string
  sensitive   = true
  default     = ""
}

variable "webhook_client_state" {
  description = "Client state for Graph notification validation in admin app"
  type        = string
  sensitive   = true
  default     = ""
}
