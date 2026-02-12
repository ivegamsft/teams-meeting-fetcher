"""
Authentication Helper for Microsoft Graph API
Shared authentication logic for all Graph scripts
"""
import os
from msal import ConfidentialClientApplication
from dotenv import load_dotenv


def get_graph_token(scopes=None):
    """
    Acquire access token for Microsoft Graph API
    Uses client credentials flow (application permissions)
    """
    load_dotenv('.env.local.azure')
    
    tenant_id = os.getenv('GRAPH_TENANT_ID')
    client_id = os.getenv('GRAPH_CLIENT_ID')
    client_secret = os.getenv('GRAPH_CLIENT_SECRET')
    
    if not all([tenant_id, client_id, client_secret]):
        raise ValueError(
            "Missing required environment variables:\n"
            "- GRAPH_TENANT_ID\n"
            "- GRAPH_CLIENT_ID\n"
            "- GRAPH_CLIENT_SECRET\n"
            "Please ensure .env.local.azure is configured."
        )
    
    # Default scopes for application permissions
    if scopes is None:
        scopes = ["https://graph.microsoft.com/.default"]
    
    # Create MSAL app
    app = ConfidentialClientApplication(
        client_id=client_id,
        client_credential=client_secret,
        authority=f"https://login.microsoftonline.com/{tenant_id}"
    )
    
    # Acquire token
    result = app.acquire_token_for_client(scopes=scopes)
    
    if "access_token" in result:
        return result["access_token"]
    else:
        error = result.get("error_description", result.get("error"))
        raise Exception(f"Failed to acquire token: {error}")


def get_graph_headers():
    """Get headers for Graph API requests including auth token"""
    token = get_graph_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }


def get_config():
    """Load configuration from environment"""
    load_dotenv('.env.local.azure')
    
    return {
        'tenant_id': os.getenv('GRAPH_TENANT_ID'),
        'client_id': os.getenv('GRAPH_CLIENT_ID'),
        'client_secret': os.getenv('GRAPH_CLIENT_SECRET'),
        'group_id': os.getenv('ENTRA_GROUP_ID'),
        'webhook_url': os.getenv('AWS_WEBHOOK_ENDPOINT') or os.getenv('AZURE_WEBHOOK_ENDPOINT'),
        'webhook_secret': os.getenv('WEBHOOK_AUTH_SECRET')
    }
