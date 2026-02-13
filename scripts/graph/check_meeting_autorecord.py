#!/usr/bin/env python3
import sys
sys.path.append('scripts/graph')
import requests
from auth_helper import get_graph_headers

user_email = 'boldoriole@ibuyspy.net'
event_id = 'AAMkADE2ZWVhN2MyLTk1ODEtNGIzNS1hNTE4LTE5NDIxMmU3MThmYwBGAAAAAADcy-qe0uwnTLsenzfp1HZwBwBVPDqwqy6eTbfdML59OyqKAAAAAAENAABVPDqwqy6eTbfdML59OyqKAAAKnSStAAA='

headers = get_graph_headers()
url = f'https://graph.microsoft.com/v1.0/users/{user_email}/events/{event_id}'
resp = requests.get(url, headers=headers, timeout=10)

print(f"📋 Checking meeting configuration...")
print(f"Event Status: {resp.status_code}")

if resp.status_code == 200:
    event = resp.json()
    subject = event.get('subject')
    print(f"Event: {subject}")
    
    online_meeting = event.get('onlineMeeting', {})
    if online_meeting:
        meeting_id = online_meeting.get('id')
        print(f"Meeting ID: {meeting_id}")
        
        # Get meeting details
        meeting_url = f'https://graph.microsoft.com/v1.0/communications/onlineMeetings/{meeting_id}'
        meeting_resp = requests.get(meeting_url, headers=headers, timeout=10)
        print(f"\nMeeting Status: {meeting_resp.status_code}")
        
        if meeting_resp.status_code == 200:
            meeting = meeting_resp.json()
            print(f"recordAutomatically: {meeting.get('recordAutomatically')}")
            print(f"allowTranscription: {meeting.get('allowTranscription')}")
            print(f"\n✅ Meeting is configured with auto-record setting!")
        else:
            print(f"❌ Error getting meeting details: {meeting_resp.status_code}")
            print(meeting_resp.text[:200])
    else:
        print("❌ No online meeting found in event")
else:
    print(f"❌ Event not found: {resp.status_code}")
