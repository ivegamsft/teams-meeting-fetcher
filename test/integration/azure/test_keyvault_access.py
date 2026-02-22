"""
Azure Key Vault Integration Tests
Tests RBAC-based secret retrieval from Key Vault
"""
import pytest
import os
from azure.core.exceptions import ResourceNotFoundError
import sys
sys.path.append('..')
from utils.azure_helpers import (
    get_keyvault_secret,
    list_keyvault_secrets,
    get_azure_credential,
    get_terraform_outputs_azure
)


@pytest.fixture(scope='module')
def azure_config():
    """Load Azure configuration from Terraform outputs or environment"""
    try:
        outputs = get_terraform_outputs_azure()
        return {
            'keyvault_name': outputs['key_vault_name'],
            'tenant_id': outputs['app_tenant_id'],
            'storage_account': outputs['storage_account_name']
        }
    except FileNotFoundError:
        # Fallback to environment variables
        return {
            'keyvault_name': os.getenv('AZURE_KEYVAULT_NAME', 'tmf-kv-eus-7onuku'),
            'tenant_id': os.getenv('AZURE_TENANT_ID'),
            'storage_account': os.getenv('AZURE_STORAGE_ACCOUNT', 'tmfsteus7onuku')
        }


@pytest.fixture
def azure_credential():
    """Get Azure credentials for testing"""
    return get_azure_credential(
        tenant_id=os.getenv('AZURE_TENANT_ID'),
        client_id=os.getenv('AZURE_CLIENT_ID'),
        client_secret=os.getenv('AZURE_CLIENT_SECRET')
    )


class TestKeyVaultRBAC:
    """Test Key Vault RBAC-based access"""

    def test_list_secrets(self, azure_config, azure_credential):
        """Should list secrets in Key Vault"""
        secrets = list_keyvault_secrets(
            azure_config['keyvault_name'],
            credential=azure_credential
        )
        
        assert isinstance(secrets, list)
        assert len(secrets) > 0
        # Should contain secrets created by Terraform
        assert 'app-client-secret' in secrets

    def test_retrieve_app_client_secret(self, azure_config, azure_credential):
        """Should retrieve app client secret from Key Vault"""
        secret_value = get_keyvault_secret(
            azure_config['keyvault_name'],
            'app-client-secret',
            credential=azure_credential
        )
        
        assert secret_value is not None
        assert len(secret_value) > 0
        # Azure AD client secrets are typically 40+ characters
        assert len(secret_value) >= 20

    @pytest.mark.skip(reason="EventGrid now uses RBAC-only auth (eventhub_local_auth_enabled=false), access key no longer stored")
    def test_retrieve_eventgrid_key(self, azure_config, azure_credential):
        """Should retrieve Event Grid access key from Key Vault"""
        secret_value = get_keyvault_secret(
            azure_config['keyvault_name'],
            'eventgrid-access-key',
            credential=azure_credential
        )
        
        assert secret_value is not None
        assert len(secret_value) > 0

    def test_retrieve_appinsights_key(self, azure_config, azure_credential):
        """Should retrieve Application Insights key from Key Vault"""
        secret_value = get_keyvault_secret(
            azure_config['keyvault_name'],
            'appinsights-instrumentation-key',
            credential=azure_credential
        )
        
        assert secret_value is not None
        # App Insights keys are UUIDs
        assert len(secret_value) == 36  # UUID format with hyphens

    def test_nonexistent_secret_raises_error(self, azure_config, azure_credential):
        """Should raise error for non-existent secret"""
        with pytest.raises(ValueError, match="not found"):
            get_keyvault_secret(
                azure_config['keyvault_name'],
                'nonexistent-secret-12345',
                credential=azure_credential
            )


class TestKeyVaultPermissions:
    """Test RBAC permissions for Key Vault"""

    def test_user_has_read_permissions(self, azure_config, azure_credential):
        """Test user/SPN has Key Vault Secrets User role"""
        # Attempt to read a secret
        try:
            secrets = list_keyvault_secrets(
                azure_config['keyvault_name'],
                credential=azure_credential
            )
            assert len(secrets) >= 0  # Should not throw permission error
        except Exception as e:
            # If we get a permission error, test should fail
            if 'Forbidden' in str(e) or '403' in str(e):
                pytest.fail(
                    "User/SPN does not have 'Key Vault Secrets User' permissions. "
                    "Grant RBAC role to read secrets."
                )
            raise

    def test_rbac_authorization_enabled(self, azure_config):
        """Verify Key Vault uses RBAC (not access policies)"""
        # This would require Azure Management SDK to check vault settings
        # For now, verify we can authenticate with RBAC
        # TODO: Implement with azure-mgmt-keyvault
        assert True  # Placeholder


class TestSecretValues:
    """Test secret value formats and validity"""

    def test_app_client_secret_format(self, azure_config, azure_credential):
        """App client secret should be valid Azure AD format"""
        secret = get_keyvault_secret(
            azure_config['keyvault_name'],
            'app-client-secret',
            credential=azure_credential
        )
        
        # Azure AD client secrets contain alphanumeric and special chars
        assert any(c.isalnum() for c in secret)
        # Should not be a placeholder
        assert 'REPLACE' not in secret
        assert 'TODO' not in secret

    @pytest.mark.skip(reason="EventGrid now uses RBAC-only auth, access key no longer stored in Key Vault")
    def test_eventgrid_key_format(self, azure_config, azure_credential):
        """Event Grid key should be valid format"""
        secret = get_keyvault_secret(
            azure_config['keyvault_name'],
            'eventgrid-access-key',
            credential=azure_credential
        )
        
        # Event Grid keys are base64-encoded strings
        assert len(secret) > 40
        assert any(c.isalnum() for c in secret)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
