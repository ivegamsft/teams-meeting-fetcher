// Storage module - S3 bucket for webhook payload storage

resource "aws_s3_bucket" "webhook_payloads" {
  bucket = var.bucket_name

  tags = var.tags
}

// Optional: Enable versioning for data protection
resource "aws_s3_bucket_versioning" "webhook_payloads" {
  bucket = aws_s3_bucket.webhook_payloads.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Disabled"
  }
}

// Optional: Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "webhook_payloads" {
  bucket = aws_s3_bucket.webhook_payloads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

// Block public access
resource "aws_s3_bucket_public_access_block" "webhook_payloads" {
  bucket = aws_s3_bucket.webhook_payloads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
