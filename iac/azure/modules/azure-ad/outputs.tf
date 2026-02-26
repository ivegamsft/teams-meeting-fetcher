output "app_client_id" {
  description = "Application (client) ID"
  value       = azuread_application.tmf_app.client_id
}

output "app_object_id" {
  description = "Application object ID"
  value       = azuread_application.tmf_app.object_id
}

output "app_client_secret" {
  description = "Application client secret"
  value       = azuread_application_password.tmf_app.value
  sensitive   = true
}

output "bot_app_client_id" {
  description = "Bot application (client) ID"
  value       = azuread_application.tmf_bot_app.client_id
}

output "bot_app_client_secret" {
  description = "Bot application client secret"
  value       = azuread_application_password.tmf_bot_app.value
  sensitive   = true
}

output "service_principal_object_id" {
  description = "Service principal object ID"
  value       = azuread_service_principal.tmf_app.object_id
}

output "bot_service_principal_object_id" {
  description = "Bot service principal object ID"
  value       = azuread_service_principal.tmf_bot_app.object_id
}

//=============================================================================
// LAMBDA SERVICE PRINCIPAL OUTPUTS
//=============================================================================

output "lambda_app_client_id" {
  description = "Lambda application (client) ID for EventHub read access"
  value       = azuread_application.tmf_lambda_app.client_id
}

output "lambda_app_object_id" {
  description = "Lambda application object ID"
  value       = azuread_application.tmf_lambda_app.object_id
}

output "lambda_app_client_secret" {
  description = "Lambda application client secret (for AWS Lambda environment)"
  value       = azuread_application_password.tmf_lambda_app.value
  sensitive   = true
}

output "lambda_service_principal_object_id" {
  description = "Lambda service principal object ID"
  value       = azuread_service_principal.tmf_lambda_app.object_id
}

//=============================================================================
// ADMIN APP OUTPUTS (Entra ID OIDC)
//=============================================================================

output "admin_app_client_id" {
  description = "Admin app application (client) ID for OIDC sign-in"
  value       = azuread_application.tmf_admin_app.client_id
}

output "admin_app_object_id" {
  description = "Admin app application object ID"
  value       = azuread_application.tmf_admin_app.object_id
}

output "admin_app_client_secret" {
  description = "Admin app client secret for OIDC sign-in"
  value       = azuread_application_password.tmf_admin_app.value
  sensitive   = true
}

output "admin_group_id" {
  description = "Admin group object ID"
  value       = azuread_group.admins.object_id
}

output "admin_group_name" {
  description = "Admin group display name"
  value       = azuread_group.admins.display_name
}

output "monitored_group_id" {
  description = "Monitored users group object ID"
  value       = azuread_group.monitored_users.object_id
}

output "monitored_group_name" {
  description = "Monitored users group display name"
  value       = azuread_group.monitored_users.display_name
}

output "test_user_principal_name" {
  description = "Test user principal name (email)"
  value       = var.create_test_user ? azuread_user.test_user[0].user_principal_name : null
}

output "test_user_object_id" {
  description = "Test user object ID"
  value       = var.create_test_user ? azuread_user.test_user[0].object_id : null
}

output "test_user_display_name" {
  description = "Test user display name"
  value       = var.create_test_user ? azuread_user.test_user[0].display_name : null
}
