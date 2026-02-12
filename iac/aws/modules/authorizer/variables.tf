variable "function_name" {
  description = "Name of the authorizer Lambda function"
  type        = string
}

variable "handler" {
  description = "Lambda function handler"
  type        = string
  default     = "authorizer.handler"
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs18.x"
}

variable "package_path" {
  description = "Path to authorizer Lambda deployment package (zip file)"
  type        = string
}

variable "client_state" {
  description = "Client state secret for validating Graph webhook notifications"
  type        = string
  sensitive   = true
}

variable "timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 10
}

variable "memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 128
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags to apply to authorizer resources"
  type        = map(string)
  default     = {}
}
