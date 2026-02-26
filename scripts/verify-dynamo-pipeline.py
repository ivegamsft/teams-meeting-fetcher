"""
DynamoDB Pipeline Verification Script
Verifies that the EventHub → Lambda → DynamoDB pipeline processed all mutations
"""
import sys
import os
import json
import subprocess
from datetime import datetime, timezone
from collections import defaultdict


DYNAMODB_TABLE = "tmf-meetings-8akfpg"
S3_BUCKET = "tmf-webhooks-eus-dev"
S3_PREFIX = "eventhub/"
LAMBDA_LOG_GROUP = "/aws/lambda/tmf-eventhub-processor-dev"

REPS = [
    "trustingboar@ibuyspy.net",
    "boldoriole@ibuyspy.net"
]


def run_aws_command(cmd):
    """Run AWS CLI command and return parsed JSON output"""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            if result.stdout.strip():
                return json.loads(result.stdout)
            return {}
        else:
            print(f"❌ AWS command failed: {result.stderr}")
            return None
    except subprocess.TimeoutExpired:
        print(f"❌ AWS command timed out")
        return None
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse JSON: {e}")
        print(f"   Output: {result.stdout[:200]}")
        return None
    except Exception as e:
        print(f"❌ Exception: {str(e)}")
        return None


def check_dynamo_count():
    """Check total meeting count in DynamoDB"""
    print("Check 1: Counting meetings in DynamoDB...\n")
    
    cmd = f"aws dynamodb scan --table-name {DYNAMODB_TABLE} --select COUNT"
    result = run_aws_command(cmd)
    
    if result is not None:
        count = result.get('Count', 0)
        print(f"✅ DynamoDB total meetings: {count}")
        return count
    else:
        print(f"❌ Failed to count DynamoDB meetings")
        return 0


def check_dynamo_status_breakdown():
    """Check meeting status breakdown"""
    print("\nCheck 2: Meeting status breakdown...\n")
    
    # Scan all meetings and aggregate status locally
    # (DynamoDB doesn't support aggregation in scan, so we pull and count)
    
    cmd = f'aws dynamodb scan --table-name {DYNAMODB_TABLE} --projection-expression "meetingStatus,organizerEmail"'
    result = run_aws_command(cmd)
    
    if result is None:
        print("❌ Failed to scan DynamoDB for status breakdown")
        return None, None
    
    items = result.get('Items', [])
    
    # Parse DynamoDB JSON format
    status_counts = defaultdict(int)
    organizer_counts = defaultdict(int)
    
    for item in items:
        # DynamoDB returns items as {'S': 'value'} format
        status_raw = item.get('meetingStatus', {})
        status = status_raw.get('S', 'unknown') if isinstance(status_raw, dict) else 'unknown'
        status_counts[status] += 1
        
        organizer_raw = item.get('organizerEmail', {})
        organizer = organizer_raw.get('S', 'unknown') if isinstance(organizer_raw, dict) else 'unknown'
        organizer_counts[organizer] += 1
    
    print("Status breakdown:")
    for status, count in sorted(status_counts.items()):
        print(f"  {status:15s}: {count}")
    
    print("\nOrganizer breakdown:")
    for organizer, count in sorted(organizer_counts.items()):
        org_name = organizer.split('@')[0] if '@' in organizer else organizer
        print(f"  {org_name:20s}: {count}")
    
    return status_counts, organizer_counts


def check_s3_archived_events():
    """Check S3 for archived EventHub events"""
    print("\nCheck 3: Counting S3 archived events...\n")
    
    cmd = f"aws s3 ls s3://{S3_BUCKET}/{S3_PREFIX} --recursive"
    
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            lines = [line for line in result.stdout.strip().split('\n') if line]
            count = len(lines)
            
            # Parse timestamps from first and last file
            if count > 0:
                first_line = lines[0]
                last_line = lines[-1]
                
                # S3 ls format: "2026-02-26 17:29:32     12345 eventhub/file.json"
                first_time = ' '.join(first_line.split()[:2])
                last_time = ' '.join(last_line.split()[:2])
                
                print(f"✅ S3 archived events: {count}")
                print(f"   First event:  {first_time}")
                print(f"   Last event:   {last_time}")
                return count, first_time, last_time
            else:
                print("❌ No S3 archived events found")
                return 0, None, None
        else:
            print(f"❌ Failed to list S3 files: {result.stderr}")
            return 0, None, None
    
    except Exception as e:
        print(f"❌ Exception listing S3: {str(e)}")
        return 0, None, None


def check_dynamo_timing():
    """Check DynamoDB record timestamps for pipeline timing"""
    print("\nCheck 4: Pipeline timing analysis...\n")
    
    # Scan DynamoDB for createdAt and updatedAt timestamps
    cmd = f'aws dynamodb scan --table-name {DYNAMODB_TABLE} --projection-expression "createdAt,updatedAt"'
    result = run_aws_command(cmd)
    
    if result is None:
        print("❌ Failed to scan DynamoDB for timing")
        return
    
    items = result.get('Items', [])
    
    created_times = []
    updated_times = []
    
    for item in items:
        created_raw = item.get('createdAt', {})
        created = created_raw.get('S', None) if isinstance(created_raw, dict) else None
        if created:
            created_times.append(created)
        
        updated_raw = item.get('updatedAt', {})
        updated = updated_raw.get('S', None) if isinstance(updated_raw, dict) else None
        if updated:
            updated_times.append(updated)
    
    if created_times:
        created_times.sort()
        first_created = created_times[0]
        last_created = created_times[-1]
        
        print(f"DynamoDB timestamps:")
        print(f"  First createdAt: {first_created}")
        print(f"  Last createdAt:  {last_created}")
        
        # Calculate time span
        try:
            first_dt = datetime.fromisoformat(first_created.replace('Z', '+00:00'))
            last_dt = datetime.fromisoformat(last_created.replace('Z', '+00:00'))
            span = last_dt - first_dt
            span_minutes = int(span.total_seconds() // 60)
            span_seconds = int(span.total_seconds() % 60)
            print(f"  Time span:       {span_minutes}m {span_seconds}s")
        except Exception as e:
            print(f"  (Could not parse time span: {e})")
    else:
        print("❌ No createdAt timestamps found")


def check_changeType_tracking():
    """Check if changeType field is tracked in DynamoDB"""
    print("\nCheck 5: changeType tracking...\n")
    
    # Scan for changeType field
    cmd = f'aws dynamodb scan --table-name {DYNAMODB_TABLE} --projection-expression "changeType" --limit 10'
    result = run_aws_command(cmd)
    
    if result is None:
        print("❌ Failed to check changeType tracking")
        return
    
    items = result.get('Items', [])
    
    # Check if any items have changeType
    has_changetype = any('changeType' in item for item in items)
    
    if has_changetype:
        print("✅ changeType field is present in DynamoDB records")
        
        # Count by changeType (full scan)
        cmd_full = f'aws dynamodb scan --table-name {DYNAMODB_TABLE} --projection-expression "changeType"'
        result_full = run_aws_command(cmd_full)
        
        if result_full:
            changetype_counts = defaultdict(int)
            for item in result_full.get('Items', []):
                ct_raw = item.get('changeType', {})
                ct = ct_raw.get('S', 'none') if isinstance(ct_raw, dict) else 'none'
                changetype_counts[ct] += 1
            
            print("\nchangeType breakdown:")
            for ct, count in sorted(changetype_counts.items()):
                print(f"  {ct:15s}: {count}")
    else:
        print("⚠️  changeType field not found in DynamoDB records")
        print("   (McManus may not have added this field yet)")


def print_final_report(dynamo_count, s3_count, s3_first, s3_last, status_counts, organizer_counts):
    """Print final verification report"""
    print("\n" + "=" * 70)
    print("VERIFICATION RESULTS")
    print("=" * 70)
    
    expected_count = 260
    percentage = (dynamo_count / expected_count * 100) if expected_count > 0 else 0
    
    print(f"DynamoDB meetings: {dynamo_count}/{expected_count} ({percentage:.1f}%)")
    
    if organizer_counts:
        for rep in REPS:
            rep_name = rep.split('@')[0]
            count = organizer_counts.get(rep, 0)
            missing = 130 - count
            if missing > 0:
                print(f"  {rep_name:15s}: {count} ({missing} missing)")
            else:
                print(f"  {rep_name:15s}: {count}")
    
    if status_counts:
        print("\nStatus breakdown:")
        for status, count in sorted(status_counts.items()):
            print(f"  {status:15s}: {count}")
    
    print(f"\nS3 archived events: {s3_count}")
    
    if s3_first and s3_last:
        print(f"\nPipeline timing:")
        print(f"  First S3 event:  {s3_first}")
        print(f"  Last S3 event:   {s3_last}")
        print(f"  Estimated latency: ~2-5 min (EventHub polling interval)")
    
    print("=" * 70)


def main():
    """Execute DynamoDB pipeline verification"""
    print("=" * 70)
    print("DYNAMODB PIPELINE VERIFICATION")
    print("=" * 70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Run checks
    dynamo_count = check_dynamo_count()
    status_counts, organizer_counts = check_dynamo_status_breakdown()
    s3_count, s3_first, s3_last = check_s3_archived_events()
    check_dynamo_timing()
    check_changeType_tracking()
    
    # Final report
    print_final_report(
        dynamo_count, s3_count, s3_first, s3_last,
        status_counts, organizer_counts
    )
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
