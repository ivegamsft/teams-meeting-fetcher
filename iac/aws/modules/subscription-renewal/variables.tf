variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
}

variable "subscriptions_table_name" {
  description = "Name of DynamoDB subscriptions table"
  type        = string
  default     = "graph-subscriptions"
}

variable "subscriptions_table_arn" {
  description = "ARN of DynamoDB subscriptions table"
  type        = string
}

variable "lambda_source_file" {
  description = "Path to renewal Lambda function source file (relative to iac/aws)"
  type        = string
  default     = "../../lambda/renewal-function.py"
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

variable "renewal_schedule_expression" {
  description = "AWS Events schedule expression (cron) for subscription renewal"
  type        = string
  default     = "cron(0 2 * * ? *)" // Daily at 2 AM UTC
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
}

variable "lambda_subnet_ids" {
  description = "Subnet IDs for Lambda VPC config (optional)"
  type        = list(string)
  default     = []
}

variable "lambda_security_group_ids" {
  description = "Security group IDs for Lambda VPC config (optional)"
  type        = list(string)
  default     = []
}

variable "alarm_actions" {
  description = "SNS topic ARNs to notify on alarm"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
