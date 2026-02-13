#!/usr/bin/env python3
import boto3
import json

s3 = boto3.client('s3', region_name='us-east-1', profile_name='tmf-dev')

# List recent objects
response = s3.list_objects_v2(
    Bucket='tmf-webhook-payloads-dev', 
    Prefix='webhooks/',
    MaxKeys=100
)

objects = sorted(response.get('Contents', []), key=lambda x: x['LastModified'], reverse=True)

print(f"Total webhook payloads in S3: {len(objects)}\n")
print("="*80)

transcript_count = 0
calendar_count = 0
transcript_files = []

for obj in objects:
    key = obj['Key']
    try:
        resp = s3.get_object(Bucket='tmf-webhook-payloads-dev', Key=key)
        content = json.loads(resp['Body'].read().decode('utf-8'))
        resource = content.get('resourceData', {}).get('resource', '')
        
        if 'transcript' in resource.lower():
            print(f"✅ TRANSCRIPT NOTIFICATION: {key}")
            print(f"   Resource: {resource}")
            transcript_count += 1
            transcript_files.append(key)
        elif 'event' in resource.lower():
            calendar_count += 1
        
    except Exception as e:
        print(f"Error processing {key}: {e}")

print("="*80)
print(f"\n📊 Summary:")
print(f"   ✅ Transcript notifications: {transcript_count}")
print(f"   📅 Calendar event webhooks: {calendar_count}")

if transcript_count == 0:
    print(f"\n⏳ STATUS: No transcript notifications in S3 yet")
    print(f"   Last calendar event was at: 2026-02-13T02:18:51")
    print(f"   Meeting ended at: 2026-02-13T00:19:46")
    print(f"   Time elapsed: ~1h 59m")
    print(f"\n   Expected behavior: Transcript should arrive within 5-30 minutes after meeting ends")
    print(f"   Possible issues:")
    print(f"   1. Meeting recording may not have completed successfully")
    print(f"   2. Transcript subscription may not be active")
    print(f"   3. Teams backend may not have generated transcript yet")
else:
    print(f"\n✅ SUCCESS: Transcripts are being delivered!")
    print(f"\nFirst transcript file: {transcript_files[0]}")
