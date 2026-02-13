#!/usr/bin/env python3
"""
Create group calendar subscription for webhook notifications.
"""
import sys
import os
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers
import requests
import json

def create_group_subscription():
    """Create subscription for group calendar events."""
    
    group_id = "0f7ef748-604e-4fbd-8e00-06a3e2cb7250"
    webhook_url = "https://xszdr2r589.execute-api.us-east-1.amazonaws.com/dev/graph"
    client_state = "q9bjFzBPhE0R62XgdAVkD7GsJp5fn3oliTC4ZtmMxUIeLuSYr8NwHaOQK1vWyc"
    
    headers = get_graph_headers()
    
    subscription_data = {
        "changeType": "created,updated,deleted",
        "notificationUrl": webhook_url,
        "resource": f"groups/{group_id}/events",
        "expirationDateTime": "2026-02-15T00:00:00Z",  # ~2 days from now
        "clientState": client_state
    }
    
    print(f"📝 Creating group calendar subscription...")
    print(f"   Group ID: {group_id}")
    print(f"   Resource: groups/{group_id}/events")
    print(f"   Webhook: {webhook_url}")
    
    response = requests.post(
        "https://graph.microsoft.com/v1.0/subscriptions",
        headers=headers,
        json=subscription_data,
        timeout=30
    )
    
    if response.status_code == 201:
        result = response.json()
        print(f"\n✅ Subscription created successfully!")
        print(f"   ID: {result['id']}")
        print(f"   Resource: {result['resource']}")
        print(f"   Expires: {result['expirationDateTime']}")
        
        # Save to DynamoDB
        print(f"\n💾 Save this subscription to DynamoDB:")
        print(f"python scripts/aws/subscription-tracker.py save \\")
        print(f'  --id "{result["id"]}" \\')
        print(f'  --resource "{result["resource"]}" \\')
        print(f'  --expiry "{result["expirationDateTime"]}" \\')
        print(f'  --type "calendar"')
        
        return result
    else:
        print(f"\n❌ Failed to create subscription!")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return None

if __name__ == "__main__":
    create_group_subscription()
