#!/usr/bin/env python3
"""
Recreate the missing transcript webhook subscription
"""
import requests
import sys
from datetime import datetime, timedelta
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers, get_config

print("=" * 80)
print("🔔 RECREATING TRANSCRIPT WEBHOOK SUBSCRIPTION")
print("=" * 80)

headers = get_graph_headers()
config = get_config()
webhook_url = config['webhook_url']
webhook_secret = config.get('webhook_secret', 'default-client-state')[:255]

print(f"\n📝 Subscription Details:")
print(f"   Webhook URL: {webhook_url}")
print(f"   Client State: {webhook_secret}")

# Resource for transcript notifications
resource = "users/boldoriole@ibuyspy.net/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='e5fe8748-76f0-42ed-b521-241e8252baba')"
change_types = ["created"]

# For resources requiring lifecycleNotificationUrl, use shorter expiration (max 1 hour) if not providing it
# OR provide a lifecycleNotificationUrl via the config or use the same webhook URL
expiration = datetime.utcnow() + timedelta(hours=24)  # 24 hours

payload = {
    "changeType": ",".join(change_types),
    "notificationUrl": webhook_url,
    "resource": resource,
    "expirationDateTime": expiration.strftime("%Y-%m-%dT%H:%M:%S.0000000Z"),
    "clientState": webhook_secret,
    "lifecycleNotificationUrl": webhook_url  # Add lifecycle notification for long-lived subscriptions
}

print(f"\n📋 Creating subscription:")
print(f"   Resource: {resource}")
print(f"   Change Types: {', '.join(change_types)}")
print(f"   Expiration: {payload['expirationDateTime']}")
print(f"   Lifecycle Notifications: {webhook_url[:50]}...")

url = "https://graph.microsoft.com/v1.0/subscriptions"

try:
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    
    if response.status_code == 201:
        subscription = response.json()
        print(f"\n✅ SUCCESS! Transcript subscription created!")
        print(f"\n   ID: {subscription['id']}")
        print(f"   Resource: {subscription.get('resource', 'N/A')}")
        print(f"   Expires: {subscription['expirationDateTime']}")
        print(f"\n⏰ REMINDER: This subscription will expire in 72 hours")
        print(f"   Plan to renew before: {expiration.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        
    else:
        print(f"\n❌ FAILED: {response.status_code}")
        try:
            error = response.json()
            print(f"\n   Error: {error.get('error', {}).get('message', response.text)}")
        except:
            print(f"   Response: {response.text[:200]}")
            
except Exception as e:
    print(f"\n❌ Exception: {e}")

print("\n" + "=" * 80)
