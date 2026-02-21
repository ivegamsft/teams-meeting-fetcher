//=============================================================================
// Azure Security Module - Input Variables
//=============================================================================
// This module consolidates all RBAC role assignments for the infrastructure.
// Role assignments without resource dependencies are centralized here for
// better organization and maintainability.
//=============================================================================

variable "storage_account_id" {
  description = "Resource ID of the storage account for RBAC assignments"
  type        = string
}

variable "eventhub_namespace_id" {
  description = "Resource ID of the Event Hub namespace for RBAC assignments"
  type        = string
}

variable "app_principal_id" {
  description = "Object ID of the application service principal"
  type        = string
}

variable "lambda_principal_id" {
  description = "Object ID of the Lambda service principal"
  type        = string
}

variable "graph_change_tracking_principal_id" {
  description = "Object ID of Microsoft Graph Change Tracking service principal"
  type        = string
  default     = "0bf30f3b-4a52-48df-9a82-234910c4a086"
}
