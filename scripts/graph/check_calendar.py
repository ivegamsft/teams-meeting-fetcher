#!/usr/bin/env python3
import sys
sys.path.append('scripts/graph')
import requests
from auth_helper import get_graph_headers
from datetime import datetime, timedelta

user_email = 'boldoriole@ibuyspy.net'
headers = get_graph_headers()

# Get last 3 days + next 3 days
start = (datetime.utcnow() - timedelta(days=3)).strftime("%Y-%m-%dT00:00:00Z")
end = (datetime.utcnow() + timedelta(days=3)).strftime("%Y-%m-%dT23:59:59Z")

url = f"https://graph.microsoft.com/v1.0/users/{user_email}/calendarview"
params = {
    "startDateTime": start,
    "endDateTime": end,
    "$top": 20,
    "$orderby": "start/dateTime desc"
}

resp = requests.get(url, headers=headers, params=params, timeout=15)

print("=" * 70)
print(f"📅 Calendar for {user_email}")
print("=" * 70)

if resp.status_code == 200:
    events = resp.json().get('value', [])
    print(f"\nFound {len(events)} events\n")
    
    for event in events:
        subject = event.get('subject', 'No Subject')
        start_dt = event.get('start', {}).get('dateTime', 'N/A')
        end_dt = event.get('end', {}).get('dateTime', 'N/A')
        is_cancelled = event.get('isCancelled', False)
        has_meeting = event.get('isOnlineMeeting', False)
        
        status = "❌ CANCELLED" if is_cancelled else "✅ Active"
        meeting = "📞 Teams Meeting" if has_meeting else ""
        
        print(f"{status} {meeting}")
        print(f"  Subject: {subject}")
        print(f"  Start: {start_dt}")
        print(f"  End: {end_dt}")
        
        if has_meeting:
            join_url = event.get('onlineMeeting', {}).get('joinUrl', '')
            if join_url:
                print(f"  Join: {join_url[:60]}...")
        
        print()
else:
    print(f"Error: {resp.status_code}")
    print(resp.text[:300])
