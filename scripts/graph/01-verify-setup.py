"""
Step 1: Verify Setup
Validates configuration and Graph API permissions
"""
import sys
import requests
from auth_helper import get_graph_headers, get_config


def check_environment():
    """Verify environment variables are set"""
    print("🔍 Checking environment variables...")
    config = get_config()
    
    required = ['tenant_id', 'client_id', 'client_secret', 'group_id']
    missing = [key for key in required if not config.get(key)]
    
    if missing:
        print(f"❌ Missing required environment variables: {', '.join(missing)}")
        return False
    
    print("✅ Environment variables configured")
    return True


def check_graph_permissions():
    """Verify Graph API permissions by testing API calls"""
    print("\n🔍 Checking Graph API permissions...")
    headers = get_graph_headers()
    base_url = "https://graph.microsoft.com/v1.0"
    
    tests = [
        ("Calendars.Read", f"{base_url}/users", "List users"),
        ("OnlineMeetings.Read.All", f"{base_url}/communications/onlineMeetings", "List meetings"),
        ("Group.Read.All", f"{base_url}/groups", "List groups"),
    ]
    
    all_passed = True
    for permission, url, description in tests:
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                print(f"  ✅ {permission}: {description} - OK")
            elif response.status_code == 403:
                print(f"  ❌ {permission}: {description} - FORBIDDEN (missing permission or no admin consent)")
                all_passed = False
            else:
                print(f"  ⚠️  {permission}: {description} - Status {response.status_code}")
        except Exception as e:
            print(f"  ❌ {permission}: {description} - Error: {e}")
            all_passed = False
    
    return all_passed


def check_target_group():
    """Verify target group exists and get details"""
    print("\n🔍 Checking target Entra group...")
    config = get_config()
    group_id = config['group_id']
    
    if not group_id:
        print("  ⚠️  No ENTRA_GROUP_ID configured")
        return False
    
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/groups/{group_id}"
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            group = response.json()
            print(f"  ✅ Group found: {group['displayName']}")
            print(f"     ID: {group['id']}")
            print(f"     Mail: {group.get('mail', 'N/A')}")
            
            # Get member count
            members_url = f"{url}/members"
            members_response = requests.get(members_url, headers=headers, timeout=10)
            if members_response.status_code == 200:
                member_count = len(members_response.json().get('value', []))
                print(f"     Members: {member_count}")
            return True
        elif response.status_code == 404:
            print(f"  ❌ Group not found with ID: {group_id}")
            return False
        else:
            print(f"  ❌ Error checking group: {response.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False


def check_webhook_endpoint():
    """Verify webhook endpoint is configured"""
    print("\n🔍 Checking webhook endpoint...")
    config = get_config()
    webhook_url = config['webhook_url']
    
    if not webhook_url:
        print("  ⚠️  No webhook endpoint configured")
        print("     Set AWS_WEBHOOK_ENDPOINT or AZURE_WEBHOOK_ENDPOINT")
        return False
    
    print(f"  ✅ Webhook URL: {webhook_url}")
    
    # Try to reach webhook (might fail if not public, that's OK)
    try:
        response = requests.get(webhook_url, timeout=5)
        print(f"     Response: {response.status_code}")
    except requests.exceptions.RequestException:
        print("     Note: Could not reach webhook (expected if not public)")
    
    return True


def main():
    """Run all verification checks"""
    print("=" * 60)
    print("Teams Meeting Fetcher - Setup Verification")
    print("=" * 60)
    
    checks = [
        ("Environment", check_environment),
        ("Graph API Permissions", check_graph_permissions),
        ("Target Group", check_target_group),
        ("Webhook Endpoint", check_webhook_endpoint)
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n❌ Error in {name}: {e}")
            results.append((name, False))
    
    print("\n" + "=" * 60)
    print("VERIFICATION SUMMARY")
    print("=" * 60)
    
    all_passed = True
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")
        if not passed:
            all_passed = False
    
    print("=" * 60)
    
    if all_passed:
        print("\n🎉 All checks passed! Ready to proceed.")
        return 0
    else:
        print("\n⚠️  Some checks failed. Please fix issues before proceeding.")
        print("\nCommon fixes:")
        print("1. Grant admin consent for Graph API permissions in Azure Portal")
        print("2. Ensure .env.local.azure has all required values")
        print("3. Verify target group exists and is accessible")
        return 1


if __name__ == "__main__":
    sys.exit(main())
