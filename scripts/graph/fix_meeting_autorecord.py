#!/usr/bin/env python3
import sys, re, urllib.parse
sys.path.append('scripts/graph')
import requests
from auth_helper import get_graph_headers

user_email = 'boldoriole@ibuyspy.net'
event_id = 'AAMkADE2ZWVhN2MyLTk1ODEtNGIzNS1hNTE4LTE5NDIxMmU3MThmYwBGAAAAAADcy-qe0uwnTLsenzfp1HZwBwBVPDqwqy6eTbfdML59OyqKAAAAAAENAABVPDqwqy6eTbfdML59OyqKAAAKnSStAAA='

print("🔧 Fixing meeting auto-record...")
headers = get_graph_headers()
url = f'https://graph.microsoft.com/v1.0/users/{user_email}/events/{event_id}'
resp = requests.get(url, headers=headers, timeout=10)

event = resp.json()
join_url = event.get('onlineMeeting', {}).get('joinUrl', '')
print(f"Event: {event.get('subject')}")

# Extract meeting ID from join URL
decoded = urllib.parse.unquote(join_url)
oid_match = re.search(r'"Oid":"([^"]+)"', decoded)
thread_match = re.search(r'meetup-join/([^/]+)', join_url)

if oid_match and thread_match:
    oid = oid_match.group(1)
    thread_id_enc = thread_match.group(1)
    thread_id = urllib.parse.unquote(thread_id_enc).replace('@thread.v2', '')
    meeting_id = f'MSo{oid}__{thread_id}'
    print(f"Meeting ID: {meeting_id[:50]}...")
    
    # PATCH meeting with auto-record and transcription
    meeting_url = f'https://graph.microsoft.com/v1.0/communications/onlineMeetings/{meeting_id}'
    payload = {
        'recordAutomatically': True,
        'allowTranscription': True
    }
    
    patch_resp = requests.patch(meeting_url, headers=headers, json=payload, timeout=10)
    print(f"\nPATCH Status: {patch_resp.status_code}")
    
    if patch_resp.status_code == 200:
        meeting = patch_resp.json()
        print("✅ Meeting updated successfully!")
        print(f"   recordAutomatically: {meeting.get('recordAutomatically')}")
        print(f"   allowTranscription: {meeting.get('allowTranscription')}")
    else:
        print(f"❌ Error: {patch_resp.status_code}")
        print(patch_resp.text[:300])
else:
    print("❌ Could not extract meeting ID from join URL")
