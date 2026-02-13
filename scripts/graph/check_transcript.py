"""Check for meeting recordings and transcripts"""
import sys
import requests
import json
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers

headers = get_graph_headers()
user_email = "boldoriole@ibuyspy.net"
event_id = "AAMkADE2ZWVhN2MyLTk1ODEtNGIzNS1hNTE4LTE5NDIxMmU3MThmYwBGAAAAAADcy-qe0uwnTLsenzfp1HZwBwBVPDqwqy6eTbfdML59OyqKAAAAAAENAABVPDqwqy6eTbfdML59OyqKAAAGmmJTAAA="

# Get event details
print("Fetching meeting details...")
url = f"https://graph.microsoft.com/v1.0/users/{user_email}/events/{event_id}"
resp = requests.get(url, headers=headers, timeout=10)

if resp.status_code == 200:
    event = resp.json()
    print(f"\n✅ Meeting found:")
    print(f"  Subject: {event.get('subject')}")
    print(f"  Start: {event.get('start', {}).get('dateTime')}")
    print(f"  End: {event.get('end', {}).get('dateTime')}")
    
    online_meeting = event.get('onlineMeeting', {})
    conference_id = online_meeting.get('conferenceId')
    print(f"  Conference ID: {conference_id}")
    
    # Extract meeting ID from join URL
    import re
    import urllib.parse
    
    join_url = online_meeting.get('joinUrl', '')
    if join_url:
        decoded_url = urllib.parse.unquote(join_url)
        oid_match = re.search(r'"Oid":"([^"]+)"', decoded_url)
        thread_match = re.search(r'meetup-join/([^/]+)', join_url)
        
        if oid_match and thread_match:
            oid = oid_match.group(1)
            thread_id_encoded = thread_match.group(1)
            thread_id = urllib.parse.unquote(thread_id_encoded)
            thread_base = thread_id.replace('@thread.v2', '')
            meeting_id = f"MSo{oid}__{thread_base}"
            
            print(f"\n📝 Checking for recordings and transcripts...")
            print(f"  Meeting ID: {meeting_id[:60]}...")
            
            # Try to get online meeting details
            meeting_url = f"https://graph.microsoft.com/v1.0/communications/onlineMeetings/{meeting_id}"
            meeting_resp = requests.get(meeting_url, headers=headers, timeout=10)
            
            if meeting_resp.status_code == 200:
                meeting_data = meeting_resp.json()
                print(f"\n✅ Online meeting found!")
                print(f"  allowTranscription: {meeting_data.get('allowTranscription')}")
                print(f"  recordAutomatically: {meeting_data.get('recordAutomatically')}")
                
                # Check for recordings
                recordings_url = f"https://graph.microsoft.com/v1.0/users/{user_email}/onlineMeetings/{meeting_id}/recordings"
                rec_resp = requests.get(recordings_url, headers=headers, timeout=10)
                
                if rec_resp.status_code == 200:
                    recordings = rec_resp.json().get('value', [])
                    print(f"\n📹 Recordings: {len(recordings)}")
                    for rec in recordings:
                        print(f"  - {rec.get('id')}: {rec.get('createdDateTime')}")
                else:
                    print(f"\n⚠️  Could not fetch recordings: {rec_resp.status_code}")
                
                # Check for transcripts
                transcripts_url = f"https://graph.microsoft.com/v1.0/users/{user_email}/onlineMeetings/{meeting_id}/transcripts"
                trans_resp = requests.get(transcripts_url, headers=headers, timeout=10)
                
                if trans_resp.status_code == 200:
                    transcripts = trans_resp.json().get('value', [])
                    print(f"\n📄 Transcripts: {len(transcripts)}")
                    for trans in transcripts:
                        print(f"  - {trans.get('id')}")
                        print(f"    Created: {trans.get('createdDateTime')}")
                        
                        # Download transcript content
                        content_url = f"https://graph.microsoft.com/v1.0/users/{user_email}/onlineMeetings/{meeting_id}/transcripts/{trans['id']}/content"
                        content_resp = requests.get(content_url, headers=headers, timeout=30)
                        
                        if content_resp.status_code == 200:
                            filename = f"transcript_{trans['id'][:20]}.vtt"
                            with open(filename, 'w', encoding='utf-8') as f:
                                f.write(content_resp.text)
                            print(f"    ✅ Downloaded to: {filename}")
                        else:
                            print(f"    ⚠️  Could not download: {content_resp.status_code}")
                else:
                    print(f"\n⚠️  Could not fetch transcripts: {trans_resp.status_code}")
                    print(f"    Response: {trans_resp.text[:200]}")
            else:
                print(f"\n⚠️  Could not access online meeting: {meeting_resp.status_code}")
                print(f"    This is expected for calendar-created meetings")
                print(f"\n💡 Trying alternative approach via user's call records...")
                
                # Try to get call records
                calls_url = f"https://graph.microsoft.com/v1.0/users/{user_email}/onlineMeetings"
                calls_resp = requests.get(calls_url, headers=headers, timeout=10)
                
                if calls_resp.status_code == 200:
                    meetings = calls_resp.json().get('value', [])
                    print(f"  Found {len(meetings)} online meetings")
                elif calls_resp.status_code == 404:
                    print(f"  ⚠️  User online meetings endpoint not accessible")
                else:
                    print(f"  Status: {calls_resp.status_code}")
        else:
            print("\n⚠️  Could not extract meeting ID from join URL")
    else:
        print("\n⚠️  No join URL in event")
else:
    print(f"❌ Failed to get event: {resp.status_code}")
    print(resp.text[:500])
