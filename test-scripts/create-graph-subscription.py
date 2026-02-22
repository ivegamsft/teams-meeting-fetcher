#!/usr/bin/env python3
"""
Create Graph Change Tracking Subscription
Enables Graph API to send meeting change notifications to Event Hub
"""

import os
import json
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), 'nobots-eventhub', '.env'))

TENANT_ID = os.getenv('GRAPH_TENANT_ID')
CLIENT_ID = os.getenv('GRAPH_CLIENT_ID')
CLIENT_SECRET = os.getenv('GRAPH_CLIENT_SECRET')
EVENT_HUB_NAMESPACE = os.getenv('EVENT_HUB_NAMESPACE')
EVENT_HUB_NAME = os.getenv('EVENT_HUB_NAME')
GROUP_ID = os.getenv('GRAPH_GROUP_ID')

# Validate required environment variables
required_vars = {
    'GRAPH_TENANT_ID': TENANT_ID,
    'GRAPH_CLIENT_ID': CLIENT_ID,
    'GRAPH_CLIENT_SECRET': CLIENT_SECRET,
    'EVENT_HUB_NAMESPACE': EVENT_HUB_NAMESPACE,
    'EVENT_HUB_NAME': EVENT_HUB_NAME,
    'GRAPH_GROUP_ID': GROUP_ID
}

missing = [name for name, value in required_vars.items() if not value]
if missing:
    print(f'❌ Missing required environment variables: {", ".join(missing)}')
    print('   Please set them in nobots-eventhub/.env')
    exit(1)

print('\n' + '=' * 70)
print('🔌 Creating Graph Change Tracking Subscription')
print('=' * 70)

# Get token
print('\n📍 Getting Graph API token...')
token_url = f'https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token'
data = {
    'grant_type': 'client_credentials',
    'client_id': CLIENT_ID,
    'client_secret': CLIENT_SECRET,
    'scope': 'https://graph.microsoft.com/.default'
}

resp = requests.post(token_url, data=data)
if resp.status_code != 200:
    print(f'❌ Failed to get token: {resp.text}')
    exit(1)

token = resp.json()['access_token']
print('✅ Got Graph API token')

# Create subscription
headers = {
    'Authorization': f'Bearer {token}',
    'Content-Type': 'application/json'
}

# Create subscription for group calendar events
notification_url = f'https://{EVENT_HUB_NAMESPACE}/{EVENT_HUB_NAME}/messages?tenantId={TENANT_ID}'

subscription = {
    'changeType': 'created,updated,deleted',
    'notificationUrl': notification_url,
    'resource': f'/groups/{GROUP_ID}/events',
    'expirationDateTime': (datetime.utcnow() + timedelta(days=1)).isoformat() + 'Z',
    'clientState': 'verification_token',
    'includeResourceData': False
}

print('\n📋 Subscription Details:')
print(f'   Resource: /groups/{GROUP_ID[:8]}..../events')
print(f'   Event Hub: {EVENT_HUB_NAMESPACE}/{EVENT_HUB_NAME}')
print(f'   Change Types: created, updated, deleted')
print(f'   Expiration: 24 hours')

print('\n⏳ Creating subscription...')

resp = requests.post(
    'https://graph.microsoft.com/v1.0/subscriptions',
    headers=headers,
    json=subscription
)

if resp.status_code in [201, 200]:
    sub = resp.json()
    print('\n✅ Subscription CREATED!')
    print(f'\n   📌 ID: {sub["id"]}')
    print(f'   🔗 Resource: {sub["resource"]}')
    print(f'   ⏰ Expires: {sub["expirationDateTime"]}')
    print(f'   ✔️ Status: Active')
    
    print('\n' + '=' * 70)
    print('✅ Graph is now sending meeting change notifications to Event Hub!')
    print('=' * 70)
    print('\nNext steps:')
    print('  1. New calendar events will trigger Graph notifications')
    print('  2. Notifications appear in Event Hub within seconds')
    print('  3. Lambda processor reads and handles them')
    print('\n')
    
else:
    print(f'\n❌ Failed to create subscription: {resp.status_code}')
    print(f'\nError Details:')
    try:
        error = resp.json()
        print(json.dumps(error, indent=2))
    except:
        print(resp.text)
    print('\nTroubleshooting:')
    print('  • Check that Event Hub endpoint is accessible')
    print('  • Verify tenant ID and credentials are correct')
    print('  • Ensure Graph Change Tracking SPN has Event Hub permissions')
