#!/usr/bin/env python3
"""
Recreate user calendar subscription.
"""
import sys
import os
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers
import requests

def create_calendar_subscription():
    """Create subscription for user calendar events."""
    
    user_email = "boldoriole@ibuyspy.net"
    webhook_url = "https://xszdr2r589.execute-api.us-east-1.amazonaws.com/dev/graph"
    client_state = "q9bjFzBPhE0R62XgdAVkD7GsJp5fn3oliTC4ZtmMxUIeLuSYr8NwHaOQK1vWyc"
    
    headers = get_graph_headers()
    
    subscription_data = {
        "changeType": "created,updated,deleted",
        "notificationUrl": webhook_url,
        "resource": f"users/{user_email}/events",
        "expirationDateTime": "2026-02-15T00:00:00Z",
        "clientState": client_state
    }
    
    print(f"📝 Creating calendar subscription...")
    print(f"   User: {user_email}")
    print(f"   Resource: users/{user_email}/events")
    
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
        print(f"   Expires: {result['expirationDateTime']}")
        
        print(f"\n💾 Save to DynamoDB:")
        print(f"python scripts/aws/subscription-tracker.py save \\")
        print(f'  --id "{result["id"]}" \\')
        print(f'  --resource "{result["resource"]}" \\')
        print(f'  --expiry "{result["expirationDateTime"]}" \\')
        print(f'  --type "calendar"')
        
        return result
    else:
        print(f"\n❌ Failed!")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return None

if __name__ == "__main__":
    create_calendar_subscription()
