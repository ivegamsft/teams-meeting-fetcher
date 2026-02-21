//=============================================================================
// SECURITY MODULE OUTPUTS
//=============================================================================

//=============================================================================
// EVENTHUB READER SERVICE PRINCIPAL
//=============================================================================

output "eventhub_reader_spn" {
  description = "EventHub reader service principal credentials (RBAC)"
  value = {
    tenant_id     = local.eventhub_reader_spn.tenant_id
    client_id     = local.eventhub_reader_spn.client_id
    client_secret = local.eventhub_reader_spn.client_secret
  }
  sensitive = true
}

output "eventhub_reader_tenant_id" {
  description = "EventHub reader tenant ID"
  value       = local.eventhub_reader_spn.tenant_id
  sensitive   = true
}

output "eventhub_reader_client_id" {
  description = "EventHub reader client ID"
  value       = local.eventhub_reader_spn.client_id
  sensitive   = true
}

output "eventhub_reader_client_secret" {
  description = "EventHub reader client secret"
  value       = local.eventhub_reader_spn.client_secret
  sensitive   = true
}

//=============================================================================
// MICROSOFT GRAPH API SERVICE PRINCIPAL
//=============================================================================

output "graph_api_spn" {
  description = "Microsoft Graph API service principal credentials"
  value = {
    tenant_id     = local.graph_api_spn.tenant_id
    client_id     = local.graph_api_spn.client_id
    client_secret = local.graph_api_spn.client_secret
  }
  sensitive = true
}

output "graph_api_tenant_id" {
  description = "Microsoft Graph API tenant ID"
  value       = local.graph_api_spn.tenant_id
  sensitive   = true
}

output "graph_api_client_id" {
  description = "Microsoft Graph API client ID"
  value       = local.graph_api_spn.client_id
  sensitive   = true
}

output "graph_api_client_secret" {
  description = "Microsoft Graph API client secret"
  value       = local.graph_api_spn.client_secret
  sensitive   = true
}

//=============================================================================
// TEAMS BOT CREDENTIALS
//=============================================================================

output "teams_bot_credentials" {
  description = "Teams Bot Framework credentials"
  value = {
    app_id        = local.teams_bot_credentials.app_id
    app_secret    = local.teams_bot_credentials.app_secret
    allowed_group = local.teams_bot_credentials.allowed_group
  }
  sensitive = true
}

output "bot_app_id" {
  description = "Teams bot app ID"
  value       = local.teams_bot_credentials.app_id
  sensitive   = true
}

output "bot_app_secret" {
  description = "Teams bot app secret"
  value       = local.teams_bot_credentials.app_secret
  sensitive   = true
}

output "bot_allowed_group_id" {
  description = "Teams bot allowed group ID"
  value       = local.teams_bot_credentials.allowed_group
}
