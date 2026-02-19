variable "bucket_name" {
  description = "Name of the S3 bucket for webhook payloads"
  type        = string
}

variable "enable_versioning" {
  description = "Enable S3 bucket versioning"
  type        = bool
  default     = false
}

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

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
