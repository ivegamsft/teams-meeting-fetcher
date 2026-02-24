variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "azure_region" {
  description = "Azure region (e.g., eastus, westeurope)"
  type        = string
}

variable "region_short" {
  description = "Short region code for naming (e.g., eus, weu)"
  type        = string
}

variable "azure_subscription_id" {
  description = "Azure subscription ID"
  type        = string
  sensitive   = true
}

variable "azure_tenant_id" {
  description = "Azure AD tenant ID"
  type        = string
  sensitive   = true
}

variable "azure_client_id" {
  description = "Service principal client ID (application ID)"
  type        = string
  sensitive   = true
}

variable "azure_client_secret" {
  description = "Service principal client secret (not required when use_oidc = true)"
  type        = string
  sensitive   = true
  default     = null
}

variable "use_oidc" {
  description = "Use OIDC authentication for Azure provider (true for CI/CD, false for local with SPN)"
  type        = bool
  default     = false
}

variable "app_display_name" {
  description = "Display name for the Teams Meeting Fetcher app registration"
  type        = string
  default     = "Teams Meeting Fetcher"
}

variable "base_name" {
  description = "Base name for resource naming (e.g., 'tmf')"
  type        = string
  default     = "tmf"
}

variable "bot_app_display_name" {
  description = "Display name for the Teams Meeting Bot app registration"
  type        = string
  default     = "Teams Meeting Fetcher Bot"
}

variable "admin_group_display_name" {
  description = "Display name for the monitored meetings group"
  type        = string
  default     = "Teams Meeting Fetcher Monitored Meetings"
}
variable "create_test_user" {
  description = "Whether to create a test user for development with randomly generated name and password"
  type        = bool
  default     = true
}

variable "key_vault_sku" {
  description = "Key Vault SKU (standard or premium)"
  type        = string
  default     = "standard"
}

variable "allowed_ip_addresses" {
  description = "List of IP addresses allowed through Key Vault and Storage firewalls"
  type        = list(string)
  default     = []
}

variable "bot_messaging_endpoint" {
  description = "HTTPS messaging endpoint for the Teams bot (API Gateway URL + /bot/messages)"
  type        = string
}

variable "current_user_object_id" {
  description = "Object ID of the current user for RBAC role assignments. If not provided, uses the Terraform executor's identity."
  type        = string
  default     = null
}

variable "eventhub_local_auth_enabled" {
  description = "Enable local authentication (SharedAccessKey) for Event Hub. Set to false to enforce RBAC only."
  type        = bool
  default     = false
}

variable "domain_name_suffix" {
  description = "Override for default domain name suffix (e.g., 'contoso.com'). If empty, the default verified domain from Azure AD will be used. Useful for sovereign clouds."
  type        = string
  default     = ""
}
