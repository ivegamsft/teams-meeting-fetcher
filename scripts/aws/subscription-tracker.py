#!/usr/bin/env python3
"""
Subscription Metadata Tracker - DynamoDB

Stores Graph API subscription metadata in AWS DynamoDB
for tracking and auto-renewal functionality.

Usage:
    # Save subscription when created
    python scripts/aws/subscription-tracker.py save \
      --id "15e81c83-f8e8-4f0c-8108-2c3a65451c91" \
      --resource "users/boldoriole@ibuyspy.net/onlineMeetings/getAllTranscripts(...)" \
      --expiry "2026-02-14T03:34:59Z" \
      --type "transcript"
    
    # List all subscriptions
    python scripts/aws/subscription-tracker.py list
    
    # Find expiring subscriptions
    python scripts/aws/subscription-tracker.py expiring --days 2
    
    # Update subscription
    python scripts/aws/subscription-tracker.py update --id "..." --expiry "..."
"""

import boto3
import json
import argparse
from datetime import datetime, timedelta
from typing import List, Dict

# Initialize DynamoDB
dynamodb = boto3.resource('dynamodb', region_name='us-east-1')


class SubscriptionTracker:
    """Manage Graph API subscription metadata in DynamoDB."""
    
    def __init__(self, table_name='graph-subscriptions', profile='tmf-dev'):
        """Initialize tracker with DynamoDB table."""
        session = boto3.Session(profile_name=profile)
        self.dynamodb = session.resource('dynamodb', region_name='us-east-1')
        
        try:
            self.table = self.dynamodb.Table(table_name)
            # Test table access
            self.table.table_status
            print(f"✅ Connected to DynamoDB table: {table_name}")
        except Exception as e:
            print(f"❌ Error connecting to table: {e}")
            print(f"\n🔨 To create the table, run:")
            print(f"   python scripts/aws/subscription-tracker.py create-table")
            raise
    
    def create_table(self):
        """Create DynamoDB table for subscriptions."""
        print("📝 Creating DynamoDB table 'graph-subscriptions'...")
        
        try:
            table = self.dynamodb.create_table(
                TableName='graph-subscriptions',
                KeySchema=[
                    {'AttributeName': 'subscription_id', 'KeyType': 'HASH'},
                    {'AttributeName': 'created_at', 'KeyType': 'RANGE'}
                ],
                AttributeDefinitions=[
                    {'AttributeName': 'subscription_id', 'AttributeType': 'S'},
                    {'AttributeName': 'created_at', 'AttributeType': 'S'},
                    {'AttributeName': 'expiry_date', 'AttributeType': 'S'},
                    {'AttributeName': 'status', 'AttributeType': 'S'}
                ],
                GlobalSecondaryIndexes=[
                    {
                        'IndexName': 'expiry-date-index',
                        'KeySchema': [
                            {'AttributeName': 'status', 'KeyType': 'HASH'},
                            {'AttributeName': 'expiry_date', 'KeyType': 'RANGE'}
                        ],
                        'Projection': {'ProjectionType': 'ALL'},
                        'ProvisionedThroughput': {
                            'ReadCapacityUnits': 5,
                            'WriteCapacityUnits': 5
                        }
                    }
                ],
                BillingMode='PAY_PER_REQUEST'
            )
            
            # Wait for table to be created
            table.meta.client.get_waiter('table_exists').wait(TableName='graph-subscriptions')
            print("✅ Table created successfully!")
            
        except Exception as e:
            print(f"❌ Error: {e}")
    
    def save_subscription(self, sub_id: str, resource: str, expiry: str, 
                         sub_type: str = 'other', change_types: str = 'created'):
        """Save subscription metadata to DynamoDB."""
        
        created_at = datetime.utcnow().isoformat()
        
        item = {
            'subscription_id': sub_id,
            'created_at': created_at,
            'resource': resource,
            'expiry_date': expiry,
            'type': sub_type,
            'change_types': change_types,
            'status': 'active',
            'renewal_count': 0,
            'last_renewed': None
        }
        
        try:
            self.table.put_item(Item=item)
            print(f"✅ Subscription saved:")
            print(f"   ID: {sub_id[:50]}...")
            print(f"   Type: {sub_type}")
            print(f"   Expires: {expiry}")
            return True
        except Exception as e:
            print(f"❌ Error saving subscription: {e}")
            return False
    
    def list_subscriptions(self) -> List[Dict]:
        """List all active subscriptions."""
        try:
            response = self.table.scan(
                FilterExpression='#status = :status',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={':status': 'active'}
            )
            
            subscriptions = response.get('Items', [])
            
            if not subscriptions:
                print("📭 No subscriptions found")
                return []
            
            print(f"📋 Found {len(subscriptions)} subscription(s):\n")
            
            for i, sub in enumerate(subscriptions, 1):
                expiry_dt = datetime.fromisoformat(sub['expiry_date'].replace('Z', '+00:00'))
                days_left = (expiry_dt - datetime.utcnow(timezone.utc)).days
                
                print(f"{i}. {sub['type'].upper()}")
                print(f"   ID: {sub['subscription_id'][:50]}...")
                print(f"   Resource: {sub['resource'][:70]}...")
                print(f"   Expires: {sub['expiry_date']} ({days_left} days left)")
                print(f"   Created: {sub['created_at'][:19]}")
                print()
            
            return subscriptions
            
        except Exception as e:
            print(f"❌ Error listing subscriptions: {e}")
            return []
    
    def find_expiring(self, days: int = 2) -> List[Dict]:
        """Find subscriptions expiring within N days."""
        cutoff_date = (datetime.utcnow() + timedelta(days=days)).isoformat()
        
        try:
            response = self.table.query(
                IndexName='expiry-date-index',
                KeyConditionExpression='#status = :status AND expiry_date <= :cutoff',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'active',
                    ':cutoff': cutoff_date
                }
            )
            
            expiring = response.get('Items', [])
            
            if not expiring:
                print(f"✅ No subscriptions expiring within {days} days")
                return []
            
            print(f"⚠️  {len(expiring)} subscription(s) expiring within {days} days:\n")
            
            for sub in expiring:
                expiry_dt = datetime.fromisoformat(sub['expiry_date'].replace('Z', '+00:00'))
                hours_left = (expiry_dt - datetime.utcnow(timezone.utc)).total_seconds() / 3600
                
                print(f"🔔 {sub['type'].upper()}")
                print(f"   Expires in: {hours_left:.1f} hours")
                print(f"   ID: {sub['subscription_id'][:50]}...")
                print()
            
            return expiring
            
        except Exception as e:
            print(f"❌ Error finding expiring subscriptions: {e}")
            return []
    
    def update_subscription(self, sub_id: str, created_at: str, **updates):
        """Update subscription metadata."""
        
        update_expr = 'SET '
        attr_names = {}
        attr_values = {}
        
        for key, value in updates.items():
            attr_names[f'#{key}'] = key
            attr_values[f':{key}'] = value
            update_expr += f'#{key} = :{key}, '
        
        update_expr = update_expr.rstrip(', ')
        
        try:
            self.table.update_item(
                Key={
                    'subscription_id': sub_id,
                    'created_at': created_at
                },
                UpdateExpression=update_expr,
                ExpressionAttributeNames=attr_names,
                ExpressionAttributeValues=attr_values
            )
            print("✅ Subscription updated")
            return True
        except Exception as e:
            print(f"❌ Error updating subscription: {e}")
            return False
    
    def mark_renewed(self, sub_id: str, created_at: str, new_expiry: str):
        """Mark subscription as renewed."""
        updates = {
            'expiry_date': new_expiry,
            'last_renewed': datetime.utcnow().isoformat(),
            'renewal_count': 1  # Would need increment operation for real
        }
        return self.update_subscription(sub_id, created_at, **updates)
    
    def delete_subscription(self, sub_id: str, created_at: str):
        """Delete subscription (marks as inactive)."""
        updates = {'status': 'inactive'}
        return self.update_subscription(sub_id, created_at, **updates)


def main():
    parser = argparse.ArgumentParser(description='Graph API Subscription Tracker')
    parser.add_argument('--profile', default='tmf-dev', help='AWS profile name')
    
    subparsers = parser.add_subparsers(dest='command', help='Command')
    
    # Create table
    subparsers.add_parser('create-table', help='Create DynamoDB table')
    
    # Save subscription
    save_parser = subparsers.add_parser('save', help='Save subscription')
    save_parser.add_argument('--id', required=True, help='Subscription ID')
    save_parser.add_argument('--resource', required=True, help='Resource path')
    save_parser.add_argument('--expiry', required=True, help='Expiry datetime (ISO format)')
    save_parser.add_argument('--type', default='other', help='Subscription type')
    
    # List subscriptions
    subparsers.add_parser('list', help='List all subscriptions')
    
    # Find expiring
    expiring_parser = subparsers.add_parser('expiring', help='Find expiring subscriptions')
    expiring_parser.add_argument('--days', type=int, default=2, help='Days until expiry')
    
    # Update
    update_parser = subparsers.add_parser('update', help='Update subscription')
    update_parser.add_argument('--id', required=True)
    update_parser.add_argument('--created-at', required=True)
    update_parser.add_argument('--expiry', help='New expiry date')
    
    args = parser.parse_args()
    
    if args.command == 'create-table':
        tracker = SubscriptionTracker(profile=args.profile)
        tracker.create_table()
    
    elif args.command == 'save':
        tracker = SubscriptionTracker(profile=args.profile)
        tracker.save_subscription(args.id, args.resource, args.expiry, args.type)
    
    elif args.command == 'list':
        tracker = SubscriptionTracker(profile=args.profile)
        tracker.list_subscriptions()
    
    elif args.command == 'expiring':
        tracker = SubscriptionTracker(profile=args.profile)
        tracker.find_expiring(args.days)
    
    elif args.command == 'update':
        tracker = SubscriptionTracker(profile=args.profile)
        updates = {}
        if args.expiry:
            updates['expiry_date'] = args.expiry
        tracker.update_subscription(args.id, args.created_at, **updates)
    
    else:
        parser.print_help()


if __name__ == '__main__':
    from datetime import timezone
    main()
