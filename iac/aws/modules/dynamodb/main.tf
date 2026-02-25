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

//=============================================================================
// DYNAMODB TABLE - Meetings (admin app)
//=============================================================================

resource "aws_dynamodb_table" "meetings" {
  name         = "${var.meetings_table_name}-${var.resource_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "meeting_id"
  range_key    = "created_at"

  attribute {
    name = "meeting_id"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  attribute {
    name = "organizer_email"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "organizer-status-index"
    hash_key        = "organizer_email"
    range_key       = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = var.tags
}

//=============================================================================
// DYNAMODB TABLE - Transcripts (admin app)
//=============================================================================

resource "aws_dynamodb_table" "transcripts" {
  name         = "${var.transcripts_table_name}-${var.resource_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "transcript_id"
  range_key    = "meeting_id"

  attribute {
    name = "transcript_id"
    type = "S"
  }

  attribute {
    name = "meeting_id"
    type = "S"
  }

  global_secondary_index {
    name            = "meeting-id-index"
    hash_key        = "meeting_id"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = var.tags
}

//=============================================================================
// DYNAMODB TABLE - Config (admin app)
//=============================================================================

resource "aws_dynamodb_table" "config" {
  name         = "${var.config_table_name}-${var.resource_suffix}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "config_key"

  attribute {
    name = "config_key"
    type = "S"
  }

  tags = var.tags
}
