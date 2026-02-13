"""Search for call records and transcripts using CallRecords.Read.All"""
import sys
import requests
from datetime import datetime, timedelta
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers

headers = get_graph_headers()

print("🔍 Accessing call records...")

# Get call records from the last 7 days
url = "https://graph.microsoft.com/v1.0/communications/callRecords"
resp = requests.get(url, headers=headers, timeout=30)

print(f"Status: {resp.status_code}")

if resp.status_code == 200:
    call_records = resp.json().get('value', [])
    print(f"\n✅ Found {len(call_records)} call record(s)\n")
    
    for idx, call in enumerate(call_records, 1):
        print(f"Call {idx}:")
        print(f"  ID: {call.get('id')}")
        print(f"  Start: {call.get('startDateTime')}")
        print(f"  End: {call.get('endDateTime')}")
        print(f"  Type: {call.get('type')}")
        print(f"  Modalities: {', '.join(call.get('modalities', []))}")
        
        # Get organizer info
        organizer = call.get('organizer', {})
        if organizer:
            user_info = organizer.get('user', {})
            print(f"  Organizer: {user_info.get('displayName', 'N/A')}")
        
        # Check for recordings/transcripts
        call_id = call.get('id')
        if call_id:
            # Try to get sessions (which contain recordings/transcripts info)
            sessions_url = f"https://graph.microsoft.com/v1.0/communications/callRecords/{call_id}/sessions"
            sessions_resp = requests.get(sessions_url, headers=headers, timeout=10)
            
            if sessions_resp.status_code == 200:
                sessions = sessions_resp.json().get('value', [])
                print(f"  Sessions: {len(sessions)}")
                
                for session in sessions:
                    modalities = session.get('modalities', [])
                    if 'data' in modalities:
                        print(f"    - Session includes data modality (may have recordings)")
            
        print()
    
    # Try to list recordings for the user
    print("\n📹 Checking for user recordings...")
    user_email = "boldoriole@ibuyspy.net"
    
    # Note: Recordings are typically accessed via OnlineMeetings, not CallRecords directly
    # But we can try to find the online meeting IDs from call records
    
elif resp.status_code == 403:
    print("❌ Access denied - admin consent may not be granted yet")
    print("   Ensure CallRecords.Read.All has admin consent")
elif resp.status_code == 404:
    print("⚠️  Endpoint not found - CallRecords may require beta API")
    print("\n💡 Trying beta endpoint...")
    
    beta_url = "https://graph.microsoft.com/beta/communications/callRecords"
    beta_resp = requests.get(beta_url, headers=headers, timeout=30)
    
    print(f"Beta Status: {beta_resp.status_code}")
    
    if beta_resp.status_code == 200:
        call_records = beta_resp.json().get('value', [])
        print(f"✅ Found {len(call_records)} call record(s) via beta API")
        
        for idx, call in enumerate(call_records[:5], 1):  # Show first 5
            print(f"\nCall {idx}:")
            print(f"  ID: {call.get('id')}")
            print(f"  Start: {call.get('startDateTime')}")
            print(f"  Type: {call.get('type')}")
    else:
        print(f"Beta endpoint also failed: {beta_resp.text[:500]}")
else:
    print(f"Error: {resp.text[:500]}")
