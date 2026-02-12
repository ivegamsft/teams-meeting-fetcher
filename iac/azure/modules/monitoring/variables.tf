variable "log_analytics_workspace_name" {
  description = "Name of the Log Analytics workspace"
  type        = string
}

variable "app_insights_name" {
  description = "Name of the Application Insights instance"
  type        = string
}

variable "eventgrid_topic_name" {
  description = "Name of the Event Grid topic"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "log_analytics_sku" {
  description = "Log Analytics workspace SKU"
  type        = string
  default     = "PerGB2018"
}

variable "log_retention_days" {
  description = "Number of days to retain logs"
  type        = number
  default     = 30
}

variable "application_type" {
  description = "Application Insights application type"
  type        = string
  default     = "web"
}

variable "tags" {
  description = "Tags to apply to monitoring resources"
  type        = map(string)
  default     = {}
}
