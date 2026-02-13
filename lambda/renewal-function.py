#!/usr/bin/env python3
"""
Auto-Renewal Lambda for Graph API Subscriptions

Triggered daily to check subscriptions in DynamoDB
and renew those expiring within 2 days.

Deploy as AWS Lambda function with:
- IAM role: GetItem, Query on DynamoDB table
- Trigger: CloudWatch Events (daily at 2 AM)
- Environment variables:
  - GRAPH_TENANT_ID
  - GRAPH_CLIENT_ID  
  - GRAPH_CLIENT_SECRET
  - SUBSCRIPTIONS_TABLE
"""

import json
import boto3
import requests
import os
from datetime import datetime, timedelta

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ.get('SUBSCRIPTIONS_TABLE', 'graph-subscriptions'))


def get_graph_token():
    """Get fresh token for Graph API."""
    tenant_id = os.environ['GRAPH_TENANT_ID']
    client_id = os.environ['GRAPH_CLIENT_ID']
    client_secret = os.environ['GRAPH_CLIENT_SECRET']
    
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    data = {
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': 'https://graph.microsoft.com/.default',
        'grant_type': 'client_credentials'
    }
    
    response = requests.post(url, data=data)
    response.raise_for_status()
    
    return response.json()['access_token']


def renew_subscription(sub_id: str, hours: int = 24) -> bool:
    """Renew subscription via Graph API."""
    
    token = get_graph_token()
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    new_expiry = (datetime.utcnow() + timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%S.0000000Z')
    
    url = f"https://graph.microsoft.com/v1.0/subscriptions/{sub_id}"
    payload = {"expirationDateTime": new_expiry}
    
    response = requests.patch(url, headers=headers, json=payload)
    
    if response.status_code == 200:
        print(f"✅ Renewed subscription {sub_id[:50]}... until {new_expiry}")
        return True
    else:
        print(f"❌ Failed to renew {sub_id}: {response.text}")
        return False


def find_and_renew_expired() -> dict:
    """Find subscriptions expiring within 2 days and renew."""
    
    cutoff_date = (datetime.utcnow() + timedelta(days=2)).isoformat()
    
    # Query subscriptions by status and expiry date
    response = table.query(
        IndexName='expiry-date-index',
        KeyConditionExpression='#status = :status AND expiry_date <= :cutoff',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':status': 'active',
            ':cutoff': cutoff_date
        }
    )
    
    subscriptions = response.get('Items', [])
    print(f"Found {len(subscriptions)} subscription(s) to renew")
    
    renewed = 0
    failed = 0
    
    for sub in subscriptions:
        try:
            if renew_subscription(sub['subscription_id']):
                # Update DynamoDB with new expiry
                new_expiry = (datetime.utcnow() + timedelta(hours=24)).isoformat()
                table.update_item(
                    Key={
                        'subscription_id': sub['subscription_id'],
                        'created_at': sub['created_at']
                    },
                    UpdateExpression='SET expiry_date = :expiry, last_renewed = :now, renewal_count = renewal_count + :one',
                    ExpressionAttributeValues={
                        ':expiry': new_expiry,
                        ':now': datetime.utcnow().isoformat(),
                        ':one': 1
                    }
                )
                renewed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"Exception renewing {sub['subscription_id']}: {e}")
            failed += 1
    
    return {
        'total_checked': len(subscriptions),
        'renewed': renewed,
        'failed': failed
    }


def lambda_handler(event, context):
    """
    Lambda entry point for scheduled subscription renewal.
    
    Event: CloudWatch Events (scheduled)
    """
    
    try:
        print("🔄 Starting subscription renewal check...")
        
        result = find_and_renew_expired()
        
        response = {
            'statusCode': 200,
            'body': json.dumps(result)
        }
        
        print(f"✅ Renewal complete: {result['renewed']} renewed, {result['failed']} failed")
        
        return response
        
    except Exception as e:
        print(f"❌ Error in renewal: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


# Test locally
if __name__ == '__main__':
    # Set environment variables for testing
    os.environ['SUBSCRIPTIONS_TABLE'] = 'graph-subscriptions'
    
    # Simulate Lambda event
    result = find_and_renew_expired()
    print(f"\nResult: {json.dumps(result, indent=2)}")
