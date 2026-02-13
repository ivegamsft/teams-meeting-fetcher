#!/usr/bin/env python3
"""
Create a Teams meeting automatically for testing.
"""
import sys
import os
sys.path.append("scripts/graph")
from auth_helper import get_graph_headers
import requests
from datetime import datetime, timedelta
import json

def create_meeting():
    """Create a Teams meeting with transcription enabled."""
    
    user_email = "boldoriole@ibuyspy.net"
    
    # Meeting starts in 5 minutes
    start_time = datetime.utcnow() + timedelta(minutes=5)
    end_time = start_time + timedelta(hours=1)
    
    headers = get_graph_headers()
    
    event_data = {
        "subject": f"Test Meeting - {datetime.utcnow().strftime('%H:%M:%S')}",
        "start": {
            "dateTime": start_time.isoformat(),
            "timeZone": "UTC"
        },
        "end": {
            "dateTime": end_time.isoformat(),
            "timeZone": "UTC"
        },
        "isOnlineMeeting": True,
        "onlineMeetingProvider": "teamsForBusiness"
    }
    
    print(f"📅 Creating Teams meeting for {user_email}...")
    print(f"   Subject: {event_data['subject']}")
    print(f"   Start: {start_time.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    
    response = requests.post(
        f"https://graph.microsoft.com/v1.0/users/{user_email}/calendar/events",
        headers=headers,
        json=event_data,
        timeout=30
    )
    
    if response.status_code == 201:
        event = response.json()
        join_url = event.get('onlineMeeting', {}).get('joinUrl', 'N/A')
        
        print(f"\n✅ Meeting created successfully!")
        print(f"   Event ID: {event['id']}")
        print(f"   Join URL: {join_url[:80]}...")
        print(f"\n🎯 Next steps:")
        print(f"   1. Join the meeting: {join_url}")
        print(f"   2. Start recording (Teams → More → Record)")
        print(f"   3. Talk for 30+ seconds")
        print(f"   4. Stop recording")
        print(f"   5. End meeting")
        print(f"   6. Wait 5-30 minutes for transcript")
        print(f"\n📊 Monitor webhook logs in the background terminal")
        
        return event
    else:
        print(f"\n❌ Failed to create meeting!")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text[:500]}")
        return None

if __name__ == "__main__":
    create_meeting()
