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

variable "eventhub_namespace_name" {
  description = "Name of the Event Hub namespace"
  type        = string
}

variable "eventhub_name" {
  description = "Name of the Event Hub"
  type        = string
}

variable "eventhub_sku" {
  description = "Event Hub namespace SKU"
  type        = string
  default     = "Standard"
}

variable "eventhub_capacity" {
  description = "Event Hub namespace capacity"
  type        = number
  default     = 1
}

variable "eventhub_message_retention" {
  description = "Event Hub message retention in days"
  type        = number
  default     = 1
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

variable "eventhub_local_auth_enabled" {
  description = "Enable local authentication (SharedAccessKey) for Event Hub. Set to false to enforce RBAC only."
  type        = bool
  default     = true
}

variable "current_user_object_id" {
  description = "Object ID of the current user for RBAC role assignments. If not provided, uses the Terraform executor's identity."
  type        = string
  default     = null
}

