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

variable "s3_bucket_name" {
  description = "S3 bucket name for webhook payload storage"
  type        = string
}

variable "lambda_package_path" {
  description = "Path to Lambda zip package"
  type        = string
  default     = "../../apps/aws-lambda/lambda.zip"
}

variable "authorizer_package_path" {
  description = "Path to authorizer Lambda zip package"
  type        = string
  default     = "../../apps/aws-lambda-authorizer/authorizer.zip"
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

variable "graph_tenant_id" {
  description = "Microsoft Graph tenant ID for subscription renewal"
  type        = string
  sensitive   = true
}

variable "graph_client_id" {
  description = "Microsoft Graph app client ID for subscription renewal"
  type        = string
  sensitive   = true
}

variable "graph_client_secret" {
  description = "Microsoft Graph app client secret for subscription renewal"
  type        = string
  sensitive   = true
}

variable "renewal_schedule_expression" {
  description = "AWS Events schedule expression (cron) for subscription renewal (default: 2 AM UTC daily)"
  type        = string
  default     = "cron(0 2 * * ? *)"
}

//=============================================================================
// MEETING BOT VARIABLES
//=============================================================================

variable "bot_app_id" {
  description = "Teams bot app (client) ID"
  type        = string
  sensitive   = true
}

variable "bot_app_secret" {
  description = "Teams bot app secret"
  type        = string
  sensitive   = true
}

variable "allowed_group_id" {
  description = "Entra group ID for bot allow-list"
  type        = string
}

variable "group_cache_ttl_seconds" {
  description = "Group membership cache TTL in seconds"
  type        = number
  default     = 900
}
