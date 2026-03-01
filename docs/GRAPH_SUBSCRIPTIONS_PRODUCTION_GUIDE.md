# Graph Subscriptions Production Quick Reference

**Use this guide for implementing Graph API subscriptions in production.**

---

## ✅ WORKING PATTERN: Individual User Calendar Subscriptions

### Configuration

```python
GRAPH_CONFIG = {
    'tenant_id': os.getenv('GRAPH_TENANT_ID'),
    'client_id': os.getenv('GRAPH_CLIENT_ID'),
    'client_secret': os.getenv('GRAPH_CLIENT_SECRET'),
    'eventhub_namespace': os.getenv('EVENT_HUB_NAMESPACE'),
    'eventhub_name': os.getenv('EVENT_HUB_NAME'),
    'tenant_domain': os.getenv('TENANT_DOMAIN', '<YOUR_TENANT_DOMAIN>'),
}
```

### Authentication

```python
from msal import ConfidentialClientApplication

def get_graph_token():
    """Get access token using service principal"""
    app = ConfidentialClientApplication(
        GRAPH_CONFIG['client_id'],
        authority=f"https://login.microsoftonline.com/{GRAPH_CONFIG['tenant_id']}",
        client_credential=GRAPH_CONFIG['client_secret']
    )

    result = app.acquire_token_for_client(
        scopes=["https://graph.microsoft.com/.default"]
    )

    if "access_token" not in result:
        raise Exception(f"Auth failed: {result.get('error_description')}")

    return result["access_token"]
```

### Create Subscription for Single User

```python
import requests
from datetime import datetime, timedelta, timezone

def create_user_subscription(user_id, token):
    """Create calendar subscription for a user"""

    # Event Hub notification URL (CRITICAL: include Enqueued = 2026-02-20 17:55:09.778000+00:eventhubname/ and ?tenantId=)
    notification_url = (
        f"EventHub:https://{GRAPH_CONFIG['eventhub_namespace']}.servicebus.windows.net/"
        f"eventhubname/{GRAPH_CONFIG['eventhub_name']}?tenantId={GRAPH_CONFIG['tenant_domain']}"
    )

    # Max expiration for calendar events: 48 hours
    expiration = (datetime.now(timezone.utc) + timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")

    subscription = {
        "changeType": "created,updated,deleted",
        "notificationUrl": notification_url,
        "resource": f"/users/{user_id}/events",
        "expirationDateTime": expiration,
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    response = requests.post(
        "https://graph.microsoft.com/v1.0/subscriptions",
        headers=headers,
        json=subscription,
        timeout=30
    )

    if response.status_code in [200, 201]:
        result = response.json()
        return {
            'subscription_id': result['id'],
            'expiration': result['expirationDateTime'],
            'resource': result['resource']
        }
    else:
        raise Exception(f"Failed to create subscription: {response.status_code} - {response.text[:200]}")
```

### Monitor All Users in a Group

```python
def get_group_members(group_id, token):
    """Get all user members of a group"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    response = requests.get(
        f"https://graph.microsoft.com/v1.0/groups/{group_id}/members",
        headers=headers,
        timeout=30
    )

    if response.status_code == 200:
        members_data = response.json().get('value', [])
        # Filter to only user objects (excludes groups, devices, etc.)
        users = [m for m in members_data if m.get('@odata.type') == '#microsoft.graph.user']
        return users
    else:
        raise Exception(f"Failed to get members: {response.status_code}")

def create_group_monitoring(group_id, token):
    """Create subscriptions for all members of a group"""
    members = get_group_members(group_id, token)

    subscriptions = {}
    for member in members:
        user_id = member.get('id')
        user_principal = member.get('userPrincipalName')

        try:
            sub = create_user_subscription(user_id, token)
            subscriptions[user_id] = {
                'user_principal': user_principal,
                'subscription_id': sub['subscription_id'],
                'expiration': sub['expiration']
            }
            print(f"✅ Created subscription for {user_principal}")
        except Exception as e:
            print(f"❌ Failed for {user_principal}: {e}")
            # Continue with other users

    return subscriptions
```

### Renew Subscription

```python
def renew_subscription(subscription_id, token):
    """Renew a subscription before it expires"""

    # Extend by another 48 hours
    new_expiration = (datetime.now(timezone.utc) + timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    patch_data = {
        "expirationDateTime": new_expiration
    }

    response = requests.patch(
        f"https://graph.microsoft.com/v1.0/subscriptions/{subscription_id}",
        headers=headers,
        json=patch_data,
        timeout=30
    )

    if response.status_code == 200:
        result = response.json()
        return result['expirationDateTime']
    else:
        raise Exception(f"Failed to renew: {response.status_code} - {response.text[:200]}")
```

### Delete Subscription

```python
def delete_subscription(subscription_id, token):
    """Delete a subscription"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    response = requests.delete(
        f"https://graph.microsoft.com/v1.0/subscriptions/{subscription_id}",
        headers=headers,
        timeout=30
    )

    if response.status_code == 204:
        return True
    else:
        raise Exception(f"Failed to delete: {response.status_code}")
```

### List All Subscriptions

```python
def list_subscriptions(token):
    """List all subscriptions for the application"""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    response = requests.get(
        "https://graph.microsoft.com/v1.0/subscriptions",
        headers=headers,
        timeout=30
    )

    if response.status_code == 200:
        return response.json().get('value', [])
    else:
        raise Exception(f"Failed to list: {response.status_code}")
```

---

## Production Workflow

### 1. Initial Setup

```python
# Get access token
token = get_graph_token()

# Set up monitoring for a group
group_id = '<YOUR_GROUP_ID>'
subscriptions = create_group_monitoring(group_id, token)

# Store subscription IDs in database/S3
save_subscriptions(subscriptions)
```

### 2. Daily Membership Sync

```python
def sync_group_subscriptions(group_id):
    """Sync subscriptions with current group membership"""
    token = get_graph_token()

    # Get current members
    current_members = get_group_members(group_id, token)
    current_member_ids = {m['id'] for m in current_members}

    # Get existing subscriptions from database
    existing_subs = load_subscriptions_from_db(group_id)
    existing_member_ids = set(existing_subs.keys())

    # Add subscriptions for new members
    new_members = current_member_ids - existing_member_ids
    for user_id in new_members:
        try:
            sub = create_user_subscription(user_id, token)
            save_subscription_to_db(user_id, sub)
            print(f"✅ Added subscription for new member {user_id}")
        except Exception as e:
            print(f"❌ Failed to add {user_id}: {e}")

    # Remove subscriptions for departed members
    departed_members = existing_member_ids - current_member_ids
    for user_id in departed_members:
        try:
            sub_id = existing_subs[user_id]['subscription_id']
            delete_subscription(sub_id, token)
            remove_subscription_from_db(user_id)
            print(f"✅ Removed subscription for departed member {user_id}")
        except Exception as e:
            print(f"❌ Failed to remove {user_id}: {e}")

    print(f"Sync complete: {len(new_members)} added, {len(departed_members)} removed")
```

### 3. Hourly Subscription Renewal

```python
def renew_expiring_subscriptions():
    """Renew subscriptions that expire in next 24 hours"""
    token = get_graph_token()

    # Get all subscriptions from database
    all_subs = load_all_subscriptions_from_db()

    now = datetime.now(timezone.utc)
    renewal_threshold = now + timedelta(hours=24)

    for user_id, sub_info in all_subs.items():
        expiration = datetime.fromisoformat(sub_info['expiration'].replace('Z', '+00:00'))

        if expiration < renewal_threshold:
            try:
                new_expiration = renew_subscription(sub_info['subscription_id'], token)
                update_subscription_expiration(user_id, new_expiration)
                print(f"✅ Renewed subscription for {user_id}")
            except Exception as e:
                print(f"❌ Failed to renew {user_id}: {e}")
                # Subscription may have been deleted - recreate it
                try:
                    new_sub = create_user_subscription(user_id, token)
                    save_subscription_to_db(user_id, new_sub)
                    print(f"✅ Recreated subscription for {user_id}")
                except Exception as e2:
                    print(f"❌ Failed to recreate {user_id}: {e2}")
```

### 4. Scheduled Lambda/Function Implementation

```python
# Lambda function for subscription management
def lambda_handler(event, context):
    """
    Scheduled Lambda to manage subscriptions
    Run every hour via EventBridge
    """

    # Renew expiring subscriptions
    renew_expiring_subscriptions()

    # Sync membership (only once per day)
    current_hour = datetime.now(timezone.utc).hour
    if current_hour == 3:  # 3 AM UTC
        group_id = os.environ['MONITORED_GROUP_ID']
        sync_group_subscriptions(group_id)

    return {
        'statusCode': 200,
        'body': 'Subscription management complete'
    }
```

---

## Database Schema

### Subscriptions Table

Store subscription information for tracking and renewal:

```python
# DynamoDB schema example
{
    'user_id': 'dbb98842-0024-4474-a69a-a27acd7...',  # Partition key
    'subscription_id': '<SUBSCRIPTION_ID_1>',
    'user_principal': 'user1@<YOUR_TENANT_DOMAIN>',
    'group_id': '<YOUR_GROUP_ID>',
    'resource': '/users/dbb98842-0024-4474-a69a-a27acd7.../events',
    'expiration': '2026-02-22T17:47:00Z',
    'created_at': '2026-02-20T17:47:00Z',
    'last_renewed': '2026-02-21T15:30:00Z',
    'status': 'active'  # active, expired, error
}
```

### Group Monitoring Table

Track which groups are being monitored:

```python
{
    'group_id': '<YOUR_GROUP_ID>',  # Partition key
    'group_name': 'Teams Meeting Fetcher Admins',
    'member_count': 2,
    'subscription_count': 2,
    'last_sync': '2026-02-20T17:54:58Z',
    'enabled': True
}
```

---

## Error Handling

### Common Graph API Errors

```python
def create_subscription_with_retry(user_id, token, max_retries=3):
    """Create subscription with retry logic"""

    for attempt in range(max_retries):
        try:
            return create_user_subscription(user_id, token)
        except Exception as e:
            error_msg = str(e)

            # User mailbox not found - skip this user
            if '404' in error_msg or 'NotFound' in error_msg:
                print(f"⚠️  User {user_id} mailbox not found - skipping")
                return None

            # Throttling - wait and retry
            if '429' in error_msg or 'throttled' in error_msg.lower():
                wait_time = 2 ** attempt  # Exponential backoff
                print(f"⚠️  Throttled, waiting {wait_time}s...")
                time.sleep(wait_time)
                continue

            # Permission errors - log and skip
            if '403' in error_msg or 'Forbidden' in error_msg:
                print(f"❌ Permission denied for {user_id}")
                return None

            # Other errors - retry
            if attempt < max_retries - 1:
                print(f"⚠️  Attempt {attempt + 1} failed, retrying...")
                time.sleep(1)
            else:
                print(f"❌ Final attempt failed for {user_id}: {error_msg}")
                raise
```

---

## Monitoring and Alerting

### CloudWatch Metrics

Track these metrics:

1. **Active Subscriptions**: Total count by group
2. **Renewals**: Successful/failed renewals per hour
3. **Sync Operations**: Successful/failed syncs per day
4. **Notifications Received**: Count from Event Hub
5. **Lambda Errors**: Subscription management errors

### Alerts to Set Up

1. **Subscription expiring soon**: Alert if renewal fails
2. **High error rate**: > 5% subscription creation failures
3. **Event Hub lag**: Notifications delayed > 1 minute
4. **Lambda failures**: Subscription management Lambda errors

---

## Testing Checklist

Before deploying to production:

- [ ] Test subscription creation for 10+ users
- [ ] Verify notifications arrive within 5 seconds
- [ ] Test renewal logic (manually expire subscription)
- [ ] Test membership sync (add/remove group member)
- [ ] Test error handling (invalid user ID)
- [ ] Test throttling handling (create 100+ subscriptions rapidly)
- [ ] Verify Lambda processes notifications correctly
- [ ] Test with high volume (100+ concurrent meetings)
- [ ] Verify subscription cleanup works
- [ ] Test disaster recovery (recreate all subscriptions)

---

## Performance Considerations

### Subscription Creation

- **Time per subscription**: ~500ms (Graph API call)
- **100 users**: ~50 seconds sequentially
- **Optimization**: Parallel creation with ThreadPoolExecutor (max 10 threads)

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def create_subscriptions_parallel(user_ids, token, max_workers=10):
    """Create subscriptions in parallel"""

    subscriptions = {}

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_user = {
            executor.submit(create_subscription_with_retry, user_id, token): user_id
            for user_id in user_ids
        }

        for future in as_completed(future_to_user):
            user_id = future_to_user[future]
            try:
                result = future.result()
                if result:
                    subscriptions[user_id] = result
            except Exception as e:
                print(f"❌ Failed {user_id}: {e}")

    return subscriptions
```

### Event Hub Processing

- **Lambda concurrency**: Start with reserved concurrency of 5
- **Batch size**: 100 messages per batch (default)
- **Processing time**: < 100ms per message
- **Checkpoint frequency**: Every 10 seconds

---

## Security Best Practices

1. **Store secrets securely**:
   - Use AWS Secrets Manager for client secret
   - Never commit credentials to code
   - Rotate client secret annually

2. **Least privilege permissions**:
   - Only grant required Graph API permissions
   - Use separate service principals for dev/prod
   - Monitor permission usage

3. **Validate notification origin**:
   - Verify notifications come from Graph API
   - Check subscription ID matches expected
   - Validate notification schema

4. **Rate limiting**:
   - Respect Graph API throttling limits
   - Implement exponential backoff
   - Queue subscription operations if needed

---

## References

- Test Results: [GRAPH_SUBSCRIPTIONS_TEST_RESULTS.md](./GRAPH_SUBSCRIPTIONS_TEST_RESULTS.md)
- Setup Guide: [GRAPH_SUBSCRIPTIONS_SETUP.md](./GRAPH_SUBSCRIPTIONS_SETUP.md)
- Graph API Docs: https://learn.microsoft.com/graph/api/subscription-post-subscriptions
- Event Hub Notification URL Format: Must include `/eventhubname/` path segment and `?tenantId=` parameter
