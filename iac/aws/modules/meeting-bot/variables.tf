variable "function_name" {
  description = "Name of the bot Lambda function"
  type        = string
}

variable "handler" {
  description = "Lambda handler"
  type        = string
  default     = "index.handler"
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs18.x"
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 300
}

variable "memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 512
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
}

variable "meetings_table_name" {
  description = "DynamoDB table name for bot sessions"
  type        = string
  default     = "meeting-bot-sessions"
}

variable "azure_graph_tenant_id" {
  description = "Microsoft Graph tenant ID"
  type        = string
  sensitive   = true
}

variable "azure_graph_client_id" {
  description = "Microsoft Graph app client ID"
  type        = string
  sensitive   = true
}

variable "azure_graph_client_secret" {
  description = "Microsoft Graph app client secret"
  type        = string
  sensitive   = true
}

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
  description = "Entra group ID for allow-list"
  type        = string
}

variable "group_cache_ttl_seconds" {
  description = "Group membership cache TTL in seconds"
  type        = number
  default     = 900
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
