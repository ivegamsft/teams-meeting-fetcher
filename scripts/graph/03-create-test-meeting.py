"""
Step 3: Create Test Meeting
Creates a Teams meeting with transcript recording enabled
"""
import sys
import json
import requests
from datetime import datetime, timedelta
from auth_helper import get_graph_headers, get_config


def create_calendar_event_with_teams_meeting(
    user_email,
    subject="Test Teams Meeting",
    start_time=None,
    duration_minutes=60,
    attendees=None,
    enable_transcript=True
):
    """
    Create calendar event with Teams meeting link and transcript enabled
    
    Args:
        user_email: Organizer email
        subject: Meeting subject
        start_time: Start datetime (default: 1 hour from now)
        duration_minutes: Meeting duration
        attendees: List of attendee emails
        enable_transcript: Enable automatic transcription
    """
    if start_time is None:
        start_time = datetime.utcnow() + timedelta(hours=1)
    
    end_time = start_time + timedelta(minutes=duration_minutes)
    
    print(f"\n📅 Creating Teams meeting...")
    print(f"   Organizer: {user_email}")
    print(f"   Subject: {subject}")
    print(f"   Start: {start_time.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"   Duration: {duration_minutes} minutes")
    print(f"   Transcript: {'Enabled' if enable_transcript else 'Disabled'}")
    
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{user_email}/events"
    
    # Build attendees list
    attendee_list = []
    if attendees:
        for email in attendees:
            attendee_list.append({
                "emailAddress": {
                    "address": email,
                    "name": email.split('@')[0]
                },
                "type": "required"
            })
    
    payload = {
        "subject": subject,
        "body": {
            "contentType": "HTML",
            "content": f"This is a test Teams meeting created via Graph API.<br><br>"
                      f"{'<b>Transcription is enabled.</b>' if enable_transcript else ''}"
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
        "attendees": attendee_list,
        "isOnlineMeeting": True,
        "onlineMeetingProvider": "teamsForBusiness"
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 201:
            event = response.json()
            print(f"\n✅ Meeting created successfully!")
            print(f"   Event ID: {event['id']}")
            print(f"   iCalUId: {event['iCalUId']}")
            
            if 'onlineMeeting' in event:
                meeting = event['onlineMeeting']
                print(f"   Join URL: {meeting.get('joinUrl', 'N/A')}")
            
            # Note: Transcript settings require additional OnlineMeeting API calls
            if enable_transcript and 'onlineMeeting' in event:
                online_meeting_id = event['onlineMeeting'].get('id')
                if online_meeting_id:
                    enable_meeting_transcript(online_meeting_id)
            
            return event
        else:
            print(f"\n❌ Failed to create meeting: {response.status_code}")
            print(f"   {response.text}")
            return None
    except Exception as e:
        print(f"\n❌ Error creating meeting: {e}")
        return None


def enable_meeting_transcript(online_meeting_id):
    """
    Enable transcript for an online meeting
    Note: This requires OnlineMeetings.ReadWrite.All permission
    """
    print(f"\n📝 Enabling transcript for meeting...")
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/communications/onlineMeetings/{online_meeting_id}"
    
    payload = {
        "allowTranscription": True,    # Enable transcription
        "recordAutomatically": True    # Auto-record so transcript is generated
    }
    
    try:
        response = requests.patch(url, headers=headers, json=payload, timeout=10)
        
        if response.status_code == 200:
            print("   ✅ Transcript enabled")
            print("   ✅ Auto-record enabled for transcript generation")
            return True
        elif response.status_code == 403:
            print("   ⚠️  Insufficient permissions to enable transcript")
            print("      Requires OnlineMeetings.ReadWrite.All permission")
            return False
        elif response.status_code == 404:
            print("   ⚠️  Online meeting not found - ID may not be accessible via this API")
            return False
        else:
            print(f"   ⚠️  Could not enable transcript: {response.status_code}")
            print(f"      {response.text[:200]}")
            return False
    except Exception as e:
        print(f"   ⚠️  Error enabling transcript: {e}")
        return False


def list_user_events(user_email, days_ahead=7):
    """List upcoming events for a user"""
    print(f"\n📋 Listing events for {user_email}...")
    headers = get_graph_headers()
    
    start_time = datetime.utcnow()
    end_time = start_time + timedelta(days=days_ahead)
    
    url = (
        f"https://graph.microsoft.com/v1.0/users/{user_email}/calendarview"
        f"?startDateTime={start_time.strftime('%Y-%m-%dT%H:%M:%S')}Z"
        f"&endDateTime={end_time.strftime('%Y-%m-%dT%H:%M:%S')}Z"
        f"&$select=subject,start,end,isOnlineMeeting,onlineMeetingUrl"
        f"&$top=10"
    )
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        events = response.json().get('value', [])
        if not events:
            print("   No upcoming events found")
            return []
        
        for event in events:
            print(f"\n   Subject: {event['subject']}")
            print(f"   Start: {event['start']['dateTime']}")
            print(f"   Teams: {'Yes' if event.get('isOnlineMeeting') else 'No'}")
            if event.get('onlineMeetingUrl'):
                print(f"   Join URL: {event['onlineMeetingUrl']}")
        
        return events
    except Exception as e:
        print(f"   ❌ Error listing events: {e}")
        return []


def main():
    """Interactive meeting creation"""
    print("=" * 60)
    print("Create Teams Meeting with Transcript")
    print("=" * 60)
    
    user_email = input("\nEnter organizer email: ").strip()
    if not user_email:
        print("❌ Email required")
        return 1
    
    subject = input("Meeting subject (default: Test Teams Meeting): ").strip()
    if not subject:
        subject = "Test Teams Meeting"
    
    print("\nStart time:")
    print("1. 1 hour from now (default)")
    print("2. Tomorrow at 10:00 AM")
    print("3. Custom")
    choice = input("Select (1-3): ").strip()
    
    if choice == "2":
        start_time = datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=1)
    elif choice == "3":
        date_str = input("Enter start time (YYYY-MM-DD HH:MM): ").strip()
        try:
            start_time = datetime.strptime(date_str, "%Y-%m-%d %H:%M")
        except:
            print("Invalid format, using default")
            start_time = None
    else:
        start_time = None
    
    duration = input("Duration in minutes (default: 60): ").strip()
    duration = int(duration) if duration else 60
    
    attendees_input = input("Attendee emails (comma-separated, or leave empty): ").strip()
    attendees = [email.strip() for email in attendees_input.split(',')] if attendees_input else None
    
    enable_transcript = input("Enable transcript? (y/n, default: y): ").strip().lower() != 'n'
    
    # Create meeting
    event = create_calendar_event_with_teams_meeting(
        user_email=user_email,
        subject=subject,
        start_time=start_time,
        duration_minutes=duration,
        attendees=attendees,
        enable_transcript=enable_transcript
    )
    
    if event:
        print("\n" + "=" * 60)
        print("✅ SUCCESS!")
        print("=" * 60)
        print("\n📝 Next steps:")
        print("1. Join the meeting at the scheduled time")
        print("2. Start recording in Teams")
        print("3. Speak to generate transcript content")
        print("4. End recording")
        print("5. Run script 04-poll-transcription.py to check for transcript")
        
        return 0
    else:
        return 1


if __name__ == "__main__":
    sys.exit(main())
