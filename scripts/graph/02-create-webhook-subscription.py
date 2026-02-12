"""
Step 2: Create Webhook Subscription
Creates Graph API webhook subscription for calendar events
"""
import sys
import json
import requests
from datetime import datetime, timedelta
from auth_helper import get_graph_headers, get_config


def list_subscriptions():
    """List all active webhook subscriptions"""
    print("📋 Listing active webhook subscriptions...")
    headers = get_graph_headers()
    url = "https://graph.microsoft.com/v1.0/subscriptions"
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        subscriptions = response.json().get('value', [])
        if not subscriptions:
            print("  No active subscriptions found")
            return []
        
        for sub in subscriptions:
            print(f"\n  ID: {sub['id']}")
            print(f"  Resource: {sub['resource']}")
            print(f"  Change Types: {', '.join(sub['changeType'].split(','))}")
            print(f"  Expires: {sub['expirationDateTime']}")
            print(f"  Notification URL: {sub['notificationUrl']}")
        
        return subscriptions
    except Exception as e:
        print(f"  ❌ Error listing subscriptions: {e}")
        return []


def create_subscription(resource, change_types=None, expiration_hours=24):
    """
    Create webhook subscription for a resource
    
    Args:
        resource: Graph resource to monitor (e.g., "users/{userId}/events")
        change_types: List of change types (created, updated, deleted)
        expiration_hours: Hours until expiration (max 4230 = ~6 months for some resources)
    """
    if change_types is None:
        change_types = ["created", "updated"]
    
    config = get_config()
    webhook_url = config['webhook_url']
    
    if not webhook_url:
        print("❌ No webhook URL configured. Set AWS_WEBHOOK_ENDPOINT or AZURE_WEBHOOK_ENDPOINT")
        return None
    
    print(f"\n📝 Creating webhook subscription...")
    print(f"   Resource: {resource}")
    print(f"   Change Types: {', '.join(change_types)}")
    print(f"   Webhook URL: {webhook_url}")
    
    headers = get_graph_headers()
    url = "https://graph.microsoft.com/v1.0/subscriptions"
    
    # Calculate expiration (max 4230 hours for most resources, 3 days for messages/events)
    expiration = datetime.utcnow() + timedelta(hours=min(expiration_hours, 72))
    
    payload = {
        "changeType": ",".join(change_types),
        "notificationUrl": webhook_url,
        "resource": resource,
        "expirationDateTime": expiration.strftime("%Y-%m-%dT%H:%M:%S.0000000Z"),
        "clientState": config.get('webhook_secret', 'default-client-state')[:255]
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 201:
            subscription = response.json()
            print(f"\n✅ Subscription created successfully!")
            print(f"   ID: {subscription['id']}")
            print(f"   Expires: {subscription['expirationDateTime']}")
            print(f"\n   ⚠️  Remember to renew before expiration!")
            return subscription
        else:
            print(f"\n❌ Failed to create subscription: {response.status_code}")
            print(f"   {response.text}")
            return None
    except Exception as e:
        print(f"\n❌ Error creating subscription: {e}")
        return None


def delete_subscription(subscription_id):
    """Delete a webhook subscription"""
    print(f"\n🗑️  Deleting subscription {subscription_id}...")
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/subscriptions/{subscription_id}"
    
    try:
        response = requests.delete(url, headers=headers, timeout=10)
        if response.status_code == 204:
            print("   ✅ Subscription deleted")
            return True
        else:
            print(f"   ❌ Error: {response.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def renew_subscription(subscription_id, hours=24):
    """Renew a webhook subscription"""
    print(f"\n🔄 Renewing subscription {subscription_id}...")
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/subscriptions/{subscription_id}"
    
    expiration = datetime.utcnow() + timedelta(hours=min(hours, 72))
    payload = {
        "expirationDateTime": expiration.strftime("%Y-%m-%dT%H:%M:%S.0000000Z")
    }
    
    try:
        response = requests.patch(url, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            subscription = response.json()
            print(f"   ✅ Subscription renewed")
            print(f"   New expiration: {subscription['expirationDateTime']}")
            return subscription
        else:
            print(f"   ❌ Error: {response.status_code}")
            return None
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None


def main():
    """Interactive subscription management"""
    print("=" * 60)
    print("Microsoft Graph Webhook Subscription Manager")
    print("=" * 60)
    
    # List existing subscriptions
    subscriptions = list_subscriptions()
    
    print("\n" + "=" * 60)
    print("ACTIONS")
    print("=" * 60)
    print("1. Create subscription for all user events")
    print("2. Create subscription for specific user")
    print("3. Delete subscription")
    print("4. Renew subscription")
    print("5. Exit")
    
    choice = input("\nSelect action (1-5): ").strip()
    
    if choice == "1":
        # Subscribe to all users' calendar events (requires Application permission)
        resource = "users/delta"  # Track changes to users
        print("\n⚠️  Note: Subscribing to all users requires Calendars.Read application permission")
        print("   Consider using option 2 for a specific user instead")
        
        confirm = input("Continue? (y/n): ").strip().lower()
        if confirm == 'y':
            create_subscription(resource, ["created", "updated"], 24)
    
    elif choice == "2":
        user_email = input("Enter user email: ").strip()
        resource = f"users/{user_email}/events"
        create_subscription(resource, ["created", "updated", "deleted"], 24)
    
    elif choice == "3":
        if not subscriptions:
            print("No subscriptions to delete")
        else:
            sub_id = input("Enter subscription ID to delete: ").strip()
            delete_subscription(sub_id)
    
    elif choice == "4":
        if not subscriptions:
            print("No subscriptions to renew")
        else:
            sub_id = input("Enter subscription ID to renew: ").strip()
            hours = input("Hours to extend (default 24, max 72): ").strip()
            hours = int(hours) if hours else 24
            renew_subscription(sub_id, hours)
    
    elif choice == "5":
        print("Exiting...")
    
    else:
        print("Invalid choice")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
