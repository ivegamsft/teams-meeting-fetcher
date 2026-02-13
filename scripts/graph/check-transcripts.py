#!/usr/bin/env python3
import requests
import sys
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers

print("=" * 80)
print("📋 TRANSCRIPT AND RECORDING CHECK")
print("=" * 80)

headers = get_graph_headers()
user_email = "boldoriole@ibuyspy.net"

# Get user info first
print(f"\n1️⃣  Getting user information...")
user_url = f"https://graph.microsoft.com/v1.0/users/{user_email}"
resp = requests.get(user_url, headers=headers, timeout=10)

if resp.status_code == 200:
    user = resp.json()
    user_id = user.get('id', 'N/A')
    print(f"   ✅ User ID: {user_id}")
else:
    print(f"   ❌ Error: {resp.status_code}")
    user_id = None

# Check for online meeting recordings
if user_id:
    print(f"\n2️⃣  Checking for online meeting transcripts...")
    transcripts_url = f"https://graph.microsoft.com/v1.0/users/{user_id}/onlineMeetingTranscripts"
    resp = requests.get(transcripts_url, headers=headers, timeout=10)
    
    if resp.status_code == 200:
        transcripts = resp.json().get('value', [])
        print(f"   ✅ Found {len(transcripts)} transcript(s)")
        
        for i, transcript in enumerate(transcripts, 1):
            print(f"\n   Transcript {i}:")
            print(f"      ID: {transcript.get('id', 'N/A')}")
            print(f"      Meeting ID: {transcript.get('meetingId', 'N/A')}")
            print(f"      Created: {transcript.get('createdDateTime', 'N/A')}")
            print(f"      Content URL: {transcript.get('contentUrl', 'N/A')[:80] if transcript.get('contentUrl') else 'N/A'}...")
    elif resp.status_code == 404:
        print(f"   ⚠️  No transcripts found or endpoint not available (404)")
    else:
        print(f"   ❌ Error: {resp.status_code}")
        print(f"   Response: {resp.text[:300]}")

# Try alternate approach: get all transcripts for the organizer
if user_id:
    print(f"\n3️⃣  Checking getAllTranscripts with organizer ID...")
    transcripts_url = f"https://graph.microsoft.com/v1.0/users/{user_id}/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{user_id}')"
    resp = requests.get(transcripts_url, headers=headers, timeout=10)
    
    if resp.status_code == 200:
        transcripts = resp.json().get('value', [])
        print(f"   ✅ Found {len(transcripts)} transcript(s)")
        
        for i, transcript in enumerate(transcripts[:5], 1):  # Limit to 5
            print(f"\n   Transcript {i}:")
            print(f"      ID: {transcript.get('id', 'N/A')}")
            print(f"      Meeting ID: {transcript.get('meetingId', 'N/A')}")
            print(f"      Created: {transcript.get('createdDateTime', 'N/A')}")
    else:
        print(f"   ⚠️  {resp.status_code}: {resp.json().get('error', {}).get('message', 'Unknown error')}")

print("\n" + "=" * 80)
