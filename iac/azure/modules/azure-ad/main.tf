// Azure AD module for app registration, service principal, groups, and test users
// Manages Azure Active Directory resources for Teams Meeting Fetcher

// Azure AD Application
resource "azuread_application" "tmf_app" {
  display_name = var.app_display_name

  // Required API permissions are managed in the Azure Portal or via bootstrap script
  // Microsoft Graph: Calendars.Read, OnlineMeetings.Read.All, etc.
}

// Service Principal for the application
resource "azuread_service_principal" "tmf_app" {
  client_id = azuread_application.tmf_app.client_id
}

// Application password/secret
resource "azuread_application_password" "tmf_app" {
  application_id = azuread_application.tmf_app.id
}

// Admin group for application administrators
resource "azuread_group" "admins" {
  display_name     = "${var.admin_group_display_name} (${var.environment})"
  mail_enabled     = false
  security_enabled = true

  description = "Administrators for Teams Meeting Fetcher application"
}

// Test user for development (optional)
resource "azuread_user" "test_user" {
  count = var.create_test_user ? 1 : 0

  user_principal_name = var.test_user_upn
  display_name        = var.test_user_display_name
  mail_nickname       = var.test_user_mail_nickname
  password            = var.test_user_password

  usage_location = var.test_user_usage_location

  lifecycle {
    ignore_changes = [password] # Don't update password on subsequent applies
  }
}

// Add test user to admin group (if created)
resource "azuread_group_member" "test_user_admin" {
  count = var.create_test_user ? 1 : 0

  group_object_id  = azuread_group.admins.id
  member_object_id = azuread_user.test_user[0].object_id
}
