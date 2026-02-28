#!/usr/bin/env python3
"""
Batch fetch meeting details for all notification_received meetings.

Scans DynamoDB for meetings with status='notification_received', then calls the
admin app's batch-fetch-details endpoint in batches to enrich them with Graph API data.

Usage:
    python scripts/batch-fetch-meeting-details.py [--batch-size 50] [--dry-run]
"""

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DYNAMODB_TABLE = "tmf-meetings-8akfpg"
SECRETS_ID = "tmf/admin-app-8akfpg"
ECS_CLUSTER = "tmf-admin-app-8akfpg"
ECS_SERVICE = "tmf-admin-app-8akfpg"


def get_admin_app_url():
    """Auto-detect admin app URL from ECS task public IP."""
    task_arn = subprocess.run(
        ["aws", "ecs", "list-tasks", "--cluster", ECS_CLUSTER,
         "--service-name", ECS_SERVICE, "--query", "taskArns[0]", "--output", "text"],
        capture_output=True, text=True,
    ).stdout.strip()
    if not task_arn or task_arn == "None":
        print("ERROR: No running ECS tasks found")
        sys.exit(1)

    eni = subprocess.run(
        ["aws", "ecs", "describe-tasks", "--cluster", ECS_CLUSTER, "--tasks", task_arn,
         "--query", "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value",
         "--output", "text"],
        capture_output=True, text=True,
    ).stdout.strip()

    ip = subprocess.run(
        ["aws", "ec2", "describe-network-interfaces", "--network-interface-ids", eni,
         "--query", "NetworkInterfaces[0].Association.PublicIp", "--output", "text"],
        capture_output=True, text=True,
    ).stdout.strip()

    if not ip or ip == "None":
        print("ERROR: Could not determine admin app public IP")
        sys.exit(1)

    return f"https://{ip}:3000"


def get_api_key():
    """Retrieve API_KEY from AWS Secrets Manager."""
    result = subprocess.run(
        [
            "aws", "secretsmanager", "get-secret-value",
            "--secret-id", SECRETS_ID,
            "--query", "SecretString",
            "--output", "text",
        ],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"ERROR: Failed to get secret: {result.stderr}")
        sys.exit(1)
    secrets = json.loads(result.stdout.strip())
    api_key = secrets.get("API_KEY", "")
    if not api_key:
        print("ERROR: API_KEY is empty in Secrets Manager")
        sys.exit(1)
    return api_key


def scan_notification_received_meetings():
    """Scan DynamoDB for all meetings with status='notification_received'."""
    meeting_ids = []
    last_evaluated_key = None
    page = 0

    while True:
        page += 1
        cmd = [
            "aws", "dynamodb", "scan",
            "--table-name", DYNAMODB_TABLE,
            "--filter-expression", "#s = :s",
            "--expression-attribute-names", json.dumps({"#s": "status"}),
            "--expression-attribute-values", json.dumps({":s": {"S": "notification_received"}}),
            "--projection-expression", "meeting_id",
        ]
        if last_evaluated_key:
            cmd.extend(["--exclusive-start-key", json.dumps(last_evaluated_key)])

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"ERROR: DynamoDB scan failed: {result.stderr}")
            sys.exit(1)

        data = json.loads(result.stdout)
        items = data.get("Items", [])
        for item in items:
            mid = item["meeting_id"]["S"]
            if mid not in meeting_ids:
                meeting_ids.append(mid)

        print(f"  Scan page {page}: {len(items)} items (total so far: {len(meeting_ids)})")

        last_evaluated_key = data.get("LastEvaluatedKey")
        if not last_evaluated_key:
            break

    return meeting_ids


def fetch_batch(session, admin_url, api_key, meeting_ids, batch_num, total_batches):
    """Call the batch-fetch-details endpoint for a batch of meeting IDs."""
    url = f"{admin_url}/api/meetings/batch-fetch-details"
    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json",
    }
    payload = {"meetingIds": meeting_ids}

    try:
        resp = session.post(url, json=payload, headers=headers, verify=False, timeout=600)
        resp.raise_for_status()
        result = resp.json()
        success_count = len(result.get("success", []))
        failed_items = result.get("failed", [])
        failed_count = len(failed_items)
        return success_count, failed_count, failed_items
    except requests.exceptions.Timeout:
        print(f"  TIMEOUT on batch {batch_num}/{total_batches} ({len(meeting_ids)} meetings)")
        return 0, len(meeting_ids), [{"id": mid, "error": "timeout"} for mid in meeting_ids]
    except requests.exceptions.RequestException as e:
        print(f"  ERROR on batch {batch_num}/{total_batches}: {e}")
        return 0, len(meeting_ids), [{"id": mid, "error": str(e)} for mid in meeting_ids]


def get_status_counts():
    """Get counts of meetings by status from DynamoDB."""
    counts = {}
    for status in ["notification_received", "scheduled", "cancelled"]:
        cmd = [
            "aws", "dynamodb", "scan",
            "--table-name", DYNAMODB_TABLE,
            "--filter-expression", "#s = :s",
            "--expression-attribute-names", json.dumps({"#s": "status"}),
            "--expression-attribute-values", json.dumps({":s": {"S": status}}),
            "--select", "COUNT",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            counts[status] = data.get("Count", 0)
        else:
            counts[status] = "error"
    return counts


def main():
    parser = argparse.ArgumentParser(description="Batch fetch meeting details")
    parser.add_argument("--batch-size", type=int, default=50, help="Meetings per batch (default: 50)")
    parser.add_argument("--url", type=str, default=None, help="Admin app URL (auto-detected from ECS if omitted)")
    parser.add_argument("--dry-run", action="store_true", help="Scan only, don't fetch")
    args = parser.parse_args()

    start_time = time.time()
    print(f"=== Batch Fetch Meeting Details ===")
    print(f"Started: {datetime.now(timezone.utc).isoformat()}")
    print(f"Batch size: {args.batch_size}")
    print()

    # Step 0: Resolve admin app URL
    if args.url:
        admin_url = args.url.rstrip("/")
    else:
        print("[0/4] Auto-detecting admin app URL from ECS...")
        admin_url = get_admin_app_url()
    print(f"  Admin app: {admin_url}")
    print()

    # Step 1: Get API key
    print("[1/4] Retrieving API key from Secrets Manager...")
    api_key = get_api_key()
    print(f"  API key retrieved (length={len(api_key)})")
    print()

    # Step 2: Pre-flight check
    print("[2/4] Status counts BEFORE fetch:")
    before_counts = get_status_counts()
    for status, count in before_counts.items():
        print(f"  {status}: {count}")
    print()

    # Step 3: Scan for notification_received meetings
    print("[3/4] Scanning DynamoDB for notification_received meetings...")
    meeting_ids = scan_notification_received_meetings()
    print(f"  Found {len(meeting_ids)} meetings to fetch")
    print()

    if not meeting_ids:
        print("No meetings to fetch. Done.")
        return

    if args.dry_run:
        print("DRY RUN - skipping fetch. Would process these meeting IDs:")
        for mid in meeting_ids[:10]:
            print(f"  {mid}")
        if len(meeting_ids) > 10:
            print(f"  ... and {len(meeting_ids) - 10} more")
        return

    # Step 4: Batch fetch
    print(f"[4/4] Fetching details in batches of {args.batch_size}...")
    total_success = 0
    total_failed = 0
    all_failures = []
    session = requests.Session()

    batches = [meeting_ids[i:i + args.batch_size] for i in range(0, len(meeting_ids), args.batch_size)]
    total_batches = len(batches)

    for i, batch in enumerate(batches, 1):
        batch_start = time.time()
        success, failed, failures = fetch_batch(session, admin_url, api_key, batch, i, total_batches)
        batch_elapsed = time.time() - batch_start
        total_success += success
        total_failed += failed
        all_failures.extend(failures)

        print(f"  Batch {i}/{total_batches}: {success} success, {failed} failed ({batch_elapsed:.1f}s)")

        # Brief pause between batches to avoid overwhelming the server
        if i < total_batches:
            time.sleep(1)

    elapsed = time.time() - start_time
    print()
    print(f"=== Results ===")
    print(f"Total: {total_success} success, {total_failed} failed out of {len(meeting_ids)}")
    print(f"Duration: {elapsed:.1f}s ({elapsed/60:.1f}m)")
    if total_success > 0:
        print(f"Average: {elapsed/total_success:.2f}s per meeting")

    if all_failures:
        print(f"\nFailed meetings ({len(all_failures)}):")
        for f in all_failures[:20]:
            print(f"  {f['id']}: {f['error']}")
        if len(all_failures) > 20:
            print(f"  ... and {len(all_failures) - 20} more")

    # Step 5: Verify
    print(f"\nStatus counts AFTER fetch:")
    after_counts = get_status_counts()
    for status, count in after_counts.items():
        print(f"  {status}: {count}")

    print(f"\nCompleted: {datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    main()
