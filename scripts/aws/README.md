# AWS Scripts

## Subscription Management

- **subscription-tracker.py** - CLI tool for tracking Graph API subscriptions in DynamoDB
  - Commands: `save`, `list`, `expiring`, `update`, `create-table`
  - Used after Terraform deployment to record subscription metadata

## Example Usage

```bash
# List subscriptions stored in DynamoDB
python subscription-tracker.py list

# Find subscriptions expiring within 2 days
python subscription-tracker.py expiring --days 2

# Save a new subscription record
python subscription-tracker.py save \
  --id "subscription-id-here" \
  --resource "users/email@domain.com/events" \
  --expiry "2026-02-20T15:30:00Z" \
  --type "calendar"
```

## Lambda Functions

Lambda code is in `lambda/` directory:

- **renewal-function.py** - Automatically renews Graph subscriptions before expiry
  - Triggered daily by EventBridge (default: 2 AM UTC)
  - Queries DynamoDB for subscriptions expiring within 2 days
  - Calls Graph API PATCH to renew each subscription
  - Updates DynamoDB with new expiry dates
