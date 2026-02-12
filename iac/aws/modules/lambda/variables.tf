variable "function_name" {
  description = "Name of the Lambda function"
  type        = string
}

variable "handler" {
  description = "Lambda function handler"
  type        = string
  default     = "handler.handler"
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs18.x"
}

variable "package_path" {
  description = "Path to Lambda deployment package (zip file)"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket for Lambda to write to"
  type        = string
}

variable "sns_topic_arn" {
  description = "ARN of the SNS topic for Lambda to publish to (optional)"
  type        = string
  default     = null
}

variable "timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30
}

variable "memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 128
}

variable "environment_variables" {
  description = "Environment variables for the Lambda function"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags to apply to Lambda resources"
  type        = map(string)
  default     = {}
}
