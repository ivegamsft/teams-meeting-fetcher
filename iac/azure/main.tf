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
data "azuread_domains" "aad_domains" {
  only_default = true
}

// Get current public IP for firewall rules
data "http" "current_ip" {
  url = "https://api.ipify.org?format=text"
}

//=============================================================================
// LOCAL VALUES
//=============================================================================

locals {
  base_name = "tmf"
  suffix    = random_string.suffix.result

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

  // Test user configuration
  default_domain          = data.azuread_domains.aad_domains.domains[0].domain_name
  test_user_upn           = "${random_pet.test_user.id}@${local.default_domain}"
  test_user_display_name  = "TMF ${title(random_pet.test_user.id)}"
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
  admin_group_display_name = var.admin_group_display_name

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
  allowed_ip_addresses    = [data.http.current_ip.response_body]
  deployment_principal_id = data.azurerm_client_config.current.object_id
  app_principal_id        = module.azure_ad.service_principal_object_id

  // Store application secrets
  secrets = {
    "app-client-secret"               = module.azure_ad.app_client_secret
    "eventgrid-access-key"            = module.monitoring.eventgrid_topic_primary_access_key
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
  allowed_ip_addresses    = [data.http.current_ip.response_body]
  deployment_principal_id = data.azurerm_client_config.current.object_id
  app_principal_id        = module.azure_ad.service_principal_object_id

  container_names = ["webhooks"]

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
  resource_group_name          = azurerm_resource_group.main.name
  location                     = azurerm_resource_group.main.location

  tags = local.common_tags
}
