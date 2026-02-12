variable "storage_account_name" {
  description = "Name of the storage account (must be globally unique, 3-24 chars, lowercase + numbers only)"
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

variable "account_tier" {
  description = "Storage account tier (Standard or Premium)"
  type        = string
  default     = "Standard"
}

variable "replication_type" {
  description = "Storage account replication type (LRS, GRS, RAGRS, ZRS, GZRS, RAGZRS)"
  type        = string
  default     = "LRS"
}

variable "blob_versioning_enabled" {
  description = "Enable blob versioning"
  type        = bool
  default     = true
}

variable "allowed_ip_addresses" {
  description = "List of IP addresses allowed to access storage account"
  type        = list(string)
  default     = []
}

variable "deployment_principal_id" {
  description = "Object ID of the deployment service principal (for Storage Blob Data Contributor)"
  type        = string
}

variable "app_principal_id" {
  description = "Object ID of the application service principal (for Storage Blob Data Contributor)"
  type        = string
}

variable "container_names" {
  description = "List of container names to create"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags to apply to the storage account"
  type        = map(string)
  default     = {}
}
