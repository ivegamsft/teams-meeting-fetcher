variable "function_name" {
  description = "Name of the Event Hub processor Lambda"
  type        = string
}

variable "handler" {
  description = "Lambda handler"
  type        = string
  default     = "eventhub-handler.handler"
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs20.x"
}

variable "package_path" {
  description = "Path to Lambda deployment package (zip file)"
  type        = string
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 60
}

variable "memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 256
}

variable "bucket_arn" {
  description = "ARN of the S3 bucket for payloads"
  type        = string
}

variable "bucket_name" {
  description = "Name of the S3 bucket for payloads"
  type        = string
}

variable "checkpoint_table_name" {
  description = "DynamoDB table name for checkpoints"
  type        = string
}

variable "checkpoint_table_arn" {
  description = "DynamoDB table ARN for checkpoints"
  type        = string
}

variable "eventhub_namespace" {
  description = "Event Hub namespace FQDN"
  type        = string
}

variable "eventhub_name" {
  description = "Event Hub name"
  type        = string
}

variable "eventhub_consumer_group" {
  description = "Event Hub consumer group"
  type        = string
  default     = "lambda-processor"
}

variable "eventhub_max_events" {
  description = "Max events per poll"
  type        = number
  default     = 50
}

variable "eventhub_poll_window_minutes" {
  description = "Lookback window for Event Hub polling"
  type        = number
  default     = 10
}

variable "message_processing_mode" {
  description = "Message processing mode: 'consume' (advance offset) or 'peek' (read-only)"
  type        = string
  default     = "consume"
  validation {
    condition     = contains(["consume", "peek"], var.message_processing_mode)
    error_message = "message_processing_mode must be either 'consume' or 'peek'"
  }
}

variable "azure_tenant_id" {
  description = "Azure tenant ID for AAD auth"
  type        = string
  sensitive   = true
}

variable "azure_client_id" {
  description = "Azure client ID for AAD auth"
  type        = string
  sensitive   = true
}

variable "azure_client_secret" {
  description = "Azure client secret for AAD auth"
  type        = string
  sensitive   = true
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for notifications"
  type        = string
}

variable "admin_app_webhook_url" {
  description = "DEPRECATED: No longer used. Lambda writes directly to DynamoDB."
  type        = string
  default     = ""
}

variable "webhook_auth_secret" {
  description = "DEPRECATED: No longer used. Lambda writes directly to DynamoDB."
  type        = string
  sensitive   = true
  default     = ""
}

variable "meetings_table_name" {
  description = "DynamoDB table name for meeting notifications (direct write)"
  type        = string
  default     = ""
}

variable "meetings_table_arn" {
  description = "DynamoDB table ARN for meeting notifications IAM policy"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
