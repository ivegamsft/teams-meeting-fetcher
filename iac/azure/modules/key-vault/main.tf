// Key Vault module for secure secrets storage
// Manages Azure Key Vault with RBAC authentication and firewall rules

resource "azurerm_key_vault" "main" {
  name                = var.key_vault_name
  location            = var.location
  resource_group_name = var.resource_group_name
  tenant_id           = var.tenant_id
  sku_name            = var.sku_name

  enable_rbac_authorization     = true
  soft_delete_retention_days    = var.soft_delete_retention_days
  purge_protection_enabled      = var.purge_protection_enabled
  public_network_access_enabled = true

  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
    ip_rules       = var.allowed_ip_addresses
  }

  tags = var.tags
}

// Grant Key Vault Secrets Officer to deployment SPN
resource "azurerm_role_assignment" "deployment_kv_admin" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = var.deployment_principal_id
}

// Grant Key Vault Secrets User to application service principal
resource "azurerm_role_assignment" "app_kv_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = var.app_principal_id
}

// Store secrets in Key Vault
resource "azurerm_key_vault_secret" "secrets" {
  for_each = var.secrets

  name         = each.key
  value        = each.value
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.deployment_kv_admin]
}
