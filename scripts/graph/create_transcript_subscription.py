"""Create webhook subscription for meeting transcripts"""
import sys
import requests
from datetime import datetime, timedelta
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers, get_config

headers = get_graph_headers()
config = get_config()

user_email = "boldoriole@ibuyspy.net"
webhook_url = config['webhook_url']
client_state = config.get('webhook_secret', 'default-client-state')[:255]

# Delete existing subscriptions first
print("📋 Listing existing subscriptions...")
list_url = "https://graph.microsoft.com/v1.0/subscriptions"
list_resp = requests.get(list_url, headers=headers, timeout=10)

if list_resp.status_code == 200:
    subscriptions = list_resp.json().get('value', [])
    print(f"Found {len(subscriptions)} existing subscription(s)")
    
    for sub in subscriptions:
        print(f"\n  Subscription: {sub['id']}")
        print(f"    Resource: {sub['resource']}")
        print(f"    Expires: {sub['expirationDateTime']}")

print(f"\n{'='*60}")
print("Creating transcript subscription...")
print('='*60)

# Create subscription for user's online meeting transcripts
# Resource: users/{userId}/onlineMeetings/getAllTranscripts
resource = f"users/{user_email}/onlineMeetings/getAllTranscripts"
expiration = datetime.utcnow() + timedelta(hours=1)  # 1 hour for testing

subscription_payload = {
    "changeType": "created",
    "notificationUrl": webhook_url,
    "resource": resource,
    "expirationDateTime": expiration.strftime("%Y-%m-%dT%H:%M:%S.0000000Z"),
    "clientState": client_state
}

print(f"\nSubscription details:")
print(f"  Resource: {resource}")
print(f"  Webhook URL: {webhook_url}")
print(f"  Change Type: created")
print(f"  Expires: {expiration.strftime('%Y-%m-%d %H:%M:%S UTC')}")

create_resp = requests.post(list_url, headers=headers, json=subscription_payload, timeout=30)

print(f"\nStatus: {create_resp.status_code}")

if create_resp.status_code == 201:
    subscription = create_resp.json()
    print("\n✅ Transcript subscription created successfully!")
    print(f"  Subscription ID: {subscription['id']}")
    print(f"  Expires: {subscription['expirationDateTime']}")
    print(f"\n💡 When a transcript becomes available, we'll get a notification with:")
    print("  - Meeting ID")
    print("  - Transcript ID")
    print("  - We can then fetch the transcript content")
elif create_resp.status_code == 400:
    print("\n❌ Bad request - check the subscription payload")
    print(f"Response: {create_resp.text}")
elif create_resp.status_code == 403:
    print("\n❌ Forbidden - may need additional permissions")
    print("Required: OnlineMeetingTranscript.Read.All or OnlineMeetingTranscript.Read.Chat")
    print(f"Response: {create_resp.text[:500]}")
else:
    print(f"\n❌ Failed to create subscription")
    print(f"Response: {create_resp.text[:500]}")
