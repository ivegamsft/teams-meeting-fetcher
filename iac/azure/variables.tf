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
