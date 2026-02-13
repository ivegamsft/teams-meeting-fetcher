#!/usr/bin/env python3
"""
Create calendar subscriptions for all users in an Entra group.
"""
import sys
import os
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers
import requests
import time

def get_group_members(group_id):
    """Get all members of an Entra group."""
    headers = get_graph_headers()
    
    url = f"https://graph.microsoft.com/v1.0/groups/{group_id}/members"
    members = []
    
    print(f"📋 Fetching members from group {group_id}...")
    
    while url:
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            members.extend(data.get('value', []))
            url = data.get('@odata.nextLink')
        else:
            print(f"❌ Failed to get group members: {response.status_code}")
            print(response.text[:500])
            return []
    
    # Filter to only users (exclude groups, devices, etc.)
    users = [m for m in members if m.get('@odata.type') == '#microsoft.graph.user']
    
    print(f"✅ Found {len(users)} user(s) in group")
    return users

def create_calendar_subscription(user_email):
    """Create subscription for a user's calendar events."""
    
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
    
    response = requests.post(
        "https://graph.microsoft.com/v1.0/subscriptions",
        headers=headers,
        json=subscription_data,
        timeout=30
    )
    
    if response.status_code == 201:
        result = response.json()
        return {
            'success': True,
            'user': user_email,
            'subscription_id': result['id'],
            'resource': result['resource'],
            'expires': result['expirationDateTime']
        }
    else:
        return {
            'success': False,
            'user': user_email,
            'error': f"{response.status_code}: {response.text[:200]}"
        }

def main():
    GROUP_ID = "0f7ef748-604e-4fbd-8e00-06a3e2cb7250"
    
    print("=" * 80)
    print("CREATE CALENDAR SUBSCRIPTIONS FOR GROUP MEMBERS")
    print("=" * 80)
    
    # Get group members
    members = get_group_members(GROUP_ID)
    
    if not members:
        print("❌ No members found or error occurred")
        return
    
    print(f"\n📝 Creating calendar subscriptions for {len(members)} users...")
    print("-" * 80)
    
    successful = []
    failed = []
    
    for i, member in enumerate(members, 1):
        user_email = member.get('userPrincipalName')
        display_name = member.get('displayName', 'Unknown')
        
        if not user_email:
            print(f"{i}. ⚠️  {display_name}: No email address")
            continue
        
        print(f"{i}. Creating subscription for {display_name} ({user_email})...")
        
        result = create_calendar_subscription(user_email)
        
        if result['success']:
            print(f"   ✅ Success! ID: {result['subscription_id'][:20]}...")
            successful.append(result)
        else:
            print(f"   ❌ Failed: {result['error']}")
            failed.append(result)
        
        # Rate limiting: wait between requests
        if i < len(members):
            time.sleep(1)
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"✅ Successful: {len(successful)}")
    print(f"❌ Failed: {len(failed)}")
    
    if successful:
        print(f"\n💾 Save all successful subscriptions to DynamoDB:")
        print("-" * 80)
        for sub in successful:
            print(f"python scripts/aws/subscription-tracker.py save \\")
            print(f'  --id "{sub["subscription_id"]}" \\')
            print(f'  --resource "{sub["resource"]}" \\')
            print(f'  --expiry "{sub["expires"]}" \\')
            print(f'  --type "calendar"')
            print()
    
    if failed:
        print(f"\n❌ Failed subscriptions:")
        for fail in failed:
            print(f"   - {fail['user']}: {fail['error']}")

if __name__ == "__main__":
    main()
