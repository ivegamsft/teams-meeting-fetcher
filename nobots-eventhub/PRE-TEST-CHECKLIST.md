# Pre-Test Verification Checklist

Use this to verify everything is ready before running the E2E test.

## Infrastructure Deployment (2 minutes)

```bash
cd iac

# 1. Check Terraform state
terraform state list | wc -l
# Expected: 101 resources

# 2. Verify outputs exist
terraform output -json | ConvertFrom-Json | Get-Member -MemberType NoteProperty
# Expected: event_hub_*, s3_*, dynamodb_*, lambda_*
```

**Status**:
- [ ] 101 resources in state
- [ ] All Terraform outputs present

---

## Azure Resources (1 minute)

```bash
# 1. Event Hub accessible
az eventhub namespace show --name tmf-ehns-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk \
  --query 'provisioningState'
# Expected: Succeeded

# 2. Event Hub hub exists
az eventhub eventhub show --name tmf-eh-eus-6an5wk \
  --namespace-name tmf-ehns-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk \
  --query 'name'
# Expected: tmf-eh-eus-6an5wk

# 3. Consumer groups exist
az eventhub eventhub consumer-group list \
  --eventhub-name tmf-eh-eus-6an5wk \
  --namespace-name tmf-ehns-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk \
  --query 'length(@)'
# Expected: 2 or more
```

**Status**:
- [ ] Event Hub namespace: Succeeded
- [ ] Event Hub hub exists
- [ ] Consumer groups configured

---

## AWS Resources (1 minute)

```bash
# 1. Lambda functions exist
aws lambda list-functions --profile tmf-dev --region us-east-1 \
  --query 'Functions[?contains(FunctionName, `tmf-`)].FunctionName' \
  --output table
# Expected: tmf-eventhub-processor-dev, tmf-webhook-writer-dev, tmf-meeting-bot-dev

# 2. DynamoDB tables exist
aws dynamodb list-tables --profile tmf-dev --region us-east-1 \
  --query 'TableNames[?contains(@, `eventhub`) || contains(@, `graph`) || contains(@, `meetings`)]' \
  --output table
# Expected: eventhub-checkpoints, graph_subscriptions, meetings

# 3. S3 bucket exists
aws s3api head-bucket --bucket tmf-webhooks-eus-dev --region us-east-1 && echo "✓ S3 bucket accessible"
# Expected: ✓ S3 bucket accessible
```

**Status**:
- [ ] Lambda functions deployed (3 functions)
- [ ] DynamoDB tables created (3 tables)
- [ ] S3 bucket accessible

---

## Python Environment (1 minute)

```bash
# Navigate to scripts
cd nobots-eventhub/scripts

# Check requirements installed
pip list | grep -E 'azure|msgraph|python-dotenv'
# Expected: Multiple packages listed

# Verify environment file
cat ../../.env.local.azure | grep -E 'GRAPH_|ENTRA_|AZURE_'
# Expected: All variables defined
```

**Status**:
- [ ] Python requirements installed
- [ ] .env.local.azure configured
- [ ] All Graph API variables set

---

## Graph Configuration (1 minute)

```bash
cd nobots-eventhub/scripts

# Check subscription exists
python list-subscriptions.py
# Expected: Subscription ID, notification URL, Active status
```

**Expected output**:
```
✓ Found subscriptions
Subscription ID: sub_12345678
Resource: /groups/5e7708f8-b0d2-467d-97f9-d9da4818084a/events
Notification URL: https://tmf-ehns-eus-6an5wk.servicebus.windows.net/...?tenantId=...
Change Types: created, updated
Expires: 2026-03-21 14:30:00 UTC
```

**Status**:
- [ ] Graph subscription active
- [ ] Notification URL points to Event Hub
- [ ] Subscription not expired

---

## AWS Credentials (30 seconds)

```bash
# Verify AWS profile
aws sts get-caller-identity --profile tmf-dev --region us-east-1 \
  --query '{Account: Account, Arn: Arn}'
# Expected: Account 833337371676, correct ARN
```

**Status**:
- [ ] AWS profile tmf-dev valid
- [ ] Access to correct AWS account

---

## Ready for Testing?

✅ **All checksums passed?** → Proceed to [TESTING.md](TESTING.md)

❌ **Something failed?** → Check:
- [SETUP.md](SETUP.md) for configuration
- [DEPLOYMENT.md](DEPLOYMENT.md) for infrastructure
- [MONITORING.md](MONITORING.md#troubleshooting) for troubleshooting

---

## Summary

| Component | Status | Command |
|-----------|--------|---------|
| Terraform | ✓ | `terraform state list \| wc -l` |
| Event Hub | ✓ | `az eventhub namespace show ...` |
| Lambda | ✓ | `aws lambda list-functions ...` |
| DynamoDB | ✓ | `aws dynamodb list-tables ...` |
| S3 | ✓ | `aws s3api head-bucket ...` |
| Python | ✓ | `pip list \| grep azure` |
| Graph Subscription | ✓ | `python list-subscriptions.py` |
| AWS Credentials | ✓ | `aws sts get-caller-identity ...` |

**Pre-Flight Score**: 8/8 ✅ Ready to test!

