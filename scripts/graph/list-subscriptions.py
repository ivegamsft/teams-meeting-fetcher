#!/usr/bin/env python3
import requests
import sys
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers

print("=" * 80)
print("🔔 SUBSCRIPTIONS STATUS CHECK")
print("=" * 80)

headers = get_graph_headers()

# List all subscriptions
print(f"\nRetrieving all active subscriptions...\n")
subscriptions_url = "https://graph.microsoft.com/v1.0/subscriptions"

resp = requests.get(subscriptions_url, headers=headers, timeout=10)

if resp.status_code == 200:
    subscriptions = resp.json().get('value', [])
    print(f"✅ Found {len(subscriptions)} subscription(s)\n")
    
    for i, sub in enumerate(subscriptions, 1):
        resource = sub.get('resource', 'N/A')
        notification_url = sub.get('notificationUrl', 'N/A')
        state = sub.get('state', 'N/A')
        expiration = sub.get('expirationDateTime', 'N/A')
        created = sub.get('createdDateTime', 'N/A')
        
        print(f"Subscription {i}:")
        print(f"  ID: {sub.get('id', 'N/A')}")
        print(f"  Resource: {resource}")
        print(f"  Notification URL: {notification_url[:60]}...")
        print(f"  State: {state}")
        print(f"  Created: {created}")
        print(f"  Expires: {expiration}")
        
        # Check if this is a calendar or transcript subscription
        if 'transcript' in resource.lower():
            print(f"  ➡️  TYPE: TRANSCRIPT SUBSCRIPTION ✅\n")
        elif 'event' in resource.lower():
            print(f"  ➡️  TYPE: CALENDAR SUBSCRIPTION ✅\n")
        else:
            print(f"  ➡️  TYPE: OTHER\n")
            
else:
    print(f"❌ Error retrieving subscriptions: {resp.status_code}")
    print(f"Response: {resp.text[:300]}")

print("=" * 80)
