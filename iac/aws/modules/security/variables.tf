//=============================================================================
// SECURITY MODULE VARIABLES
//=============================================================================

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

//=============================================================================
// EVENTHUB READER SERVICE PRINCIPAL (RBAC)
//=============================================================================

variable "eventhub_reader_tenant_id" {
  description = "Azure tenant ID for EventHub reader SPN"
  type        = string
  sensitive   = true
}

variable "eventhub_reader_client_id" {
  description = "Azure client ID for EventHub reader SPN"
  type        = string
  sensitive   = true
}

variable "eventhub_reader_client_secret" {
  description = "Azure client secret for EventHub reader SPN"
  type        = string
  sensitive   = true
}

//=============================================================================
// MICROSOFT GRAPH API SERVICE PRINCIPAL
//=============================================================================

variable "graph_api_tenant_id" {
  description = "Microsoft Graph API tenant ID"
  type        = string
  sensitive   = true
}

variable "graph_api_client_id" {
  description = "Microsoft Graph API client ID"
  type        = string
  sensitive   = true
}

variable "graph_api_client_secret" {
  description = "Microsoft Graph API client secret"
  type        = string
  sensitive   = true
}

//=============================================================================
// TEAMS BOT CREDENTIALS
//=============================================================================

variable "bot_app_id" {
  description = "Teams Bot Framework app ID"
  type        = string
  sensitive   = true
}

variable "bot_app_secret" {
  description = "Teams Bot Framework app secret"
  type        = string
  sensitive   = true
}

variable "bot_allowed_group_id" {
  description = "Azure AD group ID for bot access control"
  type        = string
}

//=============================================================================
// MODULE METADATA
//=============================================================================

variable "tags" {
  description = "Tags to apply to resources (future: Secrets Manager)"
  type        = map(string)
  default     = {}
}
