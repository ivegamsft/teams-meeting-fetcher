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

//=============================================================================
// DYNAMODB TABLE - Graph API Subscription Metadata
//=============================================================================
// Stores subscription tracking for auto-renewal and monitoring
// Enables querying subscriptions by expiry date for renewal operations

resource "aws_dynamodb_table" "graph_subscriptions" {
  name             = var.subscriptions_table_name
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "subscription_id"
  range_key        = "created_at"
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "subscription_id"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  attribute {
    name = "expiry_date"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "expiry-date-index"
    hash_key        = "status"
    range_key       = "expiry_date"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = false
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = var.tags

  depends_on = [aws_s3_bucket.webhook_payloads]
}
