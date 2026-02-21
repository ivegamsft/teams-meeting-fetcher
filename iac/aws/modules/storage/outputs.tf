output "bucket_names" {
  description = "Map of bucket names (key = purpose, value = bucket name)"
  value       = { for k, v in aws_s3_bucket.buckets : k => v.bucket }
}

output "bucket_arns" {
  description = "Map of bucket ARNs (key = purpose, value = bucket ARN)"
  value       = { for k, v in aws_s3_bucket.buckets : k => v.arn }
}

output "bucket_ids" {
  description = "Map of bucket IDs (key = purpose, value = bucket ID)"
  value       = { for k, v in aws_s3_bucket.buckets : k => v.id }
}

// Backward compatibility outputs for webhook bucket (primary bucket)
output "bucket_name" {
  description = "Primary webhook bucket name (for backward compatibility)"
  value       = try(aws_s3_bucket.buckets["webhooks"].bucket, "")
}

output "bucket_arn" {
  description = "Primary webhook bucket ARN (for backward compatibility)"
  value       = try(aws_s3_bucket.buckets["webhooks"].arn, "")
}

output "bucket_id" {
  description = "Primary webhook bucket ID (for backward compatibility)"
  value       = try(aws_s3_bucket.buckets["webhooks"].id, "")
}
