"""
Step 5: Manage Target Group
Add/remove users from the monitored Entra group
"""
import sys
import requests
from auth_helper import get_graph_headers, get_config


def get_group_members(group_id):
    """List members of a group"""
    print(f"\n👥 Listing group members...")
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/groups/{group_id}/members"
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        members = response.json().get('value', [])
        if not members:
            print("   No members found")
            return []
        
        for member in members:
            print(f"\n   Name: {member.get('displayName', 'N/A')}")
            print(f"   Email: {member.get('mail') or member.get('userPrincipalName', 'N/A')}")
            print(f"   ID: {member['id']}")
        
        return members
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return []


def add_user_to_group(group_id, user_id):
    """Add user to group"""
    print(f"\n➕ Adding user to group...")
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/groups/{group_id}/members/$ref"
    
    payload = {
        "@odata.id": f"https://graph.microsoft.com/v1.0/users/{user_id}"
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        if response.status_code == 204:
            print("   ✅ User added successfully")
            return True
        elif response.status_code == 400 and 'already exist' in response.text:
            print("   ⚠️  User already in group")
            return True
        else:
            print(f"   ❌ Error: {response.status_code}")
            print(f"   {response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def remove_user_from_group(group_id, user_id):
    """Remove user from group"""
    print(f"\n➖ Removing user from group...")
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/groups/{group_id}/members/{user_id}/$ref"
    
    try:
        response = requests.delete(url, headers=headers, timeout=10)
        if response.status_code == 204:
            print("   ✅ User removed successfully")
            return True
        else:
            print(f"   ❌ Error: {response.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False


def find_user_by_email(user_email):
    """Find user by email and get their ID"""
    print(f"\n🔍 Finding user: {user_email}...")
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{user_email}"
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            user = response.json()
            print(f"   ✅ Found: {user['displayName']}")
            print(f"   ID: {user['id']}")
            return user
        else:
            print(f"   ❌ User not found")
            return None
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None


def main():
    """Interactive group management"""
    print("=" * 60)
    print("Manage Target Entra Group")
    print("=" * 60)
    
    config = get_config()
    group_id = config.get('group_id')
    
    if not group_id:
        print("\n❌ No ENTRA_GROUP_ID configured")
        return 1
    
    print(f"\nTarget Group ID: {group_id}")
    
    print("\nACTIONS")
    print("=" * 60)
    print("1. List group members")
    print("2. Add user to group")
    print("3. Remove user from group")
    print("4. Exit")
    
    choice = input("\nSelect action (1-4): ").strip()
    
    if choice == "1":
        get_group_members(group_id)
    
    elif choice == "2":
        user_email = input("Enter user email to add: ").strip()
        user = find_user_by_email(user_email)
        if user:
            add_user_to_group(group_id, user['id'])
    
    elif choice == "3":
        user_email = input("Enter user email to remove: ").strip()
        user = find_user_by_email(user_email)
        if user:
            remove_user_from_group(group_id, user['id'])
    
    elif choice == "4":
        print("Exiting...")
    
    else:
        print("Invalid choice")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
