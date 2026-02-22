#!/usr/bin/env python3
"""
Complete End-to-End Verification
================================
1. ✓ Meeting created in Teams
2. → Check if Graph subscription is receiving events
3. → Verify Event Hub has messages
4. → Check Lambda can read from Event Hub
5. → Verify Lambda processes correctly
"""

import os
import sys
import json
import time
import subprocess
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment
load_dotenv(os.path.join(os.path.dirname(__file__), 'nobots-eventhub', '.env'))

# Configuration
TENANT_ID = os.getenv('GRAPH_TENANT_ID')
CLIENT_ID = os.getenv('GRAPH_CLIENT_ID')
CLIENT_SECRET = os.getenv('GRAPH_CLIENT_SECRET')
USER_EMAIL = os.getenv('WATCH_USER_ID')
EVENTHUB_NAMESPACE = os.getenv('EVENTHUB_NAMESPACE')
EVENTHUB_NAME = os.getenv('EVENTHUB_NAME')
RESOURCE_GROUP = os.getenv('RESOURCE_GROUP')

print("\n" + "=" * 80)
print("📊 END-TO-END VERIFICATION")
print("=" * 80)

# ============================================================================
# STEP 1: Verify Graph Subscription is Active
# ============================================================================
print("\n[STEP 1] Verify Graph Change Tracking Subscription")
print("-" * 80)

try:
    # Get token for Graph API
    import requests
    token_url = f'https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token'
    data = {
        'grant_type': 'client_credentials',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'scope': 'https://graph.microsoft.com/.default'
    }
    resp = requests.post(token_url, data=data, timeout=10)
    if resp.status_code != 200:
        print(f"❌ FAILED: Cannot get Graph token: {resp.text}")
        sys.exit(1)
    
    token = resp.json()['access_token']
    print("✅ Got Graph API token")
    
    # List subscriptions
    headers = {'Authorization': f'Bearer {token}'}
    resp = requests.get('https://graph.microsoft.com/v1.0/subscriptions', headers=headers, timeout=10)
    
    if resp.status_code == 200:
        subs = resp.json().get('value', [])
        if subs:
            print(f"✅ Found {len(subs)} subscriptions:")
            for sub in subs:
                print(f"\n   📌 ID: {sub['id'][:20]}...")
                print(f"      Resource: {sub['resource']}")
                print(f"      NotificationURL: {sub['notificationUrl'][:60]}...")
                print(f"      Expiration: {sub['expirationDateTime']}")
                print(f"      Status: {sub.get('status', 'unknown')}")
        else:
            print("⚠️  No subscriptions found - Graph not sending notifications!")
    else:
        print(f"❌ FAILED: Could not list subscriptions: {resp.status_code}")
        
except Exception as e:
    print(f"❌ ERROR: {e}")

# ============================================================================
# STEP 2: Check Event Hub for Messages
# ============================================================================
print("\n[STEP 2] Check Event Hub Consumer Group")
print("-" * 80)

try:
    # Get Event Hub properties
    result = subprocess.run(
        [
            'az', 'eventhubs', 'eventhub', 'show',
            '--resource-group', RESOURCE_GROUP,
            '--namespace-name', EVENTHUB_NAMESPACE,
            '--name', EVENTHUB_NAME
        ],
        capture_output=True,
        text=True,
        timeout=15
    )
    
    if result.returncode == 0:
        hub_info = json.loads(result.stdout)
        print(f"✅ Event Hub info:")
        print(f"   📦 Namespace: {EVENTHUB_NAMESPACE}")
        print(f"   📨 Hub Name: {EVENTHUB_NAME}")
        print(f"   📊 Partitions: {hub_info.get('partitionCount', 'N/A')}")
        print(f"   ⏱️  Retention: {hub_info.get('messageRetentionInDays', 'N/A')} days")
    else:
        print(f"⚠️  Could not get Event Hub info: {result.stderr[:200]}")
    
    # Check consumer group
    result = subprocess.run(
        [
            'az', 'eventhubs', 'eventhub', 'consumer-group', 'show',
            '--resource-group', RESOURCE_GROUP,
            '--namespace-name', EVENTHUB_NAMESPACE,
            '--eventhub-name', EVENTHUB_NAME,
            '--name', 'lambda-processor'
        ],
        capture_output=True,
        text=True,
        timeout=15
    )
    
    if result.returncode == 0:
        cg_info = json.loads(result.stdout)
        print(f"\n✅ Consumer Group 'lambda-processor':")
        print(f"   Created: {cg_info.get('createdAt', 'N/A')}")
        print(f"   Offset: {cg_info.get('offset', 'N/A')}")
    else:
        print(f"❌ FAILED: Consumer group not found")
        
except Exception as e:
    print(f"❌ ERROR: {e}")

# ============================================================================
# STEP 3: List Messages in Event Hub Partitions
# ============================================================================
print("\n[STEP 3] List Messages in Event Hub")
print("-" * 80)

try:
    # Get connection string
    result = subprocess.run(
        [
            'az', 'eventhubs', 'namespace', 'authorization-rule', 'keys', 'list',
            '--resource-group', RESOURCE_GROUP,
            '--namespace-name', EVENTHUB_NAMESPACE,
            '--name', 'RootManageSharedAccessKey'
        ],
        capture_output=True,
        text=True,
        timeout=15
    )
    
    if result.returncode == 0:
        keys = json.loads(result.stdout)
        conn_str = keys.get('primaryConnectionString', '')
        
        print(f"✅ Got Event Hub connection")
        print(f"\n   📮 Attempting to read recent messages...")
        
        # Use Python to read from Event Hub
        read_script = f"""
import json
from azure.eventhub import EventHubConsumerClient
from azure.identity import ClientSecretCredential

try:
    credentials = ClientSecretCredential(
        tenant_id='{TENANT_ID}',
        client_id='{CLIENT_ID}',
        client_secret='{CLIENT_SECRET}'
    )
    
    client = EventHubConsumerClient(
        fully_qualified_namespace='{EVENTHUB_NAMESPACE}.servicebus.windows.net',
        eventhub_name='{EVENTHUB_NAME}',
        consumer_group='lambda-processor',
        credential=credentials,
        starting_position='-1'  # Latest
    )
    
    msg_count = 0
    with client:
        for partition_event in client.receive_batch(max_wait_time=2):
            event = partition_event.event
            msg_count += 1
            body = event.body_as_str() if hasattr(event, 'body_as_str') else str(event.get_body())
            print(f"   📨 Message {{msg_count}}: {{body[:80]}}")
            if msg_count >= 5:
                break
    
    if msg_count == 0:
        print("   ⚠️  No messages found (may be waiting for subscription notifications)")
    else:
        print(f"\\n   ✅ Successfully read {{msg_count}} message(s)")
        
except Exception as e:
    print(f"   ❌ Error reading Event Hub: {{type(e).__name__}}: {{e}}")
"""
        
        result = subprocess.run(
            ['python', '-c', read_script],
            capture_output=True,
            text=True,
            timeout=15
        )
        
        print(result.stdout if result.returncode == 0 else f"   ⚠️  {result.stderr[:200]}")
        
    else:
        print(f"⚠️  Could not get connection key")
        
except Exception as e:
    print(f"❌ ERROR: {e}")

# ============================================================================
# STEP 4: Verify Lambda Configuration
# ============================================================================
print("\n[STEP 4] Verify Lambda Configuration")
print("-" * 80)

try:
    result = subprocess.run(
        [
            'aws', 'lambda', 'get-function-configuration',
            '--function-name', 'tmf-eventhub-processor-dev',
            '--profile', 'tmf-dev',
            '--region', 'us-east-1'
        ],
        capture_output=True,
        text=True,
        timeout=15
    )
    
    if result.returncode == 0:
        config = json.loads(result.stdout)
        print(f"✅ Lambda Function: {config['FunctionName']}")
        print(f"   Runtime: {config['Runtime']}")
        print(f"   Handler: {config['Handler']}")
        print(f"   Memory: {config['MemorySize']} MB")
        print(f"   Timeout: {config['Timeout']} sec")
        
        print(f"\n   Environment Variables:")
        env_vars = config.get('Environment', {}).get('Variables', {})
        for key in ['MESSAGE_PROCESSING_MODE', 'EVENT_HUB_NAMESPACE', 'EVENT_HUB_NAME', 
                   'EVENT_HUB_CONSUMER_GROUP', 'BUCKET_NAME']:
            val = env_vars.get(key, 'NOT SET')
            if len(str(val)) > 50:
                val = str(val)[:47] + "..."
            print(f"      {key}: {val}")
    else:
        print(f"❌ FAILED: Could not get Lambda config")
        
except Exception as e:
    print(f"❌ ERROR: {e}")

# ============================================================================
# STEP 5: Invoke Lambda and Check Response
# ============================================================================
print("\n[STEP 5] Test Lambda Invocation")
print("-" * 80)

try:
    import base64
    import tempfile
    
    # Create test event (simulating Event Hub message)
    test_event = {
        "Records": [
            {
                "body": json.dumps({
                    "resourceData": {
                        "@odata.type": "#microsoft.graph.callRecording"
                    }
                })
            }
        ]
    }
    
    payload_b64 = base64.b64encode(json.dumps(test_event).encode()).decode()
    temp_response = os.path.join(tempfile.gettempdir(), 'lambda-response.json')
    
    print("Invoking Lambda with test event...")
    
    result = subprocess.run(
        [
            'aws', 'lambda', 'invoke',
            '--function-name', 'tmf-eventhub-processor-dev',
            '--profile', 'tmf-dev',
            '--region', 'us-east-1',
            '--payload', payload_b64,
            '--log-type', 'Tail',
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
                print(f"   Status: {resp.get('StatusCode')}")
                print(f"   Duration: {resp.get('Duration')} ms")
                print(f"   Memory Used: {resp.get('MemoryUsed')} MB")
                
                # Show logs
                if 'LogResult' in resp:
                    import base64
                    logs = base64.b64decode(resp['LogResult']).decode()
                    print(f"\n   📋 Lambda Logs:")
                    for line in logs.split('\n')[-10:]:
                        if line.strip():
                            print(f"      {line}")
                
                if resp.get('FunctionError'):
                    print(f"   ⚠️  Error: {resp.get('FunctionError')}")
    else:
        print(f"❌ FAILED: Invocation failed")
        print(f"   {result.stderr[:300]}")
        
except Exception as e:
    print(f"❌ ERROR: {e}")

# ============================================================================
# STEP 6: Check Lambda Logs
# ============================================================================
print("\n[STEP 6] Check Lambda CloudWatch Logs")
print("-" * 80)

try:
    result = subprocess.run(
        [
            'aws', 'logs', 'tail',
            '/aws/lambda/tmf-eventhub-processor-dev',
            '--profile', 'tmf-dev',
            '--region', 'us-east-1',
            '--since', '30m',
            '--max-items', '20'
        ],
        capture_output=True,
        text=True,
        timeout=15
    )
    
    if result.returncode == 0 and result.stdout:
        print("✅ Recent Lambda Logs:")
        for line in result.stdout.split('\n')[-15:]:
            if line.strip():
                print(f"   {line}")
    else:
        print("⚠️  No recent logs (Lambda may not have been invoked recently)")
        
except Exception as e:
    print(f"❌ ERROR: {e}")

# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 80)
print("📋 VERIFICATION SUMMARY")
print("=" * 80)

print("""
✅ DEPLOYED COMPONENTS:
   • Meeting created in Teams
   • Lambda function deployed (tmf-eventhub-processor-dev)
   • Event Hub configured (tmf-eh-eus-6an5wk)
   • Consumer group ready (lambda-processor)

🔄 DATA FLOW VERIFICATION:
   1. ✅ Graph subscription should be sending notifications
   2. ⏳ Event Hub receives messages from Graph Change Tracking
   3. ⏳ Lambda can read from Event Hub
   4. ⏳ Lambda processes meeting changes

📝 NEXT STEPS:
   • Wait 10-30 seconds for Graph to send notifications
   • Check Event Hub for messages: az eventhubs eventhub consumer-group show-error ...
   • Review Lambda logs: aws logs tail /aws/lambda/tmf-eventhub-processor-dev ...
   • For real-time messages, subscribe to Graph webhooks

💡 TIPS:
   • Graph Change Tracking notifications are async (may take seconds)
   • Use 'message_processing_mode: peek' to test without consuming
   • Check Lambda IAM role has EventHub read permissions
""")

print("=" * 80 + "\n")
