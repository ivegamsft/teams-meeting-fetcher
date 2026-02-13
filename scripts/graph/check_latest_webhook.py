#!/usr/bin/env python3
import boto3
import json
from datetime import datetime

s3 = boto3.client('s3', region_name='us-east-1', profile_name='tmf-dev')

# List latest files
resp = s3.list_objects_v2(Bucket='tmf-webhook-payloads-dev', Prefix='webhooks/', MaxKeys=20)
objects = sorted(resp.get('Contents', []), key=lambda x: x['LastModified'], reverse=True)

print('🔍 Latest 10 webhook payloads in S3:\n')
for i, obj in enumerate(objects[:10], 1):
    key = obj['Key']
    size = obj['Size']
    mod_time = obj['LastModified'].strftime('%Y-%m-%d %H:%M:%S UTC')
    print(f"  {i:2}. {key.split('/')[-1]} ({size} bytes) - {mod_time}")

print(f'\n✅ Total files in S3: {len(objects)}')

# Show the MOST RECENT file
if objects:
    latest_key = objects[0]['Key']
    latest_obj = s3.get_object(Bucket='tmf-webhook-payloads-dev', Key=latest_key)
    data = json.loads(latest_obj['Body'].read())
    
    webhook_type = "Transcript" if "transcript" in str(data).lower() else "Calendar"
    
    print(f'\n📋 Latest webhook payload (MOST RECENT):')
    print(f"   File: {latest_key.split('/')[-1]}")
    print(f"   Type: {webhook_type}")
    if 'resourceData' in data:
        resource = data['resourceData'].get('resource', 'N/A')
    else:
        resource = data.get('resource', 'N/A')
    print(f"   Resource: {resource[:70]}...")
