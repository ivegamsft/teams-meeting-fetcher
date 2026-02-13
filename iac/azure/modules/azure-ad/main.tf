// Azure AD module for app registration, service principal, groups, and test users
// Manages Azure Active Directory resources for Teams Meeting Fetcher

// Microsoft Graph service principal (for app role assignments)
data "azuread_service_principal" "graph" {
  client_id = "00000003-0000-0000-c000-000000000000"
}

locals {
  // Resolve Microsoft Graph application role IDs by value to avoid hardcoding
  graph_app_role_ids = {
    calendars_readwrite = one([
      for role in data.azuread_service_principal.graph.app_roles : role.id
      if role.value == "Calendars.ReadWrite" && contains(role.allowed_member_types, "Application")
    ])
    online_meeting_transcript_read_all = one([
      for role in data.azuread_service_principal.graph.app_roles : role.id
      if role.value == "OnlineMeetingTranscript.Read.All" && contains(role.allowed_member_types, "Application")
    ])
    online_meeting_recording_read_all = one([
      for role in data.azuread_service_principal.graph.app_roles : role.id
      if role.value == "OnlineMeetingRecording.Read.All" && contains(role.allowed_member_types, "Application")
    ])
    online_meetings_readwrite_all = one([
      for role in data.azuread_service_principal.graph.app_roles : role.id
      if role.value == "OnlineMeetings.ReadWrite.All" && contains(role.allowed_member_types, "Application")
    ])
    group_read_all = one([
      for role in data.azuread_service_principal.graph.app_roles : role.id
      if role.value == "Group.Read.All" && contains(role.allowed_member_types, "Application")
    ])
    user_read_all = one([
      for role in data.azuread_service_principal.graph.app_roles : role.id
      if role.value == "User.Read.All" && contains(role.allowed_member_types, "Application")
    ])
  }

  bot_graph_app_role_ids = {
    online_meetings_readwrite_all      = local.graph_app_role_ids.online_meetings_readwrite_all
    online_meeting_transcript_read_all = local.graph_app_role_ids.online_meeting_transcript_read_all
    online_meeting_recording_read_all  = local.graph_app_role_ids.online_meeting_recording_read_all
    group_read_all                     = local.graph_app_role_ids.group_read_all
    user_read_all                      = local.graph_app_role_ids.user_read_all
    calls_join_group_call_all = one([
      for role in data.azuread_service_principal.graph.app_roles : role.id
      if role.value == "Calls.JoinGroupCall.All" && contains(role.allowed_member_types, "Application")
    ])
    calls_initiate_all = one([
      for role in data.azuread_service_principal.graph.app_roles : role.id
      if role.value == "Calls.Initiate.All" && contains(role.allowed_member_types, "Application")
    ])
  }
}

// Azure AD Application
resource "azuread_application" "tmf_app" {
  display_name = var.app_display_name

  required_resource_access {
    resource_app_id = data.azuread_service_principal.graph.client_id

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
resource "azuread_application" "tmf_bot_app" {
  display_name = var.bot_app_display_name

  required_resource_access {
    resource_app_id = data.azuread_service_principal.graph.client_id

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

resource "azuread_app_role_assignment" "graph_app_roles" {
  for_each = local.graph_app_role_ids

  app_role_id         = each.value
  principal_object_id = azuread_service_principal.tmf_app.object_id
  resource_object_id  = data.azuread_service_principal.graph.object_id
}

resource "azuread_app_role_assignment" "bot_graph_app_roles" {
  for_each = local.bot_graph_app_role_ids

  app_role_id         = each.value
  principal_object_id = azuread_service_principal.tmf_bot_app.object_id
  resource_object_id  = data.azuread_service_principal.graph.object_id
}

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
