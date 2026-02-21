// Storage module - S3 buckets for webhook payloads and transcripts

resource "aws_s3_bucket" "buckets" {
  for_each = var.buckets

  bucket = each.value.name
  tags   = merge(var.tags, { Purpose = each.key })
}

// Optional: Enable versioning for data protection
resource "aws_s3_bucket_versioning" "bucket_versioning" {
  for_each = var.buckets

  bucket = aws_s3_bucket.buckets[each.key].id

  versioning_configuration {
    status = each.value.enable_versioning ? "Enabled" : "Disabled"
  }
}

// Optional: Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "bucket_encryption" {
  for_each = var.buckets

  bucket = aws_s3_bucket.buckets[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

// Block public access
resource "aws_s3_bucket_public_access_block" "bucket_public_access" {
  for_each = var.buckets

  bucket = aws_s3_bucket.buckets[each.key].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

