"""Test creating meeting with transcription enabled"""
import sys
import requests
from datetime import datetime, timedelta
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers

headers = get_graph_headers()
user_email = "boldoriole@ibuyspy.net"

start_time = datetime.now().replace(microsecond=0) + timedelta(hours=2)
end_time = start_time + timedelta(hours=1)

# Create calendar event with Teams meeting
event_payload = {
    "subject": "Test Meeting with Auto Transcription",
    "body": {
        "contentType": "HTML",
        "content": "This meeting has transcription enabled automatically via Graph API."
    },
    "start": {
        "dateTime": start_time.strftime("%Y-%m-%dT%H:%M:%S"),
        "timeZone": "UTC"
    },
    "end": {
        "dateTime": end_time.strftime("%Y-%m-%dT%H:%M:%S"),
        "timeZone": "UTC"
    },
    "location": {
        "displayName": "Microsoft Teams Meeting"
    },
    "isOnlineMeeting": True,
    "onlineMeetingProvider": "teamsForBusiness"
}

print("Creating Teams meeting...")
create_url = f"https://graph.microsoft.com/v1.0/users/{user_email}/events"
create_resp = requests.post(create_url, headers=headers, json=event_payload, timeout=30)

print(f"Create Status: {create_resp.status_code}")

if create_resp.status_code == 201:
    event = create_resp.json()
    print("✅ Meeting created!")
    print(f"  Event ID: {event['id']}")
    print(f"  Subject: {event['subject']}")
    
    if 'onlineMeeting' in event:
        online_meeting = event['onlineMeeting']
        print(f"  Join URL: {online_meeting.get('joinUrl', 'N/A')[:80]}...")
        
        # Extract online meeting ID to enable transcription
        import re
        import urllib.parse
        
        join_url = online_meeting.get('joinUrl', '')
        decoded_url = urllib.parse.unquote(join_url)
        
        # Extract OID and thread ID
        oid_match = re.search(r'"Oid":"([^"]+)"', decoded_url)
        thread_match = re.search(r'meetup-join/([^/]+)', join_url)
        
        if oid_match and thread_match:
            oid = oid_match.group(1)
            thread_id_encoded = thread_match.group(1)
            thread_id = urllib.parse.unquote(thread_id_encoded)
            thread_base = thread_id.replace('@thread.v2', '')
            meeting_id = f"MSo{oid}__{thread_base}"
            
            print(f"\n📝 Enabling transcription...")
            meeting_url = f"https://graph.microsoft.com/v1.0/communications/onlineMeetings/{meeting_id}"
            patch_payload = {
                "allowTranscription": True,
                "recordAutomatically": False
            }
            
            patch_resp = requests.patch(meeting_url, headers=headers, json=patch_payload, timeout=10)
            print(f"Patch Status: {patch_resp.status_code}")
            
            if patch_resp.status_code == 200:
                meeting_data = patch_resp.json()
                print("✅ Transcription enabled!")
                print(f"  allowTranscription: {meeting_data.get('allowTranscription')}")
                print(f"  recordAutomatically: {meeting_data.get('recordAutomatically')}")
            else:
                print(f"❌ Failed to enable transcription: {patch_resp.text[:500]}")
        else:
            print("⚠️  Could not extract meeting ID from join URL")
    else:
        print("⚠️  No online meeting data in event")
else:
    print(f"❌ Failed to create meeting: {create_resp.text[:500]}")
