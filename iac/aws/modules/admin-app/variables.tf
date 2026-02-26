// Variables for admin-app ECS Fargate module

variable "resource_suffix" {
  description = "Unique suffix for resource naming (e.g., 8akfpg)"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

//=============================================================================
// VPC CONFIGURATION
//=============================================================================

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for subnets"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

//=============================================================================
// ECS CONFIGURATION
//=============================================================================

variable "task_cpu" {
  description = "CPU units for the ECS task (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Memory (MiB) for the ECS task"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 1
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

//=============================================================================
// DYNAMODB TABLE NAMES + ARNS
//=============================================================================

variable "subscriptions_table_name" {
  description = "DynamoDB subscriptions table name"
  type        = string
}

variable "subscriptions_table_arn" {
  description = "DynamoDB subscriptions table ARN"
  type        = string
}

variable "meetings_table_name" {
  description = "DynamoDB meetings table name"
  type        = string
}

variable "meetings_table_arn" {
  description = "DynamoDB meetings table ARN"
  type        = string
}

variable "transcripts_table_name" {
  description = "DynamoDB transcripts table name"
  type        = string
}

variable "transcripts_table_arn" {
  description = "DynamoDB transcripts table ARN"
  type        = string
}

variable "config_table_name" {
  description = "DynamoDB config table name"
  type        = string
}

variable "config_table_arn" {
  description = "DynamoDB config table ARN"
  type        = string
}

variable "eventhub_checkpoints_table_name" {
  description = "DynamoDB Event Hub checkpoints table name"
  type        = string
}

variable "eventhub_checkpoints_table_arn" {
  description = "DynamoDB Event Hub checkpoints table ARN"
  type        = string
}

//=============================================================================
// S3 BUCKET NAMES + ARNS
//=============================================================================

variable "webhook_bucket_name" {
  description = "S3 webhook bucket name"
  type        = string
}

variable "webhook_bucket_arn" {
  description = "S3 webhook bucket ARN"
  type        = string
}

variable "transcript_bucket_name" {
  description = "S3 transcript bucket name"
  type        = string
}

variable "transcript_bucket_arn" {
  description = "S3 transcript bucket ARN"
  type        = string
}

variable "sanitized_transcript_bucket_name" {
  description = "S3 sanitized transcript bucket name"
  type        = string
}

variable "sanitized_transcript_bucket_arn" {
  description = "S3 sanitized transcript bucket ARN"
  type        = string
}

variable "checkpoint_bucket_name" {
  description = "S3 checkpoint bucket name"
  type        = string
}

variable "checkpoint_bucket_arn" {
  description = "S3 checkpoint bucket ARN"
  type        = string
}

//=============================================================================
// GRAPH API / AZURE CREDENTIALS (non-sensitive, passed as env vars)
//=============================================================================

variable "graph_tenant_id" {
  description = "Microsoft Graph tenant ID"
  type        = string
}

variable "graph_client_id" {
  description = "Microsoft Graph client ID"
  type        = string
}

variable "entra_group_id" {
  description = "Entra group ID for authorization"
  type        = string
  default     = ""
}

//=============================================================================
// SECRETS (stored in Secrets Manager)
//=============================================================================

variable "graph_client_secret" {
  description = "Microsoft Graph client secret"
  type        = string
  sensitive   = true
}

variable "session_secret" {
  description = "Express session secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "api_key" {
  description = "API key for admin app"
  type        = string
  sensitive   = true
  default     = ""
}

variable "dashboard_password" {
  description = "Dashboard password for admin app"
  type        = string
  sensitive   = true
  default     = ""
}

//=============================================================================
// ENTRA ID OIDC (admin app sign-in)
//=============================================================================

variable "entra_tenant_id" {
  description = "Entra ID tenant ID for OIDC sign-in"
  type        = string
}

variable "entra_client_id" {
  description = "Entra ID client ID for admin app OIDC sign-in"
  type        = string
}

variable "entra_client_secret" {
  description = "Entra ID client secret for admin app OIDC sign-in"
  type        = string
  sensitive   = true
}

variable "entra_redirect_uri" {
  description = "Entra ID OIDC redirect URI"
  type        = string
  default     = ""
}

variable "admin_group_id" {
  description = "Entra admin group object ID for RBAC"
  type        = string
  default     = ""
}

variable "eventhub_namespace" {
  description = "Azure Event Hub namespace name"
  type        = string
  default     = ""
}

variable "eventhub_name" {
  description = "Azure Event Hub name"
  type        = string
  default     = ""
}

variable "graph_tenant_domain" {
  description = "Azure AD tenant domain for EventHub notifications"
  type        = string
  default     = ""
}

variable "webhook_auth_secret" {
  description = "Shared secret for validating incoming webhook calls from Lambda"
  type        = string
  sensitive   = true
  default     = ""
}

variable "webhook_client_state" {
  description = "Client state for Graph notification validation"
  type        = string
  sensitive   = true
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
