variable "subscriptions_table_name" {
  description = "Name of the DynamoDB table for subscription tracking"
  type        = string
  default     = "graph-subscriptions"
}

variable "eventhub_checkpoints_table_name" {
  description = "Name of the DynamoDB table for Event Hub checkpoints"
  type        = string
  default     = "eventhub-checkpoints"
}

variable "resource_suffix" {
  description = "Unique suffix for resource naming (e.g., 8akfpg)"
  type        = string
  default     = ""
}

variable "meetings_table_name" {
  description = "Name of the DynamoDB table for meetings"
  type        = string
  default     = "tmf-meetings"
}

variable "transcripts_table_name" {
  description = "Name of the DynamoDB table for transcripts"
  type        = string
  default     = "tmf-transcripts"
}

variable "config_table_name" {
  description = "Name of the DynamoDB table for configuration"
  type        = string
  default     = "tmf-config"
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
