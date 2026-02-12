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
  default     = "${path.module}/../../apps/aws-lambda/lambda.zip"
}
