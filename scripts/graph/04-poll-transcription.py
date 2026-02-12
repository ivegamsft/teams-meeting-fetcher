"""
Step 4: Poll for Transcription
Polls for meeting recording transcriptions
"""
import sys
import time
import requests
from datetime import datetime
from auth_helper import get_graph_headers


def get_online_meeting(meeting_id):
    """Get online meeting details"""
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/communications/onlineMeetings/{meeting_id}"
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None


def get_meeting_recordings(user_email, meeting_id):
    """Get recordings for a meeting"""
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{user_email}/onlineMeetings/{meeting_id}/recordings"
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json().get('value', [])
        return []
    except Exception as e:
        print(f"Error: {e}")
        return []


def get_call_transcripts(user_email, meeting_id):
    """Get transcripts for a meeting"""
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{user_email}/onlineMeetings/{meeting_id}/transcripts"
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            return response.json().get('value', [])
        return []
    except Exception as e:
        print(f"Error: {e}")
        return []


def download_transcript_content(user_email, meeting_id, transcript_id):
    """Download transcript content"""
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{user_email}/onlineMeetings/{meeting_id}/transcripts/{transcript_id}/content"
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code == 200:
            return response.text
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None


def poll_for_transcript(user_email, meeting_id, max_attempts=20, delay_seconds=30):
    """Poll for transcript availability"""
    print(f"\n🔄 Polling for transcript...")
    print(f"   Meeting ID: {meeting_id}")
    print(f"   User: {user_email}")
    print(f"   Max attempts: {max_attempts}")
    print(f"   Delay: {delay_seconds}s\n")
    
    for attempt in range(1, max_attempts + 1):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Attempt {attempt}/{max_attempts}...")
        
        transcripts = get_call_transcripts(user_email, meeting_id)
        
        if transcripts:
            print(f"\n✅ Found {len(transcripts)} transcript(s)!\n")
            
            for idx, transcript in enumerate(transcripts, 1):
                print(f"Transcript {idx}:")
                print(f"  ID: {transcript['id']}")
                print(f"  Created: {transcript.get('createdDateTime', 'N/A')}")
                
                # Download content
                print(f"  Downloading...")
                content = download_transcript_content(user_email, meeting_id, transcript['id'])
                if content:
                    filename = f"transcript_{meeting_id}_{idx}.vtt"
                    with open(filename, 'w', encoding='utf-8') as f:
                        f.write(content)
                    print(f"  ✅ Saved to: {filename}\n")
            
            return transcripts
        
        if attempt < max_attempts:
            print(f"   No transcript yet, waiting {delay_seconds}s...\n")
            time.sleep(delay_seconds)
    
    print("\n⚠️  No transcript found after maximum attempts")
    print("\n💡 Tips:")
    print("   - Ensure meeting has been recorded")
    print("   - Transcription can take several minutes after recording ends")
    print("   - Check that transcript was enabled for the meeting")
    return None


def main():
    """Interactive transcript polling"""
    print("=" * 60)
    print("Poll for Meeting Transcription")
    print("=" * 60)
    
    user_email = input("\nEnter organizer email: ").strip()
    meeting_id = input("Enter meeting ID (from online meeting): ").strip()
    
    if not user_email or not meeting_id:
        print("❌ Both email and meeting ID required")
        return 1
    
    max_attempts = input("Max attempts (default: 20): ").strip()
    max_attempts = int(max_attempts) if max_attempts else 20
    
    delay = input("Delay between attempts in seconds (default: 30): ").strip()
    delay = int(delay) if delay else 30
    
    transcripts = poll_for_transcript(user_email, meeting_id, max_attempts, delay)
    
    return 0 if transcripts else 1


if __name__ == "__main__":
    sys.exit(main())
