variable "topic_name" {
  description = "Name of the SNS topic"
  type        = string
}

variable "display_name" {
  description = "Display name for the SNS topic"
  type        = string
  default     = ""
}

variable "notification_email" {
  description = "Email address to send notifications to (optional)"
  type        = string
  default     = null
}

variable "allow_lambda_publish" {
  description = "Allow Lambda services to publish to this topic"
  type        = bool
  default     = true
}

variable "aws_account_id" {
  description = "AWS account ID for topic policy"
  type        = string
}

variable "tags" {
  description = "Tags to apply to SNS resources"
  type        = map(string)
  default     = {}
}
