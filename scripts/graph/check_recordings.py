"""Look for recordings and transcripts in call records"""
import sys
import requests
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers

headers = get_graph_headers()
user_email = "boldoriole@ibuyspy.net"

# The call IDs we found
call_ids = [
    "bdf26850-444e-4975-9730-8aa35fb3f7d7",
    "f6fcabd2-cbdf-4c5b-a7fd-1d45da803c37"
]

for call_id in call_ids:
    print(f"\n{'='*60}")
    print(f"Checking call: {call_id}")
    print('='*60)
    
    # Get full call record details
    call_url = f"https://graph.microsoft.com/v1.0/communications/callRecords/{call_id}"
    call_resp = requests.get(call_url, headers=headers, timeout=10)
    
    if call_resp.status_code == 200:
        call = call_resp.json()
        print(f"Start: {call.get('startDateTime')}")
        print(f"End: {call.get('endDateTime')}")
        
        # The joinWebUrl in call record can help us find the online meeting
        join_url = call.get('joinWebUrl')
        if join_url:
            print(f"Join URL: {join_url[:100]}...")
            
            # Try to find online meeting by join URL
            # Note: This is tricky - we'd need to match it to our calendar events
            
        # Check sessions for recording indicators
        sessions_url = f"https://graph.microsoft.com/v1.0/communications/callRecords/{call_id}/sessions"
        sessions_resp = requests.get(sessions_url, headers=headers, timeout=10)
        
        if sessions_resp.status_code == 200:
            sessions = sessions_resp.json().get('value', [])
            print(f"\nSessions: {len(sessions)}")
            
            for idx, session in enumerate(sessions, 1):
                print(f"\n  Session {idx}:")
                print(f"    ID: {session.get('id')}")
                print(f"    Start: {session.get('startDateTime')}")
                print(f"    End: {session.get('endDateTime')}")
                print(f"    Modalities: {', '.join(session.get('modalities', []))}")
                
                # Check caller/callee
                caller = session.get('caller', {})
                callee = session.get('callee', {})
                
                if caller:
                    user_info = caller.get('identity', {}).get('user', {})
                    print(f"    Caller: {user_info.get('displayName', 'Unknown')}")
                if callee:
                    user_info = callee.get('identity', {}).get('user', {})
                    print(f"    Callee: {user_info.get('displayName', 'Unknown')}")

# Now try a different approach - query user's recent recordings directly
print(f"\n{'='*60}")
print("Trying to find recordings via user meetings...")
print('='*60)

# Check if we can list call recordings
# Note: Recordings are typically associated with online meetings, not call records directly
# We need the online meeting ID which we can't easily get from calendar events

print("\n💡 To access transcripts, we need:")
print("1. Online meeting ID (not directly available from calendar events)")
print("2. Meeting must have been recorded with transcription enabled")
print("3. Transcript processing completed (can take 5-10 minutes)")

print("\n⚠️  Current limitation:")
print("CallRecords gives us call metadata but doesn't directly expose recordings/transcripts")
print("Recordings are accessed via: /users/{user}/onlineMeetings/{meetingId}/recordings")
print("Transcripts via: /users/{user}/onlineMeetings/{meetingId}/transcripts")
print("But we can't get the meetingId from calendar-created meetings")
