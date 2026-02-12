variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "app_display_name" {
  description = "Display name for the Teams Meeting Fetcher app registration"
  type        = string
}

variable "admin_group_display_name" {
  description = "Display name for the admin group"
  type        = string
}

variable "create_test_user" {
  description = "Whether to create a test user for development"
  type        = bool
  default     = false
}

variable "test_user_upn" {
  description = "User principal name (email) for test user"
  type        = string
  default     = ""
}

variable "test_user_display_name" {
  description = "Display name for the test user"
  type        = string
  default     = ""
}

variable "test_user_mail_nickname" {
  description = "Mail nickname for the test user"
  type        = string
  default     = ""
}

variable "test_user_password" {
  description = "Password for test user"
  type        = string
  default     = ""
  sensitive   = true
}

variable "test_user_usage_location" {
  description = "Usage location for the test user (e.g., US, GB)"
  type        = string
  default     = "US"
}
