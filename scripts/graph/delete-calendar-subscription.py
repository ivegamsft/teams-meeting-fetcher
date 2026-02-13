#!/usr/bin/env python3
"""
Delete a Graph API webhook subscription.
"""
import sys
import os
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers
import requests

def delete_subscription(subscription_id):
    """Delete a subscription by ID."""
    
    headers = get_graph_headers()
    
    print(f"🗑️  Deleting subscription {subscription_id[:20]}...")
    
    response = requests.delete(
        f"https://graph.microsoft.com/v1.0/subscriptions/{subscription_id}",
        headers=headers,
        timeout=30
    )
    
    if response.status_code == 204:
        print(f"✅ Subscription deleted successfully!")
        return True
    else:
        print(f"❌ Failed to delete subscription!")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return False

if __name__ == "__main__":
    # Delete the old user-specific calendar subscription
    subscription_id = "05b3417a-89c9-4831-8282-04b834767f0d"
    delete_subscription(subscription_id)
