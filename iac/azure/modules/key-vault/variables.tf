variable "key_vault_name" {
  description = "Name of the Key Vault"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "tenant_id" {
  description = "Azure AD tenant ID"
  type        = string
}

variable "sku_name" {
  description = "Key Vault SKU (standard or premium)"
  type        = string
  default     = "standard"
}

variable "soft_delete_retention_days" {
  description = "Number of days to retain soft-deleted vaults"
  type        = number
  default     = 7
}

variable "purge_protection_enabled" {
  description = "Enable purge protection"
  type        = bool
  default     = false
}

variable "allowed_ip_addresses" {
  description = "List of IP addresses allowed to access Key Vault"
  type        = list(string)
  default     = []
}

variable "deployment_principal_id" {
  description = "Object ID of the deployment service principal (for Secrets Officer)"
  type        = string
}

variable "app_principal_id" {
  description = "Object ID of the application service principal (for Secrets User)"
  type        = string
}

variable "secrets" {
  description = "Map of secrets to store in Key Vault (key = secret name, value = secret value)"
  type        = map(string)
  default     = {}
  # Note: Cannot mark as sensitive because for_each doesn't allow sensitive values
}

variable "tags" {
  description = "Tags to apply to the Key Vault"
  type        = map(string)
  default     = {}
}
