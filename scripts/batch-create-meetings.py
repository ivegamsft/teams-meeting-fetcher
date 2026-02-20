"""
Batch create test meetings to generate Event Hub messages
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'graph'))

from datetime import datetime, timedelta
import time

# Import the meeting creation function
from auth_helper import get_graph_headers
import requests

def create_test_meeting(meeting_number):
    """Create a single test meeting"""
    user_email = "trustingboar@ibuyspy.net"
    subject = f"Event Hub Test Meeting #{meeting_number}"
    start_time = datetime.utcnow() + timedelta(hours=1, minutes=meeting_number*5)
    end_time = start_time + timedelta(minutes=30)
    
    print(f"\n[{meeting_number}] Creating meeting: {subject}")
    print(f"    Start: {start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{user_email}/events"
    
    payload = {
        "subject": subject,
        "body": {
            "contentType": "HTML",
            "content": f"Event Hub test meeting #{meeting_number}<br><b>Transcription enabled</b>"
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
        "attendees": [],
        "isOnlineMeeting": True,
        "onlineMeetingProvider": "teamsForBusiness"
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 201:
            event = response.json()
            print(f"    ✅ Created: {event['id']}")
            if 'onlineMeetingUrl' in event:
                print(f"    Join URL: {event['onlineMeetingUrl'][:50]}...")
            return event
        else:
            print(f"    ❌ Failed: {response.status_code} - {response.text[:100]}")
            return None
            
    except Exception as e:
        print(f"    ❌ Error: {e}")
        return None


def main():
    """Create 5 test meetings"""
    print("=" * 70)
    print("BATCH MEETING CREATION - Event Hub Testing")
    print("=" * 70)
    print(f"Creating 5 test meetings at {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    
    success_count = 0
    failed_count = 0
    
    for i in range(1, 6):
        result = create_test_meeting(i)
        if result:
            success_count += 1
        else:
            failed_count += 1
        
        # Small delay between requests
        if i < 5:
            time.sleep(2)
    
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"✅ Successful: {success_count}")
    print(f"❌ Failed: {failed_count}")
    print(f"\n📝 Next Steps:")
    print(f"   1. Wait 30-60 seconds for Graph notifications")
    print(f"   2. Lambda will poll Event Hub every 1 minute")
    print(f"   3. Check S3 for payloads: s3://tmf-webhooks-eus-dev/eventhub/")
    print(f"   4. Check DynamoDB checkpoints: eventhub-checkpoints table")
    print("=" * 70)
    
    return 0 if failed_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
