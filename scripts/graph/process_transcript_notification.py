#!/usr/bin/env python3
"""
Process webhook notification and fetch transcript.

This script simulates processing a webhook notification by extracting
transcript details and fetching the content.

Usage:
    # From S3 notification file
    python process_transcript_notification.py path/to/notification.json
    
    # From notification JSON string
    python process_transcript_notification.py --json '{"subscriptionId": "...", ...}'
"""

import sys
import json
import argparse
import os
from pathlib import Path

# Add scripts/graph to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts', 'graph'))

from auth_helper import get_graph_headers
import requests


def parse_notification(notification: dict) -> dict:
    """Extract key information from webhook notification."""
    
    print("📬 Parsing webhook notification...")
    
    # Handle both single notification and value array formats
    if 'value' in notification:
        notifications = notification['value']
    else:
        notifications = [notification]
    
    results = []
    
    for notif in notifications:
        resource = notif.get('resource', '')
        resource_data = notif.get('resourceData', {})
        subscription_id = notif.get('subscriptionId', '')
        
        print(f"\n  Subscription ID: {subscription_id}")
        print(f"  Resource: {resource}")
        
        # Parse resource path - examples:
        # users/{user_id}/onlineMeetings/{meeting_id}/transcripts/{transcript_id}
        # users/{user_id}/adhocCalls/{call_id}/transcripts/{transcript_id}
        
        parts = resource.split('/')
        
        if 'users' in parts and 'transcripts' in parts:
            user_idx = parts.index('users')
            transcript_idx = parts.index('transcripts')
            
            user_id = parts[user_idx + 1] if user_idx + 1 < len(parts) else None
            transcript_id = parts[transcript_idx + 1] if transcript_idx + 1 < len(parts) else None
            
            # Extract meeting ID (either onlineMeetings or adhocCalls)
            meeting_id = None
            if 'onlineMeetings' in parts:
                meeting_idx = parts.index('onlineMeetings')
                meeting_id = parts[meeting_idx + 1] if meeting_idx + 1 < len(parts) else None
            elif 'adhocCalls' in parts:
                call_idx = parts.index('adhocCalls')
                meeting_id = parts[call_idx + 1] if call_idx + 1 < len(parts) else None
            
            result = {
                'user_id': user_id,
                'meeting_id': meeting_id,
                'transcript_id': transcript_id,
                'resource_type': 'onlineMeetings' if 'onlineMeetings' in parts else 'adhocCalls',
                'subscription_id': subscription_id,
                'resource': resource,
                'resource_data': resource_data
            }
            
            print(f"  ✅ Parsed:")
            print(f"     User: {user_id}")
            print(f"     Meeting ID: {meeting_id}")
            print(f"     Transcript ID: {transcript_id}")
            
            results.append(result)
        else:
            print(f"  ⚠️  Unrecognized resource format: {resource}")
    
    return results


def fetch_transcript(parsed: dict, output_dir: str = None) -> str:
    """Fetch transcript content using parsed notification data."""
    
    print(f"\n📄 Fetching transcript content...")
    
    headers = get_graph_headers()
    
    # Construct URL based on resource type
    if parsed['resource_type'] == 'onlineMeetings':
        url = f"https://graph.microsoft.com/v1.0/users/{parsed['user_id']}/onlineMeetings/{parsed['meeting_id']}/transcripts/{parsed['transcript_id']}/content"
    else:  # adhocCalls
        url = f"https://graph.microsoft.com/v1.0/users/{parsed['user_id']}/adhocCalls/{parsed['meeting_id']}/transcripts/{parsed['transcript_id']}/content"
    
    print(f"   URL: {url}")
    
    response = requests.get(url, headers=headers, timeout=60)
    
    print(f"   Status: {response.status_code}")
    
    if response.status_code == 200:
        content = response.text
        print(f"   ✅ Content retrieved ({len(content)} characters)")
        
        # Save to file if output_dir specified
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            filename = f"{parsed['transcript_id']}.vtt"
            filepath = os.path.join(output_dir, filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            
            print(f"   💾 Saved to: {filepath}")
        
        return content
    else:
        print(f"   ❌ Failed to fetch content")
        print(f"   Response: {response.text[:500]}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description='Process transcript webhook notification and fetch content',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process notification from S3 file
  python process_transcript_notification.py notification.json
  
  # Process notification JSON from stdin
  echo '{"resource": "users/.../transcripts/..."}' | python process_transcript_notification.py --json -
  
  # Save transcripts to directory
  python process_transcript_notification.py notification.json --output ./transcripts
        """
    )
    
    parser.add_argument('file', nargs='?', help='Path to notification JSON file')
    parser.add_argument('--json', help='Notification JSON string (use "-" for stdin)')
    parser.add_argument('--output', '-o', help='Directory to save transcript files')
    
    args = parser.parse_args()
    
    print("🎯 Transcript Notification Processor")
    print("=" * 80)
    
    # Load notification
    if args.json:
        if args.json == '-':
            print("📥 Reading from stdin...")
            notification = json.load(sys.stdin)
        else:
            print("📥 Parsing JSON string...")
            notification = json.loads(args.json)
    elif args.file:
        print(f"📥 Loading from file: {args.file}")
        with open(args.file, 'r', encoding='utf-8') as f:
            notification = json.load(f)
    else:
        parser.print_help()
        sys.exit(1)
    
    # Parse notification(s)
    parsed_list = parse_notification(notification)
    
    if not parsed_list:
        print("\n❌ No transcripts found in notification")
        sys.exit(1)
    
    print(f"\n✅ Found {len(parsed_list)} transcript(s)")
    
    # Fetch each transcript
    for idx, parsed in enumerate(parsed_list, 1):
        print(f"\n{'=' * 80}")
        print(f"Processing transcript {idx}/{len(parsed_list)}")
        print('=' * 80)
        
        content = fetch_transcript(parsed, output_dir=args.output)
        
        if content:
            # Show preview
            lines = content.split('\n')
            preview_lines = min(20, len(lines))
            print(f"\n📝 Preview (first {preview_lines} lines):")
            print("-" * 80)
            print('\n'.join(lines[:preview_lines]))
            if len(lines) > preview_lines:
                print(f"... ({len(lines) - preview_lines} more lines)")
            print("-" * 80)
    
    print("\n✅ All transcripts processed!")


if __name__ == "__main__":
    main()
