"""
Step 6: Test Webhook Delivery
Sends test payloads to webhook endpoint
"""
import sys
import requests
import json
from datetime import datetime
from auth_helper import get_config


def send_webhook_notification(webhook_url, payload, auth_token=None):
    """Send webhook notification"""
    headers = {'Content-Type': 'application/json'}
    
    if auth_token:
        headers['Authorization'] = f'Bearer {auth_token}'
    
    print(f"\n📤 Sending webhook notification...")
    print(f"   URL: {webhook_url}")
    print(f"   Auth: {'Yes' if auth_token else 'No'}")
    
    try:
        response = requests.post(webhook_url, json=payload, headers=headers, timeout=10)
        print(f"\n✅ Response: {response.status_code}")
        print(f"   Body: {response.text[:200]}")
        return response
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return None


def test_meeting_created_notification():
    """Test meeting created webhook"""
    config = get_config()
    webhook_url = config['webhook_url']
    
    if not webhook_url:
        print("❌ No webhook URL configured")
        return False
    
    payload = {
        "value": [{
            "subscriptionId": "test-subscription-id",
            "changeType": "created",
            "resource": "users/test@example.com/events/AAMkATest123",
            "resourceData": {
                "@odata.type": "#Microsoft.Graph.event",
                "id": "AAMkATest123"
            },
            "clientState": config.get('webhook_secret', 'test-state'),
            "subscriptionExpirationDateTime": "2026-02-15T00:00:00.0000000Z"
        }]
    }
    
    response = send_webhook_notification(webhook_url, payload, config.get('webhook_secret'))
    return response and response.status_code == 200


def test_meeting_updated_notification():
    """Test meeting updated webhook"""
    config = get_config()
    webhook_url = config['webhook_url']
    
    payload = {
        "value": [{
            "subscriptionId": "test-subscription-id",
            "changeType": "updated",
            "resource": "users/test@example.com/events/AAMkATest123",
            "resourceData": {
                "@odata.type": "#Microsoft.Graph.event",
                "id": "AAMkATest123"
            },
            "clientState": config.get('webhook_secret'),
            "subscriptionExpirationDateTime": "2026-02-15T00:00:00.0000000Z"
        }]
    }
    
    response = send_webhook_notification(webhook_url, payload, config.get('webhook_secret'))
    return response and response.status_code == 200


def test_validation_token():
    """Test Graph subscription validation"""
    config = get_config()
    webhook_url = config['webhook_url']
    
    validation_token = "test-validation-token-12345"
    url_with_token = f"{webhook_url}?validationToken={validation_token}"
    
    print(f"\n🔍 Testing validation token...")
    print(f"   URL: {url_with_token}")
    
    try:
        response = requests.get(url_with_token, timeout=10)
        if response.status_code == 200 and response.text == validation_token:
            print(f"\n✅ Validation token returned correctly")
            return True
        else:
            print(f"\n❌ Unexpected response: {response.status_code}")
            print(f"   Expected: {validation_token}")
            print(f"   Got: {response.text}")
            return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False


def main():
    """Interactive webhook testing"""
    print("=" * 60)
    print("Test Webhook Delivery")
    print("=" * 60)
    
    print("\nTEST SCENARIOS")
    print("=\" * 60)\n    print(\"1. Meeting created notification\")\n    print(\"2. Meeting updated notification\")\n    print(\"3. Validation token (subscription setup)\")\n    print(\"4. Run all tests\")\n    print(\"5. Custom payload\")\n    print(\"6. Exit\")\n    \n    choice = input(\"\\nSelect test (1-6): \").strip()\n    \n    if choice == \"1\":\n        test_meeting_created_notification()\n    \n    elif choice == \"2\":\n        test_meeting_updated_notification()\n    \n    elif choice == \"3\":\n        test_validation_token()\n    \n    elif choice == \"4\":\n        print(\"\\n\" + \"=\" * 60)\n        print(\"Running all tests...\")\n        print(\"=\" * 60)\n        \n        tests = [\n            (\"Validation Token\", test_validation_token),\n            (\"Meeting Created\", test_meeting_created_notification),\n            (\"Meeting Updated\", test_meeting_updated_notification)\n        ]\n        \n        results = []\n        for name, test_func in tests:\n            print(f\"\\n--- {name} ---\")\n            result = test_func()\n            results.append((name, result))\n        \n        print(\"\\n\" + \"=\" * 60)\n        print(\"TEST SUMMARY\")\n        print(\"=\" * 60)\n        for name, passed in results:\n            status = \"✅ PASS\" if passed else \"❌ FAIL\"\n            print(f\"{status}: {name}\")\n    \n    elif choice == \"5\":\n        print(\"\\nEnter custom JSON payload:\")\n        payload_str = input()\n        try:\n            payload = json.loads(payload_str)\n            config = get_config()\n            send_webhook_notification(config['webhook_url'], payload, config.get('webhook_secret'))\n        except json.JSONDecodeError:\n            print(\"❌ Invalid JSON\")\n    \n    elif choice == \"6\":\n        print(\"Exiting...\")\n    \n    else:\n        print(\"Invalid choice\")\n    \n    return 0


if __name__ == \"__main__\":\n    sys.exit(main())
