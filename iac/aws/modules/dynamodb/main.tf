// DynamoDB module - subscription metadata and Event Hub checkpoints

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
}

//=============================================================================
// DYNAMODB TABLE - Event Hub checkpoints
//=============================================================================

resource "aws_dynamodb_table" "eventhub_checkpoints" {
  name         = var.eventhub_checkpoints_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "partition_id"
  range_key    = "consumer_group"

  attribute {
    name = "partition_id"
    type = "S"
  }

  attribute {
    name = "consumer_group"
    type = "S"
  }

  tags = var.tags
}
