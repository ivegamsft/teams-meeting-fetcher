# Subscription Renewal Module

Automatically renews Microsoft Graph API subscriptions before they expire.

## Features

- **Scheduled Lambda Function**: Runs daily to check for expiring subscriptions
- **DynamoDB Integration**: Queries the subscriptions table for items expiring within 2 days
- **Automatic Renewal**: Calls Graph API to extend subscription expiry dates
- **Audit Trail**: Tracks renewal attempts and counts
- **Monitoring**: CloudWatch logs and alarms for Lambda failures
- **Error Handling**: Dead Letter Queue support for failed invocations

## What It Does

```
Every day at 2 AM UTC:
  1. Lambda queried DynamoDB for subscriptions expiring within 2 days
  2. For each expiring subscription:
     - Call Graph API PATCH /subscriptions/{id}
     - Extend expiry date by 24 hours
     - Update DynamoDB with new expiry and renewal count
  3. Log all renewal attempts
  4. Alert on failures via SNS
```

## Architecture

```
CloudWatch Events (EventBridge)
         ↓ (Daily schedule)
Invoke Lambda Function
         ↓
Query DynamoDB (expiry-date-index)
         ↓
For each subscription:
  - Call Graph API PATCH
  - Update DynamoDB
         ↓
Log to CloudWatch Logs
         ↓
Failed? → SNS Notification
```

## Inputs

| Variable                      | Type   | Required | Description                                        |
| ----------------------------- | ------ | -------- | -------------------------------------------------- |
| `environment`                 | string | Yes      | Environment name (dev, staging, prod)              |
| `aws_region`                  | string | Yes      | AWS region                                         |
| `aws_account_id`              | string | Yes      | AWS account ID                                     |
| `subscriptions_table_name`    | string | No       | DynamoDB table name (default: graph-subscriptions) |
| `subscriptions_table_arn`     | string | Yes      | DynamoDB table ARN                                 |
| `graph_tenant_id`             | string | Yes      | Microsoft Graph tenant ID                          |
| `graph_client_id`             | string | Yes      | Graph app client ID                                |
| `graph_client_secret`         | string | Yes      | Graph app client secret                            |
| `renewal_schedule_expression` | string | No       | Cron expression for schedule (default: 2 AM UTC)   |
| `lambda_source_file`          | string | No       | Path to renewal-function.py                        |
| `alarm_actions`               | list   | No       | SNS topic ARNs for alarm notifications             |

## Outputs

| Output                  | Description                  |
| ----------------------- | ---------------------------- |
| `lambda_function_name`  | Name of the renewal Lambda   |
| `lambda_function_arn`   | ARN of the renewal Lambda    |
| `eventbridge_rule_name` | Name of the EventBridge rule |
| `log_group_name`        | CloudWatch log group name    |

## IAM Permissions

The Lambda function requires:

- **DynamoDB**: Query, UpdateItem, GetItem on subscriptions table
- **Secrets Manager**: GetSecretValue for Graph credentials
- **CloudWatch Logs**: CreateLogGroup, CreateLogStream, PutLogEvents
- **EventBridge**: Invocation permission (auto-granted)

## Usage

### Deploy with Terraform

```hcl
module "subscription_renewal" {
  source = "./modules/subscription-renewal"

  environment              = "dev"
  aws_region               = "us-east-1"
  aws_account_id           = "123456789012"
  subscriptions_table_arn  = module.storage.subscriptions_table_arn
  graph_tenant_id          = var.graph_tenant_id
  graph_client_id          = var.graph_client_id
  graph_client_secret      = var.graph_client_secret
  alarm_actions            = [module.notifications.topic_arn]
}
```

### Monitor Renewal

```bash
# View Lambda logs
aws logs tail /aws/lambda/tmf-subscription-renewal-dev --follow

# Check CloudWatch alarm status
aws cloudwatch describe-alarms --alarm-names tmf-subscription-renewal-errors-dev

# Query renewal history in DynamoDB
aws dynamodb query \
  --table-name graph-subscriptions \
  --index-name expiry-date-index \
  --key-condition-expression "status = :status" \
  --expression-attribute-values "{\":status\": {\"S\": \"active\"}}"
```

## Configuration

### Change Renewal Schedule

Update `renewal_schedule_expression` in `terraform.tfvars`:

```
# Every Sunday at 3 PM UTC
renewal_schedule_expression = "cron(0 15 ? * SUN *)"

# Every 6 hours
renewal_schedule_expression = "cron(0 */6 * * ? *)"

# Every weekday at 9 AM UTC
renewal_schedule_expression = "cron(0 9 ? * MON-FRI *)"
```

### Change Renewal Schedule

Edit variables:

```hcl
lambda_source_file = "path/to/custom-renewal-function.py"
log_retention_days = 30
```

## Troubleshooting

### Lambda fails to invoke

```bash
# Check EventBridge rule
aws events describe-rule --name tmf-renew-subscriptions-dev

# Check Lambda permissions
aws lambda get-policy --function-name tmf-subscription-renewal-dev

# Check logs
aws logs tail /aws/lambda/tmf-subscription-renewal-dev --follow
```

### Subscriptions not renewing

```bash
# Check DynamoDB table permissions
aws dynamodb describe-table --table-name graph-subscriptions

# Manually test renewal
aws lambda invoke \
  --function-name tmf-subscription-renewal-dev \
  --payload '{}' \
  output.json && cat output.json
```

### Graph API authentication fails

Verify credentials:

```bash
# Check Graph credentials in Lambda environment
aws lambda get-function-configuration \
  --function-name tmf-subscription-renewal-dev \
  | jq '.Environment.Variables'
```

## Dependencies

- **Terraform**: subscription_tracker and renewal-function.py scripts
- **AWS Services**: Lambda, DynamoDB, EventBridge, CloudWatch, IAM
- **External**: Microsoft Graph API
- **Python Libraries**: requests (provided in Lambda layer)

## Files

- `main.tf` - Lambda function, IAM roles, EventBridge, CloudWatch resources
- `variables.tf` - Input variables
- `outputs.tf` - Output values
- `../../../lambda/renewal-function.py` - Actual renewal Lambda code

## See Also

- [subscription_tracker.py](../../../subscription_tracker.py) - CLI tool to manage subscriptions locally
- [SUBSCRIPTION_STORAGE.md](../../../docs/SUBSCRIPTION_STORAGE.md) - Subscription storage architecture
- [Terraform AWS Lambda Module Docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function)
- [AWS EventBridge Documentation](https://docs.aws.amazon.com/eventbridge/)
