//=============================================================================
// SECURITY MODULE - Azure Service Principal RBAC Configuration
//=============================================================================
// This module centralizes all Azure service principal credentials used by
// AWS Lambda functions to access Azure resources via RBAC.
//
// Service Principals:
// 1. EventHub Reader SPN - RBAC access to Azure EventHub
// 2. Microsoft Graph API SPN - Graph API access for subscriptions/meetings
// 3. Teams Bot credentials - Bot Framework authentication
//=============================================================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

//=============================================================================
// EVENTHUB READER SERVICE PRINCIPAL (RBAC)
//=============================================================================
// Lambda function uses this SPN to authenticate to Azure EventHub via RBAC
// The SPN must have "Azure Event Hubs Data Receiver" role on the EventHub

locals {
  eventhub_reader_spn = {
    tenant_id     = var.eventhub_reader_tenant_id
    client_id     = var.eventhub_reader_client_id
    client_secret = var.eventhub_reader_client_secret
  }
}

//=============================================================================
// MICROSOFT GRAPH API SERVICE PRINCIPAL
//=============================================================================
// Used by subscription renewal Lambda and meeting bot Lambda
// The SPN must have appropriate Graph API permissions

locals {
  graph_api_spn = {
    tenant_id     = var.graph_api_tenant_id
    client_id     = var.graph_api_client_id
    client_secret = var.graph_api_client_secret
  }
}

//=============================================================================
// TEAMS BOT CREDENTIALS
//=============================================================================
// Bot Framework app credentials for Teams bot authentication

locals {
  teams_bot_credentials = {
    app_id        = var.bot_app_id
    app_secret    = var.bot_app_secret
    allowed_group = var.bot_allowed_group_id
  }
}

//=============================================================================
// FUTURE: AWS SECRETS MANAGER INTEGRATION
//=============================================================================
// Uncomment to store credentials in AWS Secrets Manager instead of passing
// them directly as environment variables to Lambda functions
//
// resource "aws_secretsmanager_secret" "eventhub_reader_spn" {
//   name        = "${var.environment}-eventhub-reader-spn"
//   description = "Azure EventHub Reader Service Principal (RBAC)"
//   tags        = var.tags
// }
//
// resource "aws_secretsmanager_secret_version" "eventhub_reader_spn" {
//   secret_id = aws_secretsmanager_secret.eventhub_reader_spn.id
//   secret_string = jsonencode({
//     tenant_id     = var.eventhub_reader_tenant_id
//     client_id     = var.eventhub_reader_client_id
//     client_secret = var.eventhub_reader_client_secret
//   })
// }
