#!/usr/bin/env python3
"""
Replay S3-archived Graph notifications to recover lost "created" events.

Context: Admin app deploy took it offline 18:27-18:37 UTC on 2026-02-26.
Lambda tried forwarding "created" notifications during that window → all failed.
S3 has the archived events, DynamoDB missing the "created" records.

This script:
1. Lists S3 objects from the blitz time window
2. Reads each S3 file containing EventHub payloads
3. Extracts Graph notifications from events[].body.value[]
4. Filters for changeType="created"
5. POSTs each to admin app webhook
6. Reports results
"""

import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional

# AWS/S3 config
BUCKET = "tmf-webhooks-eus-dev"
PREFIX = "eventhub/"
TIME_START = "2026-02-26T18:25:00"
TIME_END = "2026-02-26T19:00:00"
LAMBDA_FUNCTION = "tmf-eventhub-processor-dev"

# Replay config
PACE_MS = 200  # milliseconds between requests


def run_aws(args: List[str], check: bool = True) -> Dict[str, Any]:
    """Run AWS CLI command and return parsed JSON output."""
    result = subprocess.run(
        ["aws"] + args,
        capture_output=True,
        text=True,
        check=check
    )
    if result.returncode != 0:
        print(f"AWS CLI error: {result.stderr}", file=sys.stderr)
        if check:
            sys.exit(1)
        return {}
    return json.loads(result.stdout) if result.stdout else {}


def get_lambda_env() -> tuple[str, str]:
    """Fetch ADMIN_APP_WEBHOOK_URL and WEBHOOK_AUTH_SECRET from Lambda config."""
    print("Fetching Lambda configuration...")
    config = run_aws([
        "lambda", "get-function-configuration",
        "--function-name", LAMBDA_FUNCTION
    ])
    env_vars = config.get("Environment", {}).get("Variables", {})
    webhook_url = env_vars.get("ADMIN_APP_WEBHOOK_URL", "")
    auth_secret = env_vars.get("WEBHOOK_AUTH_SECRET", "")
    
    if not webhook_url:
        print("ERROR: ADMIN_APP_WEBHOOK_URL not set in Lambda config", file=sys.stderr)
        sys.exit(1)
    if not auth_secret:
        print("ERROR: WEBHOOK_AUTH_SECRET not set in Lambda config", file=sys.stderr)
        sys.exit(1)
    
    # Ensure webhook URL points to the graph webhook endpoint
    if not webhook_url.endswith("/api/webhooks/graph"):
        if webhook_url.endswith("/"):
            webhook_url = webhook_url + "api/webhooks/graph"
        else:
            webhook_url = webhook_url + "/api/webhooks/graph"
    
    print(f"Admin app webhook: {webhook_url}")
    print(f"Auth secret: {auth_secret[:8]}... (first 8 chars)")
    return webhook_url, auth_secret


def list_s3_objects() -> List[str]:
    """List S3 objects in the time window."""
    print(f"\nListing S3 objects in {BUCKET}/{PREFIX} from {TIME_START} to {TIME_END}...")
    
    # List all objects with the prefix
    result = run_aws([
        "s3api", "list-objects-v2",
        "--bucket", BUCKET,
        "--prefix", PREFIX
    ])
    
    objects = result.get("Contents", [])
    print(f"Found {len(objects)} total objects in {PREFIX}")
    
    # Filter by time range (S3 LastModified)
    start_dt = datetime.fromisoformat(TIME_START).replace(tzinfo=timezone.utc)
    end_dt = datetime.fromisoformat(TIME_END).replace(tzinfo=timezone.utc)
    
    filtered = []
    for obj in objects:
        last_modified = datetime.fromisoformat(obj["LastModified"].replace("Z", "+00:00"))
        if start_dt <= last_modified <= end_dt:
            filtered.append(obj["Key"])
    
    print(f"Filtered to {len(filtered)} objects in time window")
    return filtered


def read_s3_object(key: str) -> Optional[Dict[str, Any]]:
    """Read and parse S3 object as JSON."""
    result = subprocess.run(
        ["aws", "s3", "cp", f"s3://{BUCKET}/{key}", "-"],
        capture_output=True,
        text=True,
        check=False
    )
    if result.returncode != 0:
        print(f"Failed to read s3://{BUCKET}/{key}: {result.stderr}", file=sys.stderr)
        return None
    
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON from {key}: {e}", file=sys.stderr)
        return None


def extract_notifications(s3_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract Graph notifications from S3 EventHub archive format."""
    notifications = []
    
    # S3 file format: { events: [ { body: { value: [...] } } ] }
    events = s3_data.get("events", [])
    for event in events:
        body = event.get("body", {})
        value_array = body.get("value", [])
        for notification in value_array:
            notifications.append(notification)
    
    return notifications


def post_webhook(url: str, auth_secret: str, notification: Dict[str, Any]) -> bool:
    """POST notification to admin app webhook. Returns True on success."""
    import urllib.request
    import ssl
    
    # Prepare request
    payload = {"value": [notification]}
    body = json.dumps(payload).encode("utf-8")
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_secret}"
    }
    
    request = urllib.request.Request(url, data=body, headers=headers)
    
    # Disable SSL verification for self-signed certs
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    try:
        with urllib.request.urlopen(request, context=ctx, timeout=10) as response:
            if response.status == 200:
                return True
            else:
                print(f"Webhook returned {response.status}", file=sys.stderr)
                return False
    except Exception as e:
        print(f"Webhook request failed: {e}", file=sys.stderr)
        return False


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Replay S3-archived Graph notifications")
    parser.add_argument("--change-types", default="created",
                        help="Comma-separated changeTypes to replay (e.g., 'created', 'updated,deleted', 'all')")
    args = parser.parse_args()
    
    if args.change_types == "all":
        target_types = None  # replay everything
    else:
        target_types = set(args.change_types.split(","))
    
    label = args.change_types
    print(f"=== S3 Notification Replay Script (filter: {label}) ===\n")
    
    # Step 1: Get Lambda webhook config
    webhook_url, auth_secret = get_lambda_env()
    
    # Step 2: List S3 objects in time window
    s3_keys = list_s3_objects()
    if not s3_keys:
        print("\nNo S3 objects found in time window. Exiting.")
        return
    
    # Step 3: Read S3 files and extract notifications
    print(f"\nReading {len(s3_keys)} S3 files...")
    all_notifications = []
    files_read = 0
    files_failed = 0
    
    for key in s3_keys:
        s3_data = read_s3_object(key)
        if s3_data:
            notifications = extract_notifications(s3_data)
            all_notifications.extend(notifications)
            files_read += 1
        else:
            files_failed += 1
    
    print(f"Successfully read {files_read} files, {files_failed} failed")
    print(f"Extracted {len(all_notifications)} total notifications")
    
    # Step 4: Analyze and filter notification types
    by_type = {}
    target_notifications = []
    
    for notif in all_notifications:
        ct = notif.get("changeType", "unknown")
        by_type[ct] = by_type.get(ct, 0) + 1
        if target_types is None or ct in target_types:
            target_notifications.append(notif)
    
    print(f"\nNotification breakdown:")
    for ct, count in sorted(by_type.items()):
        marker = " ← replaying" if (target_types is None or ct in target_types) else ""
        print(f"  - {ct}: {count}{marker}")
    
    if not target_notifications:
        print(f"\nNo matching notifications found to replay. Exiting.")
        return
    
    # Step 5: Replay filtered notifications
    print(f"\nReplaying {len(target_notifications)} notifications to webhook...")
    print(f"Pacing: {PACE_MS}ms between requests\n")
    
    success_count = 0
    fail_count = 0
    
    for i, notif in enumerate(target_notifications, 1):
        resource = notif.get("resource", "unknown")
        ct = notif.get("changeType", "?")
        print(f"[{i}/{len(target_notifications)}] [{ct}] {resource[-40:]}...", end=" ")
        
        if post_webhook(webhook_url, auth_secret, notif):
            print("OK")
            success_count += 1
        else:
            print("FAIL")
            fail_count += 1
        
        if i < len(target_notifications):
            time.sleep(PACE_MS / 1000.0)
    
    # Step 6: Report results
    print(f"\n=== Replay Complete ===")
    print(f"S3 files read: {files_read}")
    print(f"Total notifications in S3: {len(all_notifications)}")
    for ct, count in sorted(by_type.items()):
        print(f"  - {ct}: {count}")
    print(f"Replayed ({label}): {len(target_notifications)}")
    print(f"  - success: {success_count}")
    print(f"  - failed: {fail_count}")


if __name__ == "__main__":
    main()
