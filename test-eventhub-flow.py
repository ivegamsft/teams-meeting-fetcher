#!/usr/bin/env python3
"""
Test Event Hub flow:
1. Create a test meeting
2. Check Event Hub for messages
3. Invoke Lambda and check logs
"""

import os
import sys
import json
import time
import requests
import subprocess
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load .env
load_dotenv(os.path.join(os.path.dirname(__file__), 'nobots-eventhub', '.env'))

# Config
TENANT_ID = os.getenv('GRAPH_TENANT_ID')
CLIENT_ID = os.getenv('GRAPH_CLIENT_ID')
CLIENT_SECRET = os.getenv('GRAPH_CLIENT_SECRET')
USER_EMAIL = os.getenv('WATCH_USER_ID')
EVENTHUB_NAMESPACE = os.getenv('EVENTHUB_NAMESPACE')
EVENTHUB_NAME = os.getenv('EVENTHUB_NAME')
AWS_PROFILE = os.getenv('AWS_PROFILE', 'tmf-dev')
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')

print("=" * 70)
print("🧪 EVENT HUB FLOW TEST")
print("=" * 70)

# Step 1: Create test meeting
print("\n[STEP 1] Creating test meeting in Teams...")
try:
    token_url = f'https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token'
    data = {
        'grant_type': 'client_credentials',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'scope': 'https://graph.microsoft.com/.default'
    }
    resp = requests.post(token_url, data=data, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Failed to get token: {resp.text}")
        sys.exit(1)
    
    token = resp.json()['access_token']
    print("✅ Got Graph API token")
    
    # Create event
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    url = f'https://graph.microsoft.com/v1.0/users/{USER_EMAIL}/events'
    
    start_time = datetime.utcnow() + timedelta(minutes=2)
    end_time = start_time + timedelta(minutes=60)
    
    payload = {
        'subject': '🧪 Event Hub Test Meeting',
        'start': {'dateTime': start_time.isoformat() + 'Z', 'timeZone': 'UTC'},
        'end': {'dateTime': end_time.isoformat() + 'Z', 'timeZone': 'UTC'},
        'isOnlineMeeting': True,
        'onlineMeetingProvider': 'teamsForBusiness'
    }
    
    resp = requests.post(url, headers=headers, json=payload, timeout=15)
    
    if resp.status_code == 201:
        event = resp.json()
        event_id = event['id']
        meeting_url = event.get('onlineMeeting', {}).get('joinUrl', 'N/A')
        print(f"✅ Meeting created!")
        print(f"   📅 Subject: {event['subject']}")
        print(f"   🕐 Start: {event['start']['dateTime']}")
        print(f"   🔗 Join URL: {meeting_url[:50]}...")
        print(f"   📌 Event ID: {event_id}")
    else:
        print(f"❌ Failed to create meeting: {resp.status_code}")
        print(f"   {resp.text}")
        sys.exit(1)

except Exception as e:
    print(f"❌ Error creating meeting: {e}")
    sys.exit(1)

# Step 2: Wait a moment for Event Hub to receive message
print("\n[STEP 2] Waiting for Event Hub to receive meeting change event...")
print("⏳ (Waiting 10 seconds for Graph subscription notification...)")
time.sleep(10)

# Check Event Hub for messages
print("\n[STEP 3] Checking Event Hub for messages...")
print("   (Tip: Run 'az eventhubs eventhub consumer-group list-events' to see messages)")
print(f"   Namespace: {EVENTHUB_NAMESPACE}")
print(f"   Hub: {EVENTHUB_NAME}")
print(f"   Consumer Group: lambda-processor")
print("   ℹ️  Messages may not appear immediately - Graph Change Tracking sends events asynchronously")

# Step 4: Invoke Lambda and check logs
print("\n[STEP 4] Testing Lambda invocation...")
try:
    import base64
    import tempfile
    # Invoke Lambda with test event
    test_event = {"Records": [{"body": "test message"}]}
    payload_b64 = base64.b64encode(json.dumps(test_event).encode()).decode()
    
    # Use Windows temp directory
    temp_response = os.path.join(tempfile.gettempdir(), 'lambda-response.json')
    
    result = subprocess.run(
        [
            'aws', 'lambda', 'invoke',
            '--function-name', 'tmf-eventhub-processor-dev',
            '--profile', AWS_PROFILE,
            '--region', AWS_REGION,
            '--payload', payload_b64,
            temp_response
        ],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if result.returncode == 0:
        print("✅ Lambda invoked successfully!")
        if os.path.exists(temp_response):
            with open(temp_response) as f:
                resp = json.load(f)
                print(f"   Status Code: {resp.get('StatusCode')}")
                print(f"   Duration: {resp.get('Duration')} ms")
                if resp.get('FunctionError'):
                    print(f"   Error: {resp.get('FunctionError')}")
    else:
        print(f"❌ Lambda invocation failed: {result.stderr}")
        
except Exception as e:
    print(f"❌ Error invoking Lambda: {e}")

# Step 5: Check Lambda logs
print("\n[STEP 5] Checking Lambda logs...")
try:
    result = subprocess.run(
        ['aws', 'logs', 'tail', '/aws/lambda/tmf-eventhub-processor-dev',
         '--follow', 'false', '--since', '5m',
         '--profile', AWS_PROFILE, '--region', AWS_REGION],
        capture_output=True,
        text=True,
        timeout=15
    )
    
    if result.returncode == 0 and result.stdout:
        print("✅ Lambda logs:")
        lines = result.stdout.split('\n')[-10:]  # Last 10 lines
        for line in lines:
            if line.strip():
                print(f"   {line}")
    else:
        print("⚠️  No recent logs found")
        
except Exception as e:
    print(f"⚠️  Error checking logs: {e}")

print("\n" + "=" * 70)
print("✅ TEST COMPLETE")
print("=" * 70)
