// Azure deployment entry point - modularized
// See specs/infrastructure-terraform-spec.md for the full resource design.

// Resource naming convention: {base}-{resource-type}-{region}-{suffix}
// Base: tmf (Teams Meeting Fetcher)
// Storage accounts use compact format (no hyphens): {base}{type}{region}{suffix}

//=============================================================================
// RANDOM RESOURCES FOR NAMING
//=============================================================================

// Generate unique deployment suffix
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
  numeric = true
  lower   = true
}

// Generate random pet name for test user
resource "random_pet" "test_user" {
  length    = 2
  separator = ""
}

// Generate secure random password for test user
resource "random_password" "test_user" {
  length  = 24
  special = true
  upper   = true
  lower   = true
  numeric = true

  min_special = 2
  min_upper   = 2
  min_lower   = 2
  min_numeric = 2
}

//=============================================================================
// DATA SOURCES
//=============================================================================

// Get current client config
data "azurerm_client_config" "current" {}

// Get current Azure AD user/SPN
data "azuread_client_config" "current" {}

// Get Azure AD domains to use default verified domain for test user
// NOTE: Requires Directory.Read.All permission on SPN
// Only queried when create_test_user is true (avoids needing permission in CI)
data "azuread_domains" "aad_domains" {
  only_default = true
}

//=============================================================================
// LOCAL VALUES
//=============================================================================

locals {
  base_name = var.base_name
  suffix    = random_string.suffix.result
  // Default domain for test user UPN (requires Directory.Read.All to query domains)
  // Only resolved when create_test_user is true; uses override if provided
  default_domain = var.domain_name_suffix != "" ? var.domain_name_suffix : data.azuread_domains.aad_domains.domains[0].domain_name

  // Common tags
  common_tags = {
    Environment = var.environment
    Project     = "teams-meeting-fetcher"
    ManagedBy   = "terraform"
    Suffix      = local.suffix
  }

  // Resource names
  rg_name      = "${local.base_name}-rg-${var.region_short}-${local.suffix}"
  kv_name      = "${local.base_name}-kv-${var.region_short}-${local.suffix}"
  storage_name = "${local.base_name}st${var.region_short}${local.suffix}" // no hyphens for storage
  law_name     = "${local.base_name}-law-${var.region_short}-${local.suffix}"
  ai_name      = "${local.base_name}-ai-${var.region_short}-${local.suffix}"
  eg_name      = "${local.base_name}-egt-${var.region_short}-${local.suffix}"
  ehns_name    = "${local.base_name}-ehns-${var.region_short}-${local.suffix}"
  eh_name      = "${local.base_name}-eh-${var.region_short}-${local.suffix}"

  // Test user configuration
  test_user_upn           = "${random_pet.test_user.id}@${local.default_domain}"
  test_user_display_name  = "${upper(local.base_name)} ${title(random_pet.test_user.id)}"
  test_user_mail_nickname = random_pet.test_user.id
}

//=============================================================================
// RESOURCE GROUP
//=============================================================================

resource "azurerm_resource_group" "main" {
  name     = local.rg_name
  location = var.azure_region
  tags     = local.common_tags
}

//=============================================================================
// AZURE AD MODULE - App Registration, Service Principal, Groups, Test User
//=============================================================================

module "azure_ad" {
  source = "./modules/azure-ad"

  environment              = var.environment
  app_display_name         = var.app_display_name
  bot_app_display_name     = var.bot_app_display_name
  admin_group_display_name     = var.admin_group_display_name
  monitored_group_display_name = var.monitored_group_display_name
  admin_app_display_name   = "${var.base_name}-admin-app-${local.suffix}"
  admin_app_redirect_uri   = var.admin_app_redirect_uri

  // Test user configuration
  create_test_user         = var.create_test_user
  test_user_upn            = local.test_user_upn
  test_user_display_name   = local.test_user_display_name
  test_user_mail_nickname  = local.test_user_mail_nickname
  test_user_password       = random_password.test_user.result
  test_user_usage_location = "US"
}

//=============================================================================
// KEY VAULT MODULE - Secure secrets storage with firewall
//=============================================================================

module "key_vault" {
  source = "./modules/key-vault"

  key_vault_name          = local.kv_name
  location                = azurerm_resource_group.main.location
  resource_group_name     = azurerm_resource_group.main.name
  tenant_id               = data.azurerm_client_config.current.tenant_id
  sku_name                = var.key_vault_sku
  allowed_ip_addresses    = var.allowed_ip_addresses
  deployment_principal_id = data.azurerm_client_config.current.object_id
  app_principal_id        = module.azure_ad.service_principal_object_id

  log_analytics_workspace_id = module.monitoring.log_analytics_workspace_id

  // Store application secrets
  secrets = {
    "app-client-secret" = module.azure_ad.app_client_secret
    // Removed eventgrid-access-key: using RBAC-only authentication (eventhub_local_auth_enabled = false)
    "appinsights-instrumentation-key" = module.monitoring.app_insights_instrumentation_key
  }

  tags = local.common_tags
}

//=============================================================================
// STORAGE MODULE - Blob storage for webhook payloads with firewall
//=============================================================================

module "storage" {
  source = "./modules/storage"

  storage_account_name    = local.storage_name
  resource_group_name     = azurerm_resource_group.main.name
  location                = azurerm_resource_group.main.location
  allowed_ip_addresses    = var.allowed_ip_addresses
  deployment_principal_id = data.azurerm_client_config.current.object_id

  log_analytics_workspace_id = module.monitoring.log_analytics_workspace_id

  container_names = [
    "webhooks",
    "microsoft-graph-change-notifications" // Required by Graph API for rich notifications > 1MB
  ]

  tags = local.common_tags
}

//=============================================================================
// MONITORING MODULE - Log Analytics, App Insights, Event Grid
//=============================================================================

module "monitoring" {
  source = "./modules/monitoring"

  log_analytics_workspace_name = local.law_name
  app_insights_name            = local.ai_name
  eventgrid_topic_name         = local.eg_name
  eventhub_namespace_name      = local.ehns_name
  eventhub_name                = local.eh_name
  resource_group_name          = azurerm_resource_group.main.name
  location                     = azurerm_resource_group.main.location
  current_user_object_id       = var.current_user_object_id
  eventhub_local_auth_enabled  = var.eventhub_local_auth_enabled

  tags = local.common_tags
}

//=============================================================================
// BOT SERVICE MODULE - Bot Framework registration + Teams channel
//=============================================================================

module "bot_service" {
  source = "./modules/bot-service"

  bot_name                = "${local.base_name}-bot-${var.region_short}-${local.suffix}"
  resource_group_name     = azurerm_resource_group.main.name
  sku                     = "F0"
  microsoft_app_id        = module.azure_ad.bot_app_client_id
  microsoft_app_type      = "SingleTenant"
  microsoft_app_tenant_id = data.azurerm_client_config.current.tenant_id

  app_insights_key    = module.monitoring.app_insights_instrumentation_key
  app_insights_app_id = module.monitoring.app_insights_app_id

  log_analytics_workspace_id = module.monitoring.log_analytics_workspace_id

  messaging_endpoint = var.bot_messaging_endpoint

  tags = local.common_tags
}

//=============================================================================
// Security Module - Consolidated RBAC
//=============================================================================

module "security" {
  source = "./modules/security"

  storage_account_id    = module.storage.storage_account_id
  eventhub_namespace_id = module.monitoring.eventhub_namespace_id
  app_principal_id      = module.azure_ad.service_principal_object_id
  lambda_principal_id   = module.azure_ad.lambda_service_principal_object_id
}
