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
  description = "Service principal client secret"
  type        = string
  sensitive   = true
}

variable "app_display_name" {
  description = "Display name for the Teams Meeting Fetcher app registration"
  type        = string
  default     = "Teams Meeting Fetcher"
}

variable "admin_group_display_name" {
  description = "Display name for the admin group"
  type        = string
  default     = "Teams Meeting Fetcher Admins"
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
