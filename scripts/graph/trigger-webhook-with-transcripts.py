#!/usr/bin/env python3
"""
Webhook Trigger with Real Transcript Data
Sends a webhook notification using actual transcript IDs from your meeting history
"""
import requests
import sys
import json
from datetime import datetime
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers, get_config

print("=" * 80)
print("🔔 WEBHOOK TRIGGER WITH REAL TRANSCRIPT DATA")
print("=" * 80)

headers = get_graph_headers()
config = get_config()
webhook_url = config['webhook_url']
webhook_secret = config.get('webhook_secret', '')

# First, get the actual transcript IDs from the user's recent meetings
print("\n📋 Fetching recent transcripts from Graph API...")

user_id = "e5fe8748-76f0-42ed-b521-241e8252baba"
user_email = "boldoriole@ibuyspy.net"

transcript_url = f"https://graph.microsoft.com/v1.0/users/{user_id}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{user_id}')"

try:
    resp = requests.get(transcript_url, headers=headers, timeout=10)
    if resp.status_code == 200:
        transcripts = resp.json().get('value', [])
        
        if not transcripts:
            print("⚠️  No transcripts found. Run:")
            print("   python scripts/graph/03-create-test-meeting.py")
            print("   (Then record a meeting in Teams)")
            sys.exit(1)
        
        print(f"✅ Found {len(transcripts)} transcript(s)")
        
        # Use the most recent transcript
        latest = transcripts[0]
        transcript_id = latest.get('id', '')
        
        print(f"\n📝 Using latest transcript:")
        print(f"   ID: {transcript_id[:50]}...")
        print(f"   Created: {latest.get('createdDateTime', 'N/A')}")
        
        # Build webhook payload using real transcript ID
        notification_payload = {
            "value": [
                {
                    "subscriptionId": "15e81c83-f8e8-4f0c-8108-2c3a65451c91",
                    "changeType": "created",
                    "clientState": webhook_secret,
                    "resource": f"users/{user_email}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{user_id}')/{transcript_id}",
                    "resourceData": {
                        "@odata.type": "#Microsoft.Graph.onlineMeetingTranscript",
                        "@odata.id": f"users/{user_email}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{user_id}')/{transcript_id}",
                        "id": transcript_id
                    },
                    "tenantId": user_id,
                    "sequenceNumber": 1,
                    "lifecycleEvent": "created"
                }
            ]
        }
        
        print(f"\n📨 Sending webhook notification to Lambda...")
        print(f"   URL: {webhook_url}")
        print(f"   Payload size: {len(json.dumps(notification_payload))} bytes")
        
        headers_with_auth = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {webhook_secret}'
        }
        
        response = requests.post(
            webhook_url,
            json=notification_payload,
            headers=headers_with_auth,
            timeout=10
        )
        
        print(f"\n✅ Response Status: {response.status_code}")
        
        if response.status_code in [200, 202]:
            print("✅ SUCCESS! Webhook accepted by Lambda")
            print("\n🔍 Next steps:")
            print("   1. Wait 2-5 seconds for Lambda to process")
            print("   2. Check S3 for new webhook payload:")
            print("      aws s3 ls s3://tmf-webhook-payloads-dev/webhooks/ --profile tmf-dev --recursive | tail -3")
            print("   3. Then process the transcript:")
            print("      python process_transcript_notification.py")
        else:
            print(f"❌ Request failed: {response.text[:200]}")
            
    else:
        print(f"❌ Error fetching transcripts: {resp.status_code}")
        print(f"   {resp.text[:200]}")
        
except Exception as e:
    print(f"❌ Error: {e}")

print("\n" + "=" * 80)
