# Update Infrastructure Configuration

Update Terraform variables and re-apply infrastructure changes.

## Context

This prompt helps you modify infrastructure configuration (environment variables, schedules, settings) and safely apply changes to running infrastructure.

## Prerequisites

- ✅ Infrastructure already deployed
- ✅ You know what configuration needs to change

## Common Updates

### Update Bot Webhook URL (after first deploy)

After initial deployment, update Azure Bot Service with actual webhook URL:

```terraform
# In infra/terraform.tfvars
bot_messaging_endpoint = "https://abc123.execute-api.us-east-1.amazonaws.com/dev/bot/messages"
```

### Update Lambda Environment Variables

Change Lambda function settings:

```terraform
# Event Hub polling frequency
eventhub_poll_schedule_expression = "rate(2 minutes)"  # Was: rate(1 minute)

# Event Hub batch size
eventhub_max_events = 100  # Was: 50

# Meeting poll lookahead
poll_lookahead_minutes = 120  # Was: 60
```

### Update Monitoring

Change notification email or schedules:

```terraform
notification_email = "newemail@example.com"

# Renewal schedule (daily at 3 AM UTC)
renewal_schedule_expression = "cron(0 3 * * ? *)"
```

### Update Security

Change firewall rules or secrets:

```terraform
# Add new IP address
allowed_ip_addresses = ["47.206.222.73", "52.123.45.67"]

# Rotate client state secret
client_state = "new-random-secret-generated-value"
```

## Prompt

I need to update infrastructure configuration.

**Current change:**
[Describe what you want to change]

**Steps:**

1. Navigate to `infra/` directory

2. Edit `terraform.tfvars`:
   - Make your configuration changes
   - Save the file

3. Generate a plan to preview changes:

   ```powershell
   terraform plan -out=tfplan
   ```

4. Review what will change:
   - Should show resources being **modified** (not replaced)
   - Check that only expected resources are affected

5. Apply the changes:
   ```powershell
   terraform apply tfplan
   ```

**Safety checks:**

Before applying, verify:

- ✅ No resources are being destroyed
- ✅ No stateful resources (DynamoDB, S3) are being replaced
- ✅ Lambda functions show "update in-place" not "create/destroy"
- ✅ Sensitive values are properly marked as sensitive

**Expected outcomes by change type:**

**Environment variables** → Lambda functions updated in-place ✅
**Schedules** → EventBridge rules modified ✅  
**IAM policies** → Policies updated in-place ✅
**Tags** → Resources tagged without recreation ✅
**Bot endpoint** → Azure Bot Service updated ✅
**Secrets** → Trigger Lambda redeployment ⚠️

**Force replacement (when needed):**

To force a Lambda to redeploy with new code:

```powershell
# Mark Lambda for replacement
terraform taint module.aws.module.eventhub_processor.aws_lambda_function.function

# Apply the change
terraform plan -out=tfplan
terraform apply tfplan
```

**Rollback if needed:**

If something breaks:

1. Restore previous `terraform.tfvars` from git history:

   ```powershell
   git checkout HEAD~1 -- infra/terraform.tfvars
   ```

2. Re-apply:
   ```powershell
   terraform apply
   ```

**After updating:**

1. Verify changes took effect:

   ```powershell
   # Check Lambda environment variables
   terraform output

   # Or check specific resource
   aws lambda get-function-configuration --function-name <name>
   ```

2. Test affected functionality:
   - If changed Event Hub settings → test Event Hub processing
   - If changed bot endpoint → test Teams bot
   - If changed schedules → verify next execution time

Make the configuration changes and apply them safely.
