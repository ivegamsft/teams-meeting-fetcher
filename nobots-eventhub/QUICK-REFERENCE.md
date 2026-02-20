# Quick Reference - Copy & Paste Commands

Use this while following [GUIDED-TESTING.md](GUIDED-TESTING.md)

---

## PRE-FLIGHT CHECKS

### Check Terraform (should show 101)
```bash
cd iac
terraform state list | wc -l
```

### Check Event Hub
```bash
az eventhub namespace show --name tmf-ehns-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk --query 'provisioningState'
```

### Check Graph Subscription
```bash
cd nobots-eventhub/scripts
python list-subscriptions.py
```

### Check AWS Access
```bash
aws sts get-caller-identity --profile tmf-dev --region us-east-1
```

---

## MONITORING TERMINALS (Open in 3 separate terminals)

### Terminal 1 - Processor Logs
```bash
aws logs tail /aws/lambda/tmf-eventhub-processor-dev \
  --follow --profile tmf-dev --region us-east-1
```

### Terminal 2 - Writer Logs
```bash
aws logs tail /aws/lambda/tmf-webhook-writer-dev \
  --follow --profile tmf-dev --region us-east-1
```

### Terminal 3 - DynamoDB Monitor (Windows PowerShell)
```powershell
while ($true) {
  Clear-Host
  Write-Host "$(Get-Date) - DynamoDB Checkpoints"
  aws dynamodb scan --table-name eventhub-checkpoints `
    --profile tmf-dev --region us-east-1 --output table
  Start-Sleep -Seconds 5
}
```

### Terminal 3 - DynamoDB Monitor (Mac/Linux)
```bash
watch -n 5 'aws dynamodb scan --table-name eventhub-checkpoints --profile tmf-dev --region us-east-1 --output table'
```

---

## CREATE & JOIN MEETING

### Create Test Meeting
```bash
cd nobots-eventhub/scripts
python create-test-meeting.py --title "EventHub Transcript Test" --minutes 60
```

**Copy the Join URL from output → Paste in browser to join**

---

## VERIFY DATA STORAGE

### Check S3 Payloads
```bash
# List all
aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev \
  --profile tmf-dev --region us-east-1 --prefix webhooks/ \
  --query 'Contents[*].{Key: Key, Size: Size, Modified: LastModified}' --output table
```

### Get Latest Payload (PowerShell)
```powershell
$latest = aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev `
  --profile tmf-dev --region us-east-1 --prefix webhooks/ `
  --query 'Contents | max_by(@, &LastModified).Key' --output text

aws s3api get-object --bucket tmf-webhooks-eus-dev `
  --key $latest --profile tmf-dev --region us-east-1 payload.json

cat payload.json | ConvertFrom-Json | ConvertTo-Json -Depth 5
```

### Get Latest Payload (Mac/Linux)
```bash
latest=$(aws s3api list-objects-v2 --bucket tmf-webhooks-eus-dev \
  --profile tmf-dev --region us-east-1 --prefix webhooks/ \
  --query 'Contents | max_by(@, &LastModified).Key' --output text)

aws s3api get-object --bucket tmf-webhooks-eus-dev \
  --key $latest --profile tmf-dev --region us-east-1 payload.json

cat payload.json | jq .
```

---

## VERIFY DYNAMODB

### Check Checkpoints
```bash
aws dynamodb scan --table-name eventhub-checkpoints \
  --profile tmf-dev --region us-east-1 --output table
```

### Check Graph Subscriptions
```bash
aws dynamodb scan --table-name graph_subscriptions \
  --profile tmf-dev --region us-east-1 --output table
```

### Check Meetings
```bash
aws dynamodb scan --table-name meetings \
  --profile tmf-dev --region us-east-1 --output table
```

---

## TROUBLESHOOTING

### Increase Lambda Timeout
```bash
aws lambda update-function-configuration \
  --function-name tmf-eventhub-processor-dev \
  --timeout 60 --profile tmf-dev --region us-east-1

aws lambda update-function-configuration \
  --function-name tmf-webhook-writer-dev \
  --timeout 60 --profile tmf-dev --region us-east-1
```

### Check Lambda Permissions
```bash
aws iam get-role-policy --role-name tmf-lambda-webhook-writer-role \
  --policy-name s3-write-policy --profile tmf-dev
```

### Check Event Hub Status
```bash
az eventhub eventhub show --name tmf-eh-eus-6an5wk \
  --namespace-name tmf-ehns-eus-6an5wk \
  --resource-group tmf-rg-eus-6an5wk
```

### Create Subscription (if missing)
```bash
cd nobots-eventhub/scripts
python create-group-eventhub-subscription.py
```

---

## SUCCESS CHECKLIST

While following GUIDED-TESTING.md, use this:

- [ ] Pre-flight: All tools installed and credentials valid
- [ ] Pre-flight: Graph subscription active
- [ ] Monitoring: All 3 terminals showing logs
- [ ] Meeting: Created in Teams calendar
- [ ] Logs: Processor shows "Received X messages"
- [ ] Logs: Writer shows "Uploading to S3"
- [ ] Logs: Writer shows "Updating checkpoint"
- [ ] S3: Has webhook payload files
- [ ] DynamoDB: Checkpoints table has data with increasing offsets
- [ ] DynamoDB: Graph subscriptions table populated
- [ ] DynamoDB: Meetings table shows test meeting

**All checked?** 🎉 **SUCCESS!**

---

## LINKS

- **[GUIDED-TESTING.md](GUIDED-TESTING.md)** - Full walkthrough (follow this)
- **[MONITORING.md](MONITORING.md)** - Detailed monitoring & troubleshooting
- **[README.md](README.md)** - Scenario overview

