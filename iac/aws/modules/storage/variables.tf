variable "buckets" {
  description = "Map of S3 buckets to create (key = bucket purpose, value = bucket configuration)"
  type = map(object({
    name              = string
    enable_versioning = optional(bool, false)
  }))
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
