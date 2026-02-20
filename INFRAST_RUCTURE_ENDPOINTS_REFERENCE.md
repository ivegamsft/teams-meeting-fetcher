# Deployed Infrastructure Reference

## Quick Start Testing Commands

### 1. Verify All Infrastructure Components
```bash
# Check terraform state
cd iac
terraform state list | wc -l  # Should show 101 resources

# Get all outputs
terraform output -json | ConvertFrom-Json
```

### 2. Test API Gateway
```bash
# Test API endpoint (should return 401 - protected)
curl -i https://ir04kcl7bl.execute-api.us-east-1.amazonaws.com/dev/graph

# With debug
curl -v https://ir04kcl7bl.execute-api.us-east-1.amazonaws.com/dev/graph
```

### 3. Test Bot Webhook
```bash
# Test webhook endpoint (should return 200)
curl -i https://4ej2x5p7al3tfefz7iiru7kwre0ityts.lambda-url.us-east-1.on.aws/

# With POST data
curl -X POST https://4ej2x5p7al3tfefz7iiru7kwre0ityts.lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

---

## Azure Resource Endpoints

### Event Hub
```
Namespace:    tmf-ehns-eus-6an5wk
Hub Name:     tmf-eh-eus-6an5wk
Connection String: From Key Vault (tmf-kv-eus-6an5wk)
Consumer Groups: tmf-cg-webhooks, tmf-cg-eventhub
```

**Access Events**:
```bash
# Via Event Hub receiver
az eventhub eventhub consumer-group list \
  --namespace-name tmf-ehns-eus-6an5wk \
  --eventhub-name tmf-eh-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk
```

### Storage Account
```
Name:          tmfsteus6an5wk
Resource Group: tmf-rg-eus-6an5wk
Region:        East US
Containers:    (Key Vault stores connection string)
```

### Key Vault
```
Name:                            tmf-kv-eus-6an5wk
Resource Group:                  tmf-rg-eus-6an5wk
Public Network Access:           Enabled (for Terraform)
Client IP Added:                 47.206.222.73
Network ACL Status:              AllowByDefault
```

**Secrets Stored**:
- `eventhub-connection-string`
- `azure-tenant-id`
- `azure-client-id`
- `azure-client-secret`
- `aws-access-key-id`
- `aws-secret-access-key`

### Application Insights
```
Name:                    tmf-appinsights-eus-6an5wk
Connected to Bot Service: Yes
Logs available in Azure Portal dashboard
```

### Bot Service
```
Bot ID:                   a77b8ed1-1ff5-4bcb-bd9b-e4901de03cf4
Display Name:             Teams Meeting Fetcher Bot
Endpoint:                 https://4ej2x5p7al3tfefz7iiru7kwre0ityts.lambda-url.us-east-1.on.aws/
Message Endpoint:         Teams only
App Registration:         a77b8ed1-1ff5-4bcb-bd9b-e4901de03cf4
```

---

## AWS Resource Endpoints

### API Gateway
```
Endpoint:        https://ir04kcl7bl.execute-api.us-east-1.amazonaws.com/dev/graph
Method:          GET
Auth:            API Key Required (from header)
Stage:           dev
Region:          us-east-1
```

**Test with API Key**:
```bash
curl -i -H "x-api-key: YOUR_API_KEY" \
  https://ir04kcl7bl.execute-api.us-east-1.amazonaws.com/dev/graph
```

### Bot Webhook Lambda
```
Function Name:   tmf-meeting-bot-dev
Webhook URL:     https://4ej2x5p7al3tfefz7iiru7kwre0ityts.lambda-url.us-east-1.on.aws/
Handler:         index.handler
Memory:          256 MB
Timeout:         30 seconds
Runtime:         Node.js 18.x
```

### Lambda Functions
```
1. tmf-webhook-writer-dev
   - Processes Event Hub payloads
   - Writes to S3: tmf-webhooks-eus-dev
   - Updates DynamoDB: eventhub-checkpoints
   - Trigger: EventBridge Schedule (1 minute)

2. tmf-eventhub-processor-dev
   - Polls Azure Event Hub
   - Reads new messages
   - Invokes webhook-writer
   - Trigger: EventBridge Schedule (1 minute)

3. tmf-meeting-bot-dev
   - Receives Teams bot messages
   - Public webhook endpoint
   - Runtime: Node.js 18.x
   - Trigger: Direct HTTPS calls
```

**Monitor Logs**:
```bash
# Webhook writer logs
aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev --region us-east-1

# Event Hub processor logs
aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --profile tmf-dev --region us-east-1

# Meeting bot logs
aws logs tail /aws/lambda/tmf-meeting-bot-dev --follow --profile tmf-dev --region us-east-1
```

### S3 Bucket
```
Bucket Name:     tmf-webhooks-eus-dev
Region:          us-east-1
Versioning:      Disabled
Encryption:      SSE-S3
Public Access:   Blocked
Lifecycle Rules: Delete after 30 days
```

**Access Payloads**:
```bash
# List all payloads
aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev --profile tmf-dev --region us-east-1

# Download latest payload
aws s3api get-object \
  --bucket tmf-webhooks-eus-dev \
  --key "webhooks/$(date +%Y-%m-%d)/latest.json" \
  --profile tmf-dev --region us-east-1 \
  payload.json
```

### DynamoDB Tables

#### eventhub-checkpoints
```
Table Name:      eventhub-checkpoints
Primary Key:     partition_id (String)
Sort Key:        None
TTL:             None
Billing:         On-demand

Attributes:
  - partition_id: Event Hub partition (0-15)
  - sequence_number: Latest sequence processed
  - offset: Latest offset in partition
  - checkpoint_timestamp: When last updated
```

**Monitor Checkpoints**:
```bash
aws dynamodb scan --table-name eventhub-checkpoints \
  --profile tmf-dev --region us-east-1 \
  --output table

# Watch for updates
watch -n 5 'aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1 --output table'
```

#### graph_subscriptions
```
Table Name:      graph_subscriptions
Primary Key:     subscription_id (String)
Attributes:
  - subscription_id: Microsoft Graph subscription ID
  - resource_path: What resource (e.g., /groups/{id}/events)
  - notification_url: Where Graph sends notifications
  - expiration: When subscription expires
  - created_at: Creation timestamp
  - renewed_at: Last renewal timestamp
```

#### meetings
```
Table Name:      meetings
Primary Key:     meeting_id (String)
Sort Key:        event_timestamp
Attributes:
  - meeting_id: Unique meeting identifier
  - event_timestamp: When meeting was created/updated
  - organizer_id: Teams user who created meeting
  - group_id: Teams group context
  - title: Meeting title
  - start_time: Meeting start datetime
  - end_time: Meeting end datetime
  - payload: Raw event payload (JSON)
```

### EventBridge Schedules
```
1. Poll Event Hub
   - Name:     tmf-eventhub-poll-schedule-dev
   - Rate:     5 minutes
   - Target:   Lambda: tmf-eventhub-processor-dev
   - Status:   Active

2. Renew Subscriptions
   - Name:     tmf-subscription-renewal-schedule-dev
   - Rate:     Daily at 00:05 UTC
   - Target:   Lambda: tmf-renewal-function (or SNS)
   - Status:   Active
```

### SNS Topics
```
Topics Available:
  - tmf-eventhub-processor-topic-dev
  - tmf-webhook-writer-topic-dev

Subscribed to:
  - CloudWatch (for custom metrics)
  - Email notifications (if configured)
```

### CloudWatch Logs
```
Log Groups:
  - /aws/lambda/tmf-webhook-writer-dev
  - /aws/lambda/tmf-eventhub-processor-dev
  - /aws/lambda/tmf-meeting-bot-dev
  - /aws/apigateway/ir04kcl7bl
  
Retention:        14 days (default)
Insights Available: Yes
```

---

## Key Resource IDs

| Resource | ID |
|----------|-----|
| Tenant ID | 62837751-4e48-4d06-8bcb-57be1a669b78 |
| Graph App ID | 1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8 |
| Bot App ID | a77b8ed1-1ff5-4bcb-bd9b-e4901de03cf4 |
| Allowed Group ID | 5e7708f8-b0d2-467d-97f9-d9da4818084a |
| AWS Account | 833337371676 |
| AWS Region | us-east-1 |
| AWS Profile | tmf-dev |

---

## Network Configuration

### Azure Firewalls
- **Key Vault**: Public access enabled from 47.206.222.73
- **Event Hub**: Open to configured namespaces
- **Storage** Account: Open access

### AWS Security Groups
- **API Gateway**: HTTPS only (port 443)
- **Lambda**: VPC: No (public)
- **S3**: Bucket policy: Private, no public access

### Networking
- **Terraform Public IP**: 47.206.222.73
- **Lambda Subnets**: Default VPC
- **Event Hub to Lambda**: Direct HTTPS (no VPC peering needed)

---

## Health Checks & Monitoring

### Check All Services Running
```bash
# Event Hub
az eventhub namespace show --name tmf-ehns-eus-6an5wk --resource-group tmf-rg-eus-6an5wk

# S3 (verify exists and accessible)
aws s3api list-buckets --profile tmf-dev --region us-east-1 | grep tmf-webhooks

# DynamoDB (verify tables)
aws dynamodb list-tables --profile tmf-dev --region us-east-1

# Lambda (verify functions)
aws lambda list-functions --profile tmf-dev --region us-east-1 --query 'Functions[?contains(FunctionName, `tmf-`)]'

# API Gateway
aws apigateway get-rest-apis --region us-east-1 --profile tmf-dev
```

### Monitor Lambda Performance
```bash
# Recent invocations
aws lambda invoke \
  --function-name tmf-webhook-writer-dev \
  --log-type Tail \
  --profile tmf-dev \
  --region us-east-1 \
  /tmp/response.json && cat /tmp/response.json
```

---

## Tenant Verification

**ALWAYS verify tenant before modifying Azure resources**:
```bash
az account show --query "tenantId" --output tsv
# Expected: 62837751-4e48-4d06-8bcb-57be1a669b78

# If wrong, switch:
az login --tenant 62837751-4e48-4d06-8bcb-57be1a669b78
```

