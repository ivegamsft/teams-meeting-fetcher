# Teams Bot Scenario — Quick Start Guide

Teams Meeting Fetcher with Bot Framework integration and Lambda webhook processor.

## What is the Teams Bot Scenario?

This scenario deploys a Teams bot that can interact with users in Teams chat and receives meeting lifecycle events through the Bot Framework. AWS Lambda processes webhook notifications.

**Use this when**:
- You need a Teams app that users can interact with
- You want bot commands in Teams channels
- You need fine-grained meeting permissions
- You require Teams app manifest deployment

## ⚠️ Recommendation

**For most use cases, we recommend [Event Hub scenario](../nobots-eventhub/QUICKSTART.md) instead.**

The Event Hub scenario provides:
- ✅ Simpler architecture (no Bot Framework)
- ✅ Real-time notifications (same as bot)
- ✅ Lower complexity and maintenance
- ✅ No Teams app manifest required

**Use Teams Bot only if you specifically need:**
- Teams app with bot commands
- In-channel bot interactions
- Bot Framework event hooks

## Architecture

```
Microsoft Teams
    ↓ (Bot Framework SDK)
Azure Bot Service
    ↓ (webhook)
AWS API Gateway
    ↓ (HTTP POST)
AWS Lambda (Meeting Bot)
    ↓
S3 (webhook payloads)
DynamoDB (meetings, transcripts)
```

## Prerequisites

### Required

Everything from [Event Hub scenario](../nobots-eventhub/QUICKSTART.md#prerequisites), plus:

- **Azure Bot Service** resource
- **Bot registration** in Azure AD
- **Teams app manifest** deployment permissions
- **Teams Administrator** role (to deploy app)

### Not Required

- No Bot Framework SDK knowledge needed (we provide the Lambda handler)
- No custom bot code required (webhook receiver only)

## Step 1: Deploy Infrastructure (15-20 minutes)

### 1.1 Deploy base infrastructure

```bash
cd iac
terraform init
terraform plan
terraform apply
```

This creates the same infrastructure as Event Hub scenario, plus:
- Azure Bot Service
- API Gateway for bot webhook
- Lambda function: `tmf-meeting-bot-dev`

### 1.2 Get Bot credentials

After Terraform apply:

```bash
terraform output bot_app_id
terraform output bot_app_password  # Stored in AWS Secrets Manager
```

Save these values — you'll need them for Teams app manifest.

## Step 2: Register Bot in Azure Bot Service (10 minutes)

### 2.1 Create Bot Service resource

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Create a resource** → **Bot Service**
3. Fill in:
   - **Bot handle**: `teams-meeting-fetcher-bot`
   - **Subscription**: Your subscription
   - **Resource group**: `tmf-rg-eus-6an5wk`
   - **Pricing tier**: F0 (Free)
   - **Microsoft App ID**: Select **Use existing app registration**
     - **App ID**: (from Terraform output `bot_app_id`)
     - **App tenant ID**: `62837751-4e48-4d06-8bcb-57be1a669b78`
4. Click **Create**

### 2.2 Configure messaging endpoint

1. Go to your Bot Service resource → **Configuration**
2. Set **Messaging endpoint**:
   ```
   https://<api-gateway-id>.execute-api.us-east-1.amazonaws.com/prod/bot/messages
   ```
   Get `<api-gateway-id>` from Terraform:
   ```bash
   terraform output api_gateway_url
   ```
3. Click **Apply**

### 2.3 Add Microsoft Teams channel

1. In Bot Service → **Channels**
2. Click **Microsoft Teams** icon
3. Accept terms
4. Click **Apply**

Bot is now configured for Teams!

## Step 3: Create and Deploy Teams App (20-30 minutes)

### 3.1 Prepare app manifest

```bash
cd apps/teams-app
```

Edit `manifest.json`:

1. Replace `YOUR_GRAPH_CLIENT_ID` with your bot's app ID:
   ```json
   {
     "id": "YOUR_BOT_APP_ID",
     "webApplicationInfo": {
       "id": "YOUR_BOT_APP_ID",
       "resource": "api://botid-YOUR_BOT_APP_ID"
     }
   }
   ```

2. Update `validDomains`:
   ```json
   {
     "validDomains": [
       "<api-gateway-id>.execute-api.us-east-1.amazonaws.com"
     ]
   }
   ```

### 3.2 Package app

```bash
# PowerShell
.\scripts\deployment\package-teams-app.ps1

# Bash
./scripts/deployment/package-teams-app.sh
```

Creates: `teams-app/teams-app.zip`

### 3.3 Upload to Teams Developer Portal

1. Go to [Teams Developer Portal](https://dev.teams.microsoft.com)
2. Sign in with your Microsoft 365 account
3. Click **Apps** → **Import app**
4. Select `teams-app/teams-app.zip`
5. Review details and click **Import**

### 3.4 Publish to organization

1. In Developer Portal, click your app
2. Go to **Publish** → **Publish to org**
3. Click **Publish your app**
4. Admin approval required — continue to Step 4

## Step 4: Admin Approval (5-10 minutes)

### 4.1 Approve in Teams Admin Center

1. Go to [Teams Admin Center](https://admin.teams.microsoft.com)
2. Navigate to **Teams apps** → **Manage apps**
3. Search for "Teams Meeting Fetcher"
4. Status shows **Submitted**
5. Click the app
6. Review permissions:
   - View user's calendar
   - Access online meetings
   - Read group membership
7. Click **Publish**

**App is now available to users in your organization!**

### 4.2 Verify app availability

1. Open Microsoft Teams
2. Go to **Apps**
3. Search for "Teams Meeting Fetcher" or "Meeting Fetcher"
4. Should appear in search results
5. Click **Add** to install for yourself

## Step 5: Install Bot in Team/Channel (5 minutes)

### 5.1 Add to a team

1. In Teams, open the team where you want the bot
2. Click **⋯** (More options) → **Manage team**
3. Go to **Apps** tab
4. Click **More apps**
5. Search for "Meeting Fetcher"
6. Click **Add to team**

### 5.2 Test bot commands

In the team channel:

```
@Meeting Fetcher hi
```

Bot should respond:
```
Hello! I'm the Teams Meeting Fetcher bot. I can help you capture meeting transcripts.

Available commands:
- hi / hello — Greet the bot
- help — Show available commands
- status — Check bot status
```

## Step 6: Test Meeting Flow (15-20 minutes)

### 6.1 Create test meeting in channel

1. Go to the channel where bot is installed
2. Click **Meet** → **Schedule a meeting**
3. Set title: "Bot Test Meeting"
4. Set time: Now + 5 minutes
5. Duration: 30 minutes
6. Click **Schedule**

### 6.2 Monitor Lambda logs

```bash
# Terminal 1: Bot Lambda logs
aws logs tail /aws/lambda/tmf-meeting-bot-dev \
  --follow --profile tmf-dev --region us-east-1
```

### 6.3 Join meeting

1. When meeting time arrives, click **Join**
2. Join the meeting
3. Stay for 2+ minutes (for transcript)
4. Leave meeting

### 6.4 Watch logs

**Expected log output** (Terminal 1):

```
[MeetingBot] Received webhook from Bot Framework
[MeetingBot] Activity type: message
[MeetingBot] Processing meeting lifecycle event
[MeetingBot] Meeting created: Bot Test Meeting
[MeetingBot] Storing to S3: s3://tmf-webhooks-eus-dev/bot-payloads/...
[MeetingBot] Storing to DynamoDB: meetings table
```

### 6.5 Verify storage

```bash
# Check S3 payloads
aws s3 ls s3://tmf-webhooks-eus-dev/bot-payloads/ --profile tmf-dev

# Check DynamoDB meetings table
aws dynamodb scan --table-name meetings --profile tmf-dev --output table
```

## Step 7: Download Transcript (10 minutes)

### 7.1 Check transcript availability

After meeting ends, wait 1-2 minutes:

```bash
cd scenarios/lambda/meeting-bot
node check-transcript.js --meeting-id <online-meeting-id>
```

### 7.2 Download transcript

```bash
node download-transcript.js --meeting-id <online-meeting-id>
```

Transcript saved to `data/transcripts/<meeting-id>.vtt`

## What You Get

✅ **Teams app integration** — Users can interact with bot  
✅ **Bot commands** — Help, status, and custom commands  
✅ **Meeting lifecycle events** — Created, started, ended  
✅ **Webhook notifications** — Real-time event delivery  
✅ **Persistent storage** — S3 + DynamoDB  
✅ **Transcript capture** — VTT format transcripts  

⚠️ **Trade-offs**:
- More complex than Event Hub scenario
- Requires Bot Framework knowledge for customization
- Teams app deployment and maintenance
- Bot Service costs

## Bot Commands

Default commands (implemented in Lambda):

| Command | Description |
|---------|-------------|
| `@bot hi` or `@bot hello` | Greet the bot |
| `@bot help` | Show available commands |
| `@bot status` | Check bot status and health |

**To add custom commands**: Edit `scenarios/lambda/meeting-bot/index.js`

## Next Steps

### Enhance Bot Functionality

1. **Add more commands**:
   ```javascript
   // In scenarios/lambda/meeting-bot/index.js
   if (text.includes('list meetings')) {
     // Query DynamoDB for recent meetings
     // Respond with formatted list
   }
   ```

2. **Proactive messages**: Send notifications when transcripts are ready

3. **Adaptive cards**: Rich formatted responses with buttons

### Production Setup

1. **Set up CloudWatch alarms**:
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name "tmf-bot-errors" \
     --metric-name Errors \
     --namespace AWS/Lambda \
     --dimensions Name=FunctionName,Value=tmf-meeting-bot-dev
   ```

2. **Configure SNS notifications** for failures

3. **Monitor Bot Service** in Azure Portal

4. **Set up subscription renewal** (subscriptions expire after 3 days)

## Troubleshooting

### Bot doesn't respond to commands?

**Check messaging endpoint**:
```bash
# Get API Gateway URL
terraform output api_gateway_url

# Verify in Azure Portal → Bot Service → Configuration
# Should match: https://<api-id>.execute-api.us-east-1.amazonaws.com/prod/bot/messages
```

**Check Lambda logs**:
```bash
aws logs tail /aws/lambda/tmf-meeting-bot-dev --profile tmf-dev
```

### App not showing in Teams?

**Verify admin approval**:
1. Teams Admin Center → Manage apps
2. Search for "Meeting Fetcher"
3. Status should be **Allowed** (not **Blocked** or **Submitted**)

**Check app setup policy**:
1. Teams Admin Center → App setup policies
2. Edit default policy
3. Ensure **Allow custom apps** is enabled

### Lambda timeout?

Increase timeout:
```bash
aws lambda update-function-configuration \
  --function-name tmf-meeting-bot-dev \
  --timeout 60 --profile tmf-dev
```

### Transcript not available?

**Check permissions**:
- App registration needs `OnlineMeetingTranscript.Read.All`
- Admin consent granted

**Wait longer**:
- Graph API needs 30-90 seconds after meeting ends
- Try again after 2 minutes

## Documentation

- **[Teams App README](../../apps/teams-app/README.md)** — Teams app deployment details
- **[Lambda README](../../apps/aws-lambda/README.md)** — Lambda handler documentation
- **[Bot Framework Docs](https://docs.microsoft.com/en-us/azure/bot-service/)** — Official Bot Service docs

## Cost Estimate

**Azure** (~$100/month):
- Bot Service: Free tier available, or ~$0.50/1000 messages
- App Service: ~$55/month (if using web app host)
- Everything from Event Hub scenario: ~$85/month

**AWS** (~$50/month):
- Lambda: ~$5-10/month (webhook processing)
- API Gateway: ~$3-7/month (webhook endpoint)
- Everything from Event Hub scenario: ~$15/month

**Total**: ~$150/month

## Comparison with Event Hub

| Feature | Teams Bot | Event Hub |
|---------|-----------|-----------|
| **Real-time notifications** | ✅ | ✅ |
| **Bot commands** | ✅ | ❌ |
| **Teams app** | ✅ | ❌ |
| **Infrastructure complexity** | High | Medium |
| **Monthly cost** | ~$150 | ~$100 |
| **Maintenance** | High | Medium |

**Recommendation**: Use Event Hub unless you specifically need bot interactions.

## Getting Help

1. Check **[Event Hub QUICKSTART](../nobots-eventhub/QUICKSTART.md)** — Similar flow, simpler setup
2. Review **[Teams App README](../../apps/teams-app/README.md)**
3. See **[Bot Framework Docs](https://docs.microsoft.com/en-us/azure/bot-service/)**
4. Open GitHub issue with logs and error messages

---

**🎉 Success!** You've deployed a Teams bot that captures meeting transcripts and responds to commands.

**Consider**: If you don't need bot interactions, [Event Hub scenario](../nobots-eventhub/QUICKSTART.md) is simpler and cheaper.
