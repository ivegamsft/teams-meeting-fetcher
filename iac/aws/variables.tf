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
