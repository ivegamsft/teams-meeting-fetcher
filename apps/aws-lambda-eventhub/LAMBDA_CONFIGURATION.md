# AWS Lambda EventHub Configuration Guide

## Overview

This Lambda function reads change notifications from Azure EventHub and processes them with read-only access through RBAC.

## Deployment

### Step 1: Deploy Infrastructure

The infrastructure is managed by Terraform in the `iac/` folder. A dedicated Service Principal for Lambda is created with **read-only** access to EventHub.

```bash
cd iac
terraform plan
terraform apply
```

### Step 2: Extract Lambda Credentials

After deployment, retrieve the Lambda SPN credentials:

```bash
cd iac
terraform output -json lambda_client_id
terraform output -json lambda_client_secret  # (sensitive)
terraform output lambda_tenant_id
```

Or extract all values at once:

```bash
cat > lambda-env.txt << EOF
AZURE_TENANT_ID=$(terraform output -raw lambda_tenant_id)
AZURE_CLIENT_ID=$(terraform output -raw lambda_client_id)
AZURE_CLIENT_SECRET=$(terraform output -raw -json lambda_client_secret)
EVENT_HUB_NAMESPACE=$(terraform output -raw eventhub_namespace_name)
EVENT_HUB_NAME=$(terraform output -raw eventhub_name)
CONSUMER_GROUP=$(terraform output -raw eventhub_lambda_consumer_group)
AWS_REGION=us-east-1
BUCKET_NAME=<your-bucket-name>
EVENTHUB_CHECKPOINT_TABLE=<optional-checkpoint-table>
EOF
```

## Environment Variables (Required)

| Variable              | Description                       | Example                                             |
| --------------------- | --------------------------------- | --------------------------------------------------- |
| `AZURE_TENANT_ID`     | Azure AD tenant ID                | `<from-terraform-lambda_tenant_id>`                 |
| `AZURE_CLIENT_ID`     | Service Principal client ID       | `<from-terraform-lambda_client_id>`                 |
| `AZURE_CLIENT_SECRET` | Service Principal secret          | `<from-terraform-lambda_client_secret>` (sensitive) |
| `EVENT_HUB_NAMESPACE` | EventHub namespace (name or FQDN) | `<from-terraform-eventhub_namespace_name>`          |
| `EVENT_HUB_NAME`      | EventHub name                     | `<from-terraform-eventhub_name>`                    |
| `CONSUMER_GROUP`      | Consumer group name               | `<from-terraform-eventhub_lambda_consumer_group>`   |
| `BUCKET_NAME`         | S3 bucket for message output      | `<your-bucket-name>`                                |

## Environment Variables (Optional)

| Variable                        | Description                                     | Default                    |
| ------------------------------- | ----------------------------------------------- | -------------------------- |
| `PARTITION_IDS`                 | Comma-separated partition IDs to read           | Auto-detect all partitions |
| `EVENTHUB_CHECKPOINT_TABLE`     | DynamoDB table for checkpoints                  | (disabled if not set)      |
| `EVENT_HUB_MAX_EVENTS`          | Max events to read per invocation               | `50`                       |
| `EVENT_HUB_POLL_WINDOW_MINUTES` | Time window when no checkpoint exists (minutes) | `10`                       |
| `MESSAGE_PROCESSING_MODE`       | `consume` or `peek`                             | `consume`                  |
| `AWS_REGION`                    | AWS region for S3                               | `us-east-1`                |

## Lambda Configuration

1. **Runtime**: Node.js 20 (or later)
2. **Handler**: `handler.handler`
3. **Memory**: 256 MB
4. **Timeout**: 30 seconds
5. **Execution Role**: Needs S3 `PutObject` permission if outputting to S3

## Handler Improvements

The handler (`handler.js`) includes the following production-ready features:

### Namespace Format Flexibility

- **Accepts both**: namespace-only names (`tmf-ehns-eus-6an5wk`) and FQDN (`tmf-ehns-eus-6an5wk.servicebus.windows.net`)
- **Smart parsing**: Detects if input is FQDN and extracts namespace automatically
- **Eliminates** past ambiguity about whether FQDN was required

### Required Environment Variables

- **`CONSUMER_GROUP` is now required** (no hardcoded defaults)
- Throws clear error if missing, preventing silent failures
- Enables multiple independent consumer groups for different workloads

### Flexible Partition Reading

- **`PARTITION_IDS` is optional** (comma-separated list, e.g., `0,1` or just `0`)
- **Auto-detects all partitions** if not specified
- Calls `getPartitionIds()` to discover available partitions
- Supports both single-partition and multi-partition scenarios
- Logs which partitions are being read

### RBAC Access Checks

- **EventHub**: Validates RBAC access by listing partition IDs before reading
- **S3**: Validates bucket access with `HeadBucket`
- **DynamoDB**: Validates checkpoint table access with `DescribeTable` (if configured)

### Minimal IAM Policy

If Lambda needs to write to S3:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::your-bucket/eventhub-reads/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::your-bucket"
    }
  ]
}
```

If DynamoDB checkpoints are enabled:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DescribeTable"],
      "Resource": "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/your-checkpoint-table"
    }
  ]
}
```

## Permissions

The Lambda Service Principal has:

- ✅ **Azure Event Hubs Data Receiver** role on EventHub namespace (read-only)
- ❌ **No write permissions** to EventHub
- ✅ **Required**: S3 `PutObject` and `ListBucket` on the output bucket
- ✅ **Optional**: DynamoDB table permissions for checkpointing

## Deployment via AWS CloudFormation

Package and deploy:

```bash
# Build the function package
cd apps/aws-lambda-eventhub
npm install
zip -r lambda.zip handler.js node_modules/

# Update Lambda function
aws lambda update-function-code \
  --function-name tmf-eventhub-processor-dev \
  --zip-file fileb://lambda.zip \
  --profile tmf-dev \
  --region us-east-1

# Set environment variables
aws lambda update-function-configuration \
  --function-name tmf-eventhub-processor-dev \
  --environment Variables={
    AZURE_TENANT_ID=...,
    AZURE_CLIENT_ID=...,
    AZURE_CLIENT_SECRET=...,
    EVENT_HUB_NAMESPACE=...,
    EVENT_HUB_NAME=...,
    CONSUMER_GROUP=...,
    BUCKET_NAME=...,
    EVENTHUB_CHECKPOINT_TABLE=...,
    PARTITION_IDS=...,
    MESSAGE_PROCESSING_MODE=...,
    AWS_REGION=us-east-1,
    EVENT_HUB_MAX_EVENTS=...,
    EVENT_HUB_POLL_WINDOW_MINUTES=...
  } \
  --profile tmf-dev \
  --region us-east-1
```

## Testing

Invoke the function manually:

```bash
aws lambda invoke \
  --function-name tmf-eventhub-processor-dev \
  --profile tmf-dev \
  --region us-east-1 \
  --log-type Tail \
  response.json

cat response.json
```

View logs:

```bash
aws logs tail /aws/lambda/tmf-eventhub-processor-dev \
  --follow \
  --profile tmf-dev \
  --region us-east-1
```

## Troubleshooting

### "Missing Azure credentials" error

Ensure all `AZURE_*` environment variables are set in Lambda configuration.

### "Azure Event Hubs Data Receiver" role not assigned

Verify the service principal has the correct role:

```bash
az role assignment list \
  --assignee <lambda-client-id> \
  --scope <eventhub-namespace-id>
```

### Connection timeout to EventHub

- Check Network: Lambda execution environment must have network access to Azure
- Check RBAC: Service principal must have required permissions
- Check Credentials: Verify `AZURE_CLIENT_SECRET` is correct

### S3 access check failed

- Verify `BUCKET_NAME` exists
- Ensure Lambda execution role has `s3:ListBucket` and `s3:PutObject`

### DynamoDB access check failed

- Verify `EVENTHUB_CHECKPOINT_TABLE` exists
- Ensure Lambda execution role has `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:DescribeTable`

### No messages read

- Verify EventHub has messages (check retention period - default 24 hours)
- Verify consumer group exists
- Check `PARTITION_IDS` if specified - partitions must exist

## Handler Output

### Success Response

```json
{
  "statusCode": 200,
  "version": "$LATEST",
  "requestId": "...",
  "messages": 5,
  "timestamp": "2026-02-21T20:00:00.000Z"
}
```

### Error Response

```json
{
  "statusCode": 500,
  "error": "Missing EventHub config...",
  "requestId": "...",
  "timestamp": "2026-02-21T20:00:00.000Z"
}
```

## S3 Output Format

Messages are written to:

```
s3://bucket/eventhub-reads/2026-02-21T20:00:00.000Z.json
```

Example output:

```json
{
  "timestamp": "2026-02-21T20:00:00.000Z",
  "count": 3,
  "messages": [
    {
      "sequenceNumber": 129,
      "offset": "1024",
      "enqueuedTime": "2026-02-21T19:59:00.000Z",
      "body": "{...}"
    }
  ]
}
```

## References

- [Terraform IaC Configuration](../../iac/README.md)
- [Azure EventHub Documentation](https://docs.microsoft.com/en-us/azure/event-hubs/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
