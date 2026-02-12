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

output "service_principal_object_id" {
  description = "Service principal object ID"
  value       = azuread_service_principal.tmf_app.object_id
}

output "admin_group_id" {
  description = "Admin group object ID"
  value       = azuread_group.admins.id
}

output "admin_group_name" {
  description = "Admin group display name"
  value       = azuread_group.admins.display_name
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
