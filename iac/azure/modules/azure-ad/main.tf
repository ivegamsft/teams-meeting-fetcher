// Azure AD module for app registration, service principal, groups, and test users
// Manages Azure Active Directory resources for Teams Meeting Fetcher

// Microsoft Graph service principal (for app role assignments)
// NOTE: Commented out - requires Directory.Read.All permission on SPN
// data "azuread_service_principal" "graph" {
//   client_id = "00000003-0000-0000-c000-000000000000"
// }

// Hard-code Graph API values since data source requires extra permissions
locals {
  graph_client_id = "00000003-0000-0000-c000-000000000000"

  // Hard-coded Graph API app role IDs (from Microsoft Graph)
  graph_app_role_ids = {
    calendars_readwrite                = "ef54d2bf-783f-4e0f-bca1-3210c0444d99"
    online_meeting_transcript_read_all = "a4a80d8d-d283-4bd8-8504-555ec3870630"
    online_meeting_recording_read_all  = "a4a08342-c95d-476b-b943-97e100569c8d"
    online_meetings_readwrite_all      = "b8bb2037-6e08-44ac-a4ea-4674e010e2a4"
    group_read_all                     = "5b567255-7703-4780-807c-7be8301ae99b"
    user_read_all                      = "df021288-bdef-4463-88db-98f22de89214"
    calls_join_group_call_all          = "f6b49018-60ab-4f81-83bd-22caeabfed2d"
    calls_initiate_all                 = "284383ee-7f6e-4e40-a2a8-e85dcb029101"
  }

  bot_graph_app_role_ids = {
    online_meetings_readwrite_all      = local.graph_app_role_ids.online_meetings_readwrite_all
    online_meeting_transcript_read_all = local.graph_app_role_ids.online_meeting_transcript_read_all
    online_meeting_recording_read_all  = local.graph_app_role_ids.online_meeting_recording_read_all
    group_read_all                     = local.graph_app_role_ids.group_read_all
    user_read_all                      = local.graph_app_role_ids.user_read_all
    calls_join_group_call_all          = local.graph_app_role_ids.calls_join_group_call_all
    calls_initiate_all                 = local.graph_app_role_ids.calls_initiate_all
  }
}

// Azure AD Application
resource "azuread_application" "tmf_app" {
  display_name = var.app_display_name

  required_resource_access {
    resource_app_id = local.graph_client_id

    resource_access {
      id   = local.graph_app_role_ids.calendars_readwrite
      type = "Role"
    }
    resource_access {
      id   = local.graph_app_role_ids.online_meeting_transcript_read_all
      type = "Role"
    }
    resource_access {
      id   = local.graph_app_role_ids.online_meeting_recording_read_all
      type = "Role"
    }
    resource_access {
      id   = local.graph_app_role_ids.online_meetings_readwrite_all
      type = "Role"
    }
    resource_access {
      id   = local.graph_app_role_ids.group_read_all
      type = "Role"
    }
    resource_access {
      id   = local.graph_app_role_ids.user_read_all
      type = "Role"
    }
  }
}

// Azure AD Application - Teams Meeting Bot
// sign_in_audience must be "AzureADMultipleOrgs" — Teams Admin Center
// validation requires the bot's Azure AD app to be multi-tenant.
// The Bot Service resource itself remains SingleTenant (Azure deprecated
// MultiTenant bot creation). Access is restricted by ALLOWED_GROUP_ID,
// Teams admin policies, and the org app catalog.
resource "azuread_application" "tmf_bot_app" {
  display_name     = var.bot_app_display_name
  sign_in_audience = "AzureADMultipleOrgs"

  required_resource_access {
    resource_app_id = local.graph_client_id

    resource_access {
      id   = local.bot_graph_app_role_ids.online_meetings_readwrite_all
      type = "Role"
    }
    resource_access {
      id   = local.bot_graph_app_role_ids.calls_join_group_call_all
      type = "Role"
    }
    resource_access {
      id   = local.bot_graph_app_role_ids.calls_initiate_all
      type = "Role"
    }
    resource_access {
      id   = local.bot_graph_app_role_ids.online_meeting_transcript_read_all
      type = "Role"
    }
    resource_access {
      id   = local.bot_graph_app_role_ids.online_meeting_recording_read_all
      type = "Role"
    }
    resource_access {
      id   = local.bot_graph_app_role_ids.group_read_all
      type = "Role"
    }
    resource_access {
      id   = local.bot_graph_app_role_ids.user_read_all
      type = "Role"
    }
  }
}

// Service Principal for the application
resource "azuread_service_principal" "tmf_app" {
  client_id = azuread_application.tmf_app.client_id
}

resource "azuread_service_principal" "tmf_bot_app" {
  client_id = azuread_application.tmf_bot_app.client_id
}

// NOTE: App role assignments commented out - requires Directory.Read.All to get Graph SPN object ID
// These will be granted via admin consent URL or Azure Portal instead
// resource "azuread_app_role_assignment" "graph_app_roles" {
//   for_each = local.graph_app_role_ids
//
//   app_role_id         = each.value
//   principal_object_id = azuread_service_principal.tmf_app.object_id
//   resource_object_id  = "<Graph SPN object ID>"  // Would come from data.azuread_service_principal.graph.object_id
// }
//
// resource "azuread_app_role_assignment" "bot_graph_app_roles" {
//   for_each = local.bot_graph_app_role_ids
//
//   app_role_id         = each.value
//   principal_object_id = azuread_service_principal.tmf_bot_app.object_id
//   resource_object_id  = "<Graph SPN object ID>"  // Would come from data.azuread_service_principal.graph.object_id
// }

// Application password/secret
resource "azuread_application_password" "tmf_app" {
  application_id = azuread_application.tmf_app.id
}

resource "azuread_application_password" "tmf_bot_app" {
  application_id = azuread_application.tmf_bot_app.id
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

  group_object_id  = azuread_group.admins.object_id
  member_object_id = azuread_user.test_user[0].object_id
}
