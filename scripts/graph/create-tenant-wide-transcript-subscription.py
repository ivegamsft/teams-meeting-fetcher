#!/usr/bin/env python3
"""
Create TENANT-WIDE transcript subscription (all users, all meetings).
"""
import sys
import os
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers
import requests

def create_tenant_wide_transcript_subscription():
    """Create subscription for ALL transcripts in the tenant."""
    
    webhook_url = "https://xszdr2r589.execute-api.us-east-1.amazonaws.com/dev/graph"
    client_state = "q9bjFzBPhE0R62XgdAVkD7GsJp5fn3oliTC4ZtmMxUIeLuSYr8NwHaOQK1vWyc"
    
    headers = get_graph_headers()
    
    subscription_data = {
        "changeType": "created",
        "notificationUrl": webhook_url,
        "resource": "communications/onlineMeetings/getAllTranscripts",  # NO USER FILTER = ALL MEETINGS
        "expirationDateTime": "2026-02-15T00:00:00Z",
        "clientState": client_state,
        "includeResourceData": False
    }
    
    print(f"📝 Creating TENANT-WIDE transcript subscription...")
    print(f"   Resource: communications/onlineMeetings/getAllTranscripts")
    print(f"   Scope: ALL USERS, ALL MEETINGS")
    
    response = requests.post(
        "https://graph.microsoft.com/v1.0/subscriptions",
        headers=headers,
        json=subscription_data,
        timeout=30
    )
    
    if response.status_code == 201:
        result = response.json()
        print(f"\n✅ TENANT-WIDE subscription created!")
        print(f"   ID: {result['id']}")
        print(f"   Resource: {result['resource']}")
        print(f"   Expires: {result['expirationDateTime']}")
        
        print(f"\n💾 Save to DynamoDB:")
        print(f"python scripts/aws/subscription-tracker.py save \\")
        print(f'  --id "{result["id"]}" \\')
        print(f'  --resource "{result["resource"]}" \\')
        print(f'  --expiry "{result["expirationDateTime"]}" \\')
        print(f'  --type "transcript"')
        
        print(f"\n🗑️  Delete old user-specific transcript subscription:")
        print(f"python scripts/graph/02-create-webhook-subscription.py")
        print(f"# Choose option 3, enter: 15e81c83-f8e8-4f0c-8108-2c3a65451c91")
        
        return result
    else:
        print(f"\n❌ Failed!")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return None

if __name__ == "__main__":
    create_tenant_wide_transcript_subscription()
