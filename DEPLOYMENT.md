# Deployment Guide

## Prerequisites

- Azure app registration with Graph API permissions
- AWS CLI configured with `tmf-dev` profile
- Terraform >= 1.0
- Python 3.11+

## 1. Set Credentials in Terraform

Update `iac/aws/terraform.tfvars` with your Azure credentials:

```hcl
# Azure Graph API credentials (for subscription renewal Lambda)
graph_tenant_id     = "YOUR_TENANT_ID"        # From: az account list
graph_client_id     = "YOUR_CLIENT_ID"        # Your app registration ID
graph_client_secret = "YOUR_CLIENT_SECRET"    # From Azure Entra ID
renewal_schedule_expression = "cron(0 2 * * ? *)"  # 2 AM UTC daily
```

## 2. Deploy Infrastructure

```bash
cd iac/aws

# Initialize Terraform
terraform init

# Preview changes
terraform plan -out=tfplan

# Deploy
terraform apply tfplan
```

This creates:

- **DynamoDB table**: `graph-subscriptions` (stores subscription metadata and renewal tracking)
- **Lambda function**: Renewal handler (runs daily at 2 AM UTC to renew expiring subscriptions)
- **EventBridge rule**: Triggers Lambda on schedule
- **CloudWatch logs**: Lambda execution logs (14-day retention)
- **CloudWatch alarm**: Alerts on renewal failures

## 3. Save Current Subscriptions to DynamoDB

After Terraform deployment, record your existing Graph API subscriptions:

```bash
python scripts/aws/subscription-tracker.py save \
  --id "05b3417a-89c9-4831-8282-04b834767f0d" \
  --resource "users/boldoriole@ibuyspy.net/events" \
  --expiry "2026-02-13T22:30:15Z" \
  --type "calendar"

python scripts/aws/subscription-tracker.py save \
  --id "15e81c83-f8e8-4f0c-8108-2c3a65451c91" \
  --resource "users/boldoriole@ibuyspy.net/onlineMeetings/getAllTranscripts(...)" \
  --expiry "2026-02-14T03:34:59Z" \
  --type "transcript"
```

## 4. Verify Deployment

```bash
# List subscriptions in DynamoDB
python scripts/aws/subscription-tracker.py list

# Monitor Lambda logs
aws logs tail /aws/lambda/tmf-subscription-renewal-dev --follow --profile tmf-dev
```

## 5. Monitor Renewals

Lambda runs automatically daily at 2 AM UTC:

- Queries DynamoDB for subscriptions expiring within 2 days
- Calls Graph API PATCH to each subscription
- Updates DynamoDB with new expiry dates
- Logs results to CloudWatch

Check renewal status:

```bash
aws logs tail /aws/lambda/tmf-subscription-renewal-dev --since 5m --profile tmf-dev
```

## Troubleshooting

**Lambda not running?**

- Check EventBridge rule exists: `terraform output renewal_eventbridge_rule_name`
- Check Lambda permissions: Look for `AllowEventBridgeInvoke` in IAM

**Credentials not working?**

- Verify client secret in Secrets Manager: `aws secretsmanager get-secret-value --secret-id graph-client-secret --profile tmf-dev`
- Check Graph API token generation with: `python scripts/graph/01-verify-setup.py`

**Subscriptions not renewing?**

- Check Lambda logs: `aws logs tail /aws/lambda/tmf-subscription-renewal-dev --profile tmf-dev`
- Verify DynamoDB table created: `aws dynamodb list-tables --profile tmf-dev | grep graph-subscriptions`

## Rollback

To remove all infrastructure:

```bash
cd iac/aws
terraform destroy
```
