variable "api_name" {
  description = "Name of the API Gateway REST API"
  type        = string
}

variable "api_description" {
  description = "Description of the API Gateway REST API"
  type        = string
  default     = ""
}

variable "path_part" {
  description = "Path part for the API Gateway resource"
  type        = string
  default     = "graph"
}

variable "http_method" {
  description = "HTTP method for the API Gateway method"
  type        = string
  default     = "POST"
}

variable "authorization" {
  description = "Authorization type for the API Gateway method"
  type        = string
  default     = "NONE"
}

variable "lambda_invoke_arn" {
  description = "Invoke ARN of the Lambda function to integrate with"
  type        = string
}

variable "lambda_function_name" {
  description = "Name of the Lambda function to grant invoke permission to"
  type        = string
}

variable "stage_name" {
  description = "Stage name for the API Gateway deployment"
  type        = string
}

variable "authorizer_invoke_arn" {
  description = "Invoke ARN of the authorizer Lambda function (optional)"
  type        = string
  default     = null
}

variable "authorizer_role_arn" {
  description = "IAM role ARN for the authorizer Lambda function (optional)"
  type        = string
  default     = null
}

variable "authorizer_function_name" {
  description = "Name of the authorizer Lambda function (optional)"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to API Gateway resources"
  type        = map(string)
  default     = {}
}
