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
    calendars_read                     = "798ee544-9d2d-430c-a058-570e29e34338"
    online_meetings_read_all           = "c1684f21-1984-47fa-9d61-2dc8c296bb70"
    online_meeting_transcript_read_all = "a4a80d8d-d283-4bd8-8504-555ec3870630"
    online_meeting_recording_read_all  = "a4a08342-c95d-476b-b943-97e100569c8d"
    group_read_all                     = "5b567255-7703-4780-807c-7be8301ae99b"
    user_read_all                      = "df021288-bdef-4463-88db-98f22de89214"
    subscription_readwrite_all         = "482be48f-8d13-42ab-b51e-677fdd881820"
    // Bot-only permissions (not used by TMF SPN)
    online_meetings_readwrite_all = "b8bb2037-6e08-44ac-a4ea-4674e010e2a4"
    calls_join_group_call_all     = "f6b49018-60ab-4f81-83bd-22caeabfed2d"
    calls_initiate_all            = "284383ee-7f6e-4e40-a2a8-e85dcb029101"
  }

  bot_graph_app_role_ids = {
    online_meetings_readwrite_all      = local.graph_app_role_ids.online_meetings_readwrite_all
    online_meeting_transcript_read_all = local.graph_app_role_ids.online_meeting_transcript_read_all
    online_meeting_recording_read_all  = local.graph_app_role_ids.online_meeting_recording_read_all
    group_read_all                     = local.graph_app_role_ids.group_read_all
    user_read_all                      = local.graph_app_role_ids.user_read_all
  }
}

// Azure AD Application
resource "azuread_application" "tmf_app" {
  display_name = var.app_display_name

  required_resource_access {
    resource_app_id = local.graph_client_id

    // TMF SPN: 7 Graph API application permissions (verified 2026-02-27)
    resource_access {
      id   = local.graph_app_role_ids.calendars_read
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
    resource_access {
      id   = local.graph_app_role_ids.online_meetings_read_all
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
      id   = local.graph_app_role_ids.subscription_readwrite_all
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

  // Note: Terraform azuread_application doesn't support dynamic blocks for resource_access
  required_resource_access {
    resource_app_id = local.graph_client_id

    resource_access {
      id   = local.bot_graph_app_role_ids.online_meetings_readwrite_all
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

//=============================================================================
// SERVICE PRINCIPALS - Keep in azure-ad module (Azure AD resources)
//=============================================================================

resource "azuread_service_principal" "tmf_app" {
  client_id = azuread_application.tmf_app.client_id
}

resource "azuread_service_principal" "tmf_bot_app" {
  client_id = azuread_application.tmf_bot_app.client_id
}

//=============================================================================
// LAMBDA SERVICE PRINCIPAL (READ-ONLY EVENTHUB ACCESS)
//=============================================================================

resource "azuread_application" "tmf_lambda_app" {
  display_name = "${var.app_display_name} Lambda EventHub Consumer"

  description = "Service Principal for AWS Lambda to read from Azure EventHub (read-only)"
}

resource "azuread_service_principal" "tmf_lambda_app" {
  client_id = azuread_application.tmf_lambda_app.client_id
}

resource "azuread_application_password" "tmf_lambda_app" {
  application_id = azuread_application.tmf_lambda_app.id
}

//=============================================================================
// ADMIN APP - Entra ID OIDC (user sign-in, delegated permissions)
//=============================================================================

resource "azuread_application" "tmf_admin_app" {
  display_name            = var.admin_app_display_name
  sign_in_audience        = "AzureADMyOrg"
  group_membership_claims = ["SecurityGroup"]

  web {
    redirect_uris = []
  }

  optional_claims {
    id_token {
      name = "groups"
    }
  }

  required_resource_access {
    resource_app_id = local.graph_client_id

    // openid (delegated)
    resource_access {
      id   = "37f7f235-527c-4136-accd-4a02d197296e"
      type = "Scope"
    }
    // profile (delegated)
    resource_access {
      id   = "14dad69e-099b-42c9-810b-d002981feec1"
      type = "Scope"
    }
    // email (delegated)
    resource_access {
      id   = "64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0"
      type = "Scope"
    }
    // User.Read (delegated)
    resource_access {
      id   = "e1fe6dd8-ba31-4d61-89e7-88639da4683d"
      type = "Scope"
    }
  }

}

resource "azuread_service_principal" "tmf_admin_app" {
  client_id = azuread_application.tmf_admin_app.client_id
}

resource "azuread_application_password" "tmf_admin_app" {
  application_id = azuread_application.tmf_admin_app.id
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

// Admin group for application administrators (RBAC - who can access the admin app)
resource "azuread_group" "admins" {
  display_name     = "${var.admin_group_display_name} (${var.environment})"
  mail_enabled     = false
  security_enabled = true

  description = "Administrators for Teams Meeting Fetcher application"

  lifecycle {
    prevent_destroy = true      # Prevent accidental deletion
    ignore_changes  = [members] # Don't manage members in terraform to avoid conflicts with manual additions
  }
}

// Monitored users group (users whose meetings are tracked)
resource "azuread_group" "monitored_users" {
  display_name     = "${var.monitored_group_display_name} (${var.environment})"
  mail_enabled     = false
  security_enabled = true

  description = "Users whose Teams meetings are monitored by Teams Meeting Fetcher"

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [members]
  }
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

// Add test user to monitored users group (so their meetings are tracked)
resource "azuread_group_member" "test_user_monitored" {
  count = var.create_test_user ? 1 : 0

  group_object_id  = azuread_group.monitored_users.object_id
  member_object_id = azuread_user.test_user[0].object_id
}
