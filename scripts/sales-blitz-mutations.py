"""
Sales Blitz Mutations Script
After creating 260 appointments, simulate real sales workflow mutations:
- Title renames (~20%)
- Cancellations (~10%)
- Reschedules (~15%)
- Description changes (~15%)
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'graph'))

from datetime import datetime, timedelta
import time
import random
import requests
from auth_helper import get_graph_headers


REPS = [
    "trustingboar@ibuyspy.net",
    "boldoriole@ibuyspy.net"
]


class MutationTracker:
    """Track mutation operations and results"""
    def __init__(self):
        self.operations = []
        self.start_time = time.time()
        self.stats = {
            'rename': {'success': 0, 'failed': 0},
            'cancel': {'success': 0, 'failed': 0},
            'reschedule': {'success': 0, 'failed': 0},
            'description': {'success': 0, 'failed': 0}
        }
        self.rate_limited_count = 0
    
    def log_operation(self, op_type, event_id, user, success, status_code):
        """Log a mutation operation"""
        self.operations.append({
            'type': op_type,
            'event_id': event_id,
            'user': user,
            'success': success,
            'status_code': status_code,
            'timestamp': datetime.now().isoformat()
        })
        
        if success:
            self.stats[op_type]['success'] += 1
        else:
            self.stats[op_type]['failed'] += 1
    
    def log_rate_limit(self):
        """Increment rate limit counter"""
        self.rate_limited_count += 1
    
    def print_summary(self):
        """Print final mutation results summary"""
        duration = time.time() - self.start_time
        minutes = int(duration // 60)
        seconds = int(duration % 60)
        
        print("\n" + "=" * 70)
        print("MUTATION RESULTS")
        print("=" * 70)
        
        total_success = sum(s['success'] for s in self.stats.values())
        total_failed = sum(s['failed'] for s in self.stats.values())
        total_attempted = sum(s['success'] + s['failed'] for s in self.stats.values())
        
        for op_type, counts in self.stats.items():
            total = counts['success'] + counts['failed']
            if total > 0:
                label = op_type.replace('_', ' ').title()
                if op_type == 'rename':
                    label = "Title renames"
                elif op_type == 'description':
                    label = "Description changes"
                print(f"{label:20s}: {counts['success']:3d}/{total:3d} success")
        
        print()
        print(f"Rate limited (429):  {self.rate_limited_count}")
        print(f"Total operations:    {total_attempted} ({total_success} success, {total_failed} failed)")
        print(f"Total duration:      {minutes}m {seconds}s")
        print("=" * 70)


def fetch_events_for_user(rep_email):
    """Fetch all Sales Call events for a rep"""
    headers = get_graph_headers()
    
    # Use $filter to get only Sales Call events
    url = (
        f"https://graph.microsoft.com/v1.0/users/{rep_email}/events"
        f"?$filter=startswith(subject,'Sales Call:')"
        f"&$select=id,subject,start,end,body"
        f"&$top=200"
    )
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            events = data.get('value', [])
            print(f"✅ Fetched {len(events)} events for {rep_email.split('@')[0]}")
            return events
        else:
            print(f"❌ Failed to fetch events for {rep_email}: {response.status_code}")
            print(f"   {response.text[:200]}")
            return []
    
    except Exception as e:
        print(f"❌ Exception fetching events for {rep_email}: {str(e)}")
        return []


def make_request_with_retry(method, url, headers, payload=None, max_retries=5):
    """Make HTTP request with retry logic for 429 rate limiting"""
    retry_count = 0
    base_wait = 1.0
    
    while retry_count <= max_retries:
        try:
            if method == 'PATCH':
                response = requests.patch(url, headers=headers, json=payload, timeout=30)
            elif method == 'POST':
                response = requests.post(url, headers=headers, json=payload, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            if response.status_code in [200, 202, 204]:
                return True, response.status_code
            
            elif response.status_code == 429:
                # Rate limited
                retry_after = response.headers.get('Retry-After', None)
                
                if retry_after:
                    wait_time = int(retry_after)
                else:
                    wait_time = base_wait * (2 ** retry_count)
                
                print(f"   🔶 429 Rate Limited - waiting {wait_time}s (retry {retry_count+1}/{max_retries})")
                time.sleep(wait_time)
                retry_count += 1
                
            else:
                print(f"   ❌ HTTP {response.status_code}: {response.text[:150]}")
                return False, response.status_code
        
        except Exception as e:
            print(f"   ❌ Exception: {str(e)[:150]}")
            if retry_count < max_retries:
                wait_time = base_wait * (2 ** retry_count)
                print(f"   🔄 Retrying in {wait_time}s...")
                time.sleep(wait_time)
                retry_count += 1
            else:
                return False, 0
    
    # Max retries exceeded
    print(f"   ❌ Max retries exceeded")
    return False, 429


def mutate_title_rename(event, rep_email, tracker):
    """Rename event title - add UPDATED: prefix"""
    event_id = event['id']
    old_subject = event['subject']
    new_subject = old_subject.replace('Sales Call:', 'UPDATED: Sales Call:')
    
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{rep_email}/events/{event_id}"
    payload = {"subject": new_subject}
    
    success, status = make_request_with_retry('PATCH', url, headers, payload)
    tracker.log_operation('rename', event_id, rep_email, success, status)
    
    if status == 429:
        tracker.log_rate_limit()
    
    return success


def mutate_cancel(event, rep_email, tracker):
    """Cancel an event"""
    event_id = event['id']
    
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{rep_email}/events/{event_id}/cancel"
    payload = {"comment": "Rescheduling due to conflict"}
    
    success, status = make_request_with_retry('POST', url, headers, payload)
    tracker.log_operation('cancel', event_id, rep_email, success, status)
    
    if status == 429:
        tracker.log_rate_limit()
    
    return success


def mutate_reschedule(event, rep_email, tracker):
    """Reschedule event - shift by +2 hours"""
    event_id = event['id']
    
    # Parse current start/end times
    start_dt_str = event['start']['dateTime']
    end_dt_str = event['end']['dateTime']
    
    # Parse ISO format without timezone suffix (Graph returns without 'Z')
    start_dt = datetime.fromisoformat(start_dt_str)
    end_dt = datetime.fromisoformat(end_dt_str)
    
    # Shift by +2 hours
    new_start = start_dt + timedelta(hours=2)
    new_end = end_dt + timedelta(hours=2)
    
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{rep_email}/events/{event_id}"
    payload = {
        "start": {
            "dateTime": new_start.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": event['start']['timeZone']
        },
        "end": {
            "dateTime": new_end.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": event['end']['timeZone']
        }
    }
    
    success, status = make_request_with_retry('PATCH', url, headers, payload)
    tracker.log_operation('reschedule', event_id, rep_email, success, status)
    
    if status == 429:
        tracker.log_rate_limit()
    
    return success


def mutate_description(event, rep_email, tracker):
    """Add follow-up notes to event description"""
    event_id = event['id']
    
    # Get existing body
    existing_body = event.get('body', {}).get('content', '')
    
    follow_up_notes = """
<h3>FOLLOW-UP NOTES</h3>
<ul>
<li>Strong interest in enterprise features</li>
<li>Requested pricing proposal for 100+ users</li>
<li>Next call scheduled with technical team</li>
<li>Decision timeline: End of Q2</li>
</ul>"""
    
    new_body = existing_body + follow_up_notes
    
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{rep_email}/events/{event_id}"
    payload = {
        "body": {
            "contentType": "HTML",
            "content": new_body
        }
    }
    
    success, status = make_request_with_retry('PATCH', url, headers, payload)
    tracker.log_operation('description', event_id, rep_email, success, status)
    
    if status == 429:
        tracker.log_rate_limit()
    
    return success


def main():
    """Execute mutations on Sales Call events"""
    print("=" * 70)
    print("SALES BLITZ MUTATIONS")
    print("=" * 70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    tracker = MutationTracker()
    
    # Step 1: Fetch all events for both reps
    print("Step 1: Fetching events for both reps...\n")
    
    all_events = []
    for rep in REPS:
        events = fetch_events_for_user(rep)
        for event in events:
            event['_owner'] = rep  # Tag with owner for later
        all_events.extend(events)
        time.sleep(0.5)  # Pacing
    
    print(f"\nTotal events fetched: {len(all_events)}\n")
    
    if len(all_events) == 0:
        print("❌ No events found. Exiting.")
        return 1
    
    # Step 2: Shuffle and split into mutation buckets
    print("Step 2: Planning mutations...\n")
    
    random.shuffle(all_events)
    
    # Calculate target counts
    total = len(all_events)
    rename_count = int(total * 0.20)  # 20%
    cancel_count = int(total * 0.10)  # 10%
    reschedule_count = int(total * 0.15)  # 15%
    description_count = int(total * 0.15)  # 15%
    
    # Partition events (non-overlapping)
    idx = 0
    rename_events = all_events[idx:idx + rename_count]
    idx += rename_count
    
    cancel_events = all_events[idx:idx + cancel_count]
    idx += cancel_count
    
    reschedule_events = all_events[idx:idx + reschedule_count]
    idx += reschedule_count
    
    description_events = all_events[idx:idx + description_count]
    
    print(f"Planned mutations:")
    print(f"  Title renames:       {len(rename_events)}")
    print(f"  Cancellations:       {len(cancel_events)}")
    print(f"  Reschedules:         {len(reschedule_events)}")
    print(f"  Description changes: {len(description_events)}")
    print(f"  Total:               {len(rename_events) + len(cancel_events) + len(reschedule_events) + len(description_events)}\n")
    
    # Step 3: Execute mutations
    print("Step 3: Executing mutations...\n")
    
    # Title renames
    print(f"--- Title Renames ({len(rename_events)} events) ---")
    for i, event in enumerate(rename_events, 1):
        rep = event['_owner']
        rep_name = rep.split('@')[0]
        subject = event['subject'][:50]
        print(f"[{i}/{len(rename_events)}] {rep_name}: {subject}...")
        mutate_title_rename(event, rep, tracker)
        time.sleep(0.1)  # Pacing
    
    # Cancellations
    print(f"\n--- Cancellations ({len(cancel_events)} events) ---")
    for i, event in enumerate(cancel_events, 1):
        rep = event['_owner']
        rep_name = rep.split('@')[0]
        subject = event['subject'][:50]
        print(f"[{i}/{len(cancel_events)}] {rep_name}: {subject}...")
        mutate_cancel(event, rep, tracker)
        time.sleep(0.1)
    
    # Reschedules
    print(f"\n--- Reschedules ({len(reschedule_events)} events) ---")
    for i, event in enumerate(reschedule_events, 1):
        rep = event['_owner']
        rep_name = rep.split('@')[0]
        subject = event['subject'][:50]
        print(f"[{i}/{len(reschedule_events)}] {rep_name}: {subject}...")
        mutate_reschedule(event, rep, tracker)
        time.sleep(0.1)
    
    # Description changes
    print(f"\n--- Description Changes ({len(description_events)} events) ---")
    for i, event in enumerate(description_events, 1):
        rep = event['_owner']
        rep_name = rep.split('@')[0]
        subject = event['subject'][:50]
        print(f"[{i}/{len(description_events)}] {rep_name}: {subject}...")
        mutate_description(event, rep, tracker)
        time.sleep(0.1)
    
    # Final summary
    tracker.print_summary()
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
