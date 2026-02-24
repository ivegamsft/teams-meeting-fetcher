# Teams Meeting Fetcher — Quick Start Guide

Choose your scenario based on your needs and infrastructure.

## What is Teams Meeting Fetcher?

Teams Meeting Fetcher automatically captures Teams meeting transcripts using Microsoft Graph API. You can deploy it in three different ways depending on your infrastructure and requirements.

## 📋 Choose Your Scenario

| Scenario | Description | Best For | Complexity |
|----------|-------------|----------|------------|
| **[No-Bot / Direct Graph](#scenario-1-no-bot--direct-graph)** | Poll Microsoft Graph API directly for meeting transcripts | Simple deployments, learning, testing | ⭐ Easy |
| **[Event Hub](#scenario-2-event-hub)** | Real-time notifications via Azure Event Hub + AWS Lambda | Production, real-time requirements | ⭐⭐ Moderate |
| **[Teams Bot](#scenario-3-teams-bot-legacy)** | Use Teams Bot Framework with Lambda webhook processor | Teams app integration required | ⭐⭐⭐ Advanced |

## Scenario Comparison

### When to Use Each

**Use No-Bot/Direct Graph** if you:
- Want the simplest setup
- Don't need real-time notifications
- Are learning the Graph API
- Have a small number of users to monitor
- Don't mind polling intervals (every 5-30 minutes)

**Use Event Hub** if you:
- Need real-time notification of meeting events
- Want reliable event delivery with retry logic
- Plan to scale to many users
- Have both Azure and AWS infrastructure
- Need audit trails and event replay

**Use Teams Bot** if you:
- Need a Teams app manifest
- Want users to interact with the bot in Teams
- Require meeting lifecycle event hooks
- Need fine-grained meeting permissions

### Feature Matrix

| Feature | No-Bot | Event Hub | Teams Bot |
|---------|--------|-----------|-----------|
| **Real-time notifications** | ❌ | ✅ | ✅ |
| **Polling interval** | 5-30 min | < 5 sec | < 5 sec |
| **Infrastructure** | None | Azure + AWS | Azure + AWS |
| **Bot Framework needed** | ❌ | ❌ | ✅ |
| **Teams app manifest** | ❌ | ❌ | ✅ |
| **Deployment complexity** | Low | Medium | High |
| **Cost (monthly)** | $0 | ~$100 | ~$150 |
| **Maintenance** | Low | Medium | Medium |

## Prerequisites for All Scenarios

### Required
- **Microsoft 365 tenant** with admin access
- **Azure AD app registration** with Graph API permissions:
  - `Calendars.Read` (Application)
  - `OnlineMeetingTranscript.Read.All` (Application)
  - `OnlineMeetings.Read.All` (Application)
  - `Group.Read.All` (Application)
- **Azure AD security group** for monitoring specific users
- **Node.js 18+** and **Python 3.11+**

### Optional (per scenario)
- **Azure subscription** (Event Hub, Teams Bot scenarios)
- **AWS account** (Event Hub, Teams Bot scenarios)
- **Teams Premium** (for transcription features)

## 🚀 Scenario 1: No-Bot / Direct Graph

**Description**: Poll Microsoft Graph API at regular intervals to detect meetings and download transcripts.

**Location**: `scenarios/nobots/`

**Setup time**: 10-15 minutes

### Architecture

```
Calendar Events (Graph API)
    ↓ (poll every 5-30 min)
Local Node.js Script
    ↓
Download Transcripts
    ↓
Save to local files
```

### Quick Start

1. **Navigate to scenario**:
   ```bash
   cd scenarios/nobots
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure credentials**:
   ```bash
   cp .env.example .env
   # Edit .env with your Azure AD credentials:
   # - GRAPH_TENANT_ID
   # - GRAPH_CLIENT_ID
   # - GRAPH_CLIENT_SECRET
   # - WATCH_USER_ID (email of user to monitor)
   ```

4. **Test with demo data** (no credentials needed):
   ```bash
   npm run demo
   ```

5. **Run the full workflow**:
   ```bash
   # Step 1: Poll calendar for meetings
   npm run poll
   
   # Step 2: Check which meetings have ended
   npm run check
   
   # Step 3: Download transcripts
   npm run transcripts
   ```

6. **View results**:
   ```bash
   # See detected meetings
   cat data/meetings.json
   
   # See downloaded transcripts
   ls data/transcripts/
   cat data/transcripts/*.vtt
   ```

### What You Get

- ✅ Meetings detected from calendar
- ✅ Transcripts downloaded as VTT files
- ✅ Local storage in `data/` folder
- ✅ Simple polling workflow
- ❌ No real-time notifications
- ❌ Manual workflow (run scripts on schedule)

### Next Steps

- Automate with **cron** or **Task Scheduler**
- Set up **GitHub Actions** to run on schedule
- Export transcripts to external storage

📖 **Full Documentation**: [scenarios/nobots/README.md](scenarios/nobots/README.md)  
📖 **Quick Reference**: [scenarios/nobots/QUICKSTART.md](scenarios/nobots/QUICKSTART.md)

---

## 🚀 Scenario 2: Event Hub

**Description**: Real-time event notifications via Azure Event Hub, processed by AWS Lambda, with persistent storage.

**Location**: `scenarios/nobots-eventhub/`

**Setup time**: 45-60 minutes

### Architecture

```
Microsoft Graph API
    ↓ (webhook notification)
Azure Event Hub
    ↓ (AMQP protocol)
AWS Lambda (EventHub Processor)
    ↓
AWS S3 (webhook payloads)
AWS DynamoDB (checkpoints, meetings)
```

### Quick Start

1. **Prerequisites**:
   - Azure subscription
   - AWS account with CLI configured (`tmf-dev` profile)
   - Terraform 1.0+ installed

2. **Deploy infrastructure**:
   ```bash
   cd iac
   terraform init
   terraform plan
   terraform apply
   ```

   This creates:
   - **Azure**: Event Hub namespace, Storage Account, Key Vault
   - **AWS**: Lambda functions, DynamoDB tables, S3 buckets, EventBridge schedules

3. **Create Graph API subscription**:
   ```bash
   cd scenarios/nobots-eventhub/scripts
   python create-group-eventhub-subscription.py
   ```

4. **Monitor logs**:
   ```bash
   # Terminal 1: Lambda processor logs
   aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow --profile tmf-dev
   
   # Terminal 2: Webhook writer logs
   aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow --profile tmf-dev
   ```

5. **Test the flow**:
   ```bash
   # Create test meeting
   cd scenarios/nobots-eventhub/scripts
   python create-test-meeting.py --title "EventHub Test" --minutes 30
   
   # Join meeting, talk for 2+ minutes, leave meeting
   # Monitor logs to see real-time processing
   ```

6. **Verify data storage**:
   ```bash
   # Check S3 payloads
   aws s3 ls s3://tmf-webhooks-eus-dev/webhooks/ --profile tmf-dev
   
   # Check DynamoDB
   aws dynamodb scan --table-name meetings --profile tmf-dev --output table
   ```

### What You Get

- ✅ Real-time meeting event notifications
- ✅ Reliable event delivery with retries
- ✅ Persistent storage (S3, DynamoDB)
- ✅ Checkpoint tracking for resume capability
- ✅ Scalable infrastructure
- ✅ Audit trail of all events
- ⚠️ Requires cloud infrastructure (Azure + AWS)
- ⚠️ Monthly costs (~$100)

### Next Steps

- Set up **CloudWatch alarms** for monitoring
- Configure **SNS notifications** for failures
- Implement **transcript processing** pipeline

📖 **Full Documentation**: [scenarios/nobots-eventhub/ARCHITECTURE.md](scenarios/nobots-eventhub/ARCHITECTURE.md)  
📖 **Deployment Guide**: [scenarios/nobots-eventhub/DEPLOYMENT.md](scenarios/nobots-eventhub/DEPLOYMENT.md)  
📖 **Testing Guide**: [scenarios/nobots-eventhub/GUIDED-TESTING.md](scenarios/nobots-eventhub/GUIDED-TESTING.md)

---

## 🚀 Scenario 3: Teams Bot (Legacy)

**Description**: Teams Bot Framework with Lambda webhook processor (requires Bot Service).

**Location**: `scenarios/lambda/meeting-bot/`, `apps/teams-app/`

**Setup time**: 60-90 minutes

### Architecture

```
Microsoft Teams
    ↓ (Bot Framework)
Azure Bot Service
    ↓ (webhook)
AWS API Gateway
    ↓
AWS Lambda
    ↓
S3 / DynamoDB
```

### Status

⚠️ **This scenario requires additional Bot Framework setup and is more complex than Event Hub.**

For most production use cases, **Scenario 2 (Event Hub)** is recommended instead.

### Quick Start

1. **Deploy Teams app**:
   ```bash
   cd apps/teams-app
   # Follow README.md for Teams Developer Portal deployment
   ```

2. **Deploy Lambda webhook**:
   ```bash
   cd iac
   terraform apply -target=module.aws.module.meeting-bot
   ```

3. **Configure Bot Service**:
   - Register bot in Azure Bot Service
   - Point messaging endpoint to API Gateway URL
   - Grant bot permissions in Teams admin

### What You Get

- ✅ Teams app integration
- ✅ Bot commands in Teams
- ✅ Meeting lifecycle events
- ✅ Webhook-based notifications
- ⚠️ Requires Bot Framework setup
- ⚠️ Teams app manifest deployment
- ⚠️ Higher complexity and maintenance

📖 **Teams App Docs**: [apps/teams-app/README.md](apps/teams-app/README.md)  
📖 **Lambda Docs**: [apps/aws-lambda/README.md](apps/aws-lambda/README.md)

---

## 🔧 General Setup Tasks

These tasks apply to all scenarios:

### 1. Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Click **New registration**
3. Name: `Teams Meeting Fetcher`
4. Supported account types: **Single tenant**
5. Click **Register**
6. Note down:
   - Application (client) ID
   - Directory (tenant) ID
7. Go to **Certificates & secrets** → New client secret
8. Copy the secret value (shown only once)
9. Go to **API permissions** → Add permissions:
   - Microsoft Graph → Application permissions:
     - `Calendars.Read`
     - `OnlineMeetingTranscript.Read.All`
     - `OnlineMeetings.Read.All`
     - `Group.Read.All`
10. Click **Grant admin consent for [Tenant]**

### 2. Create Security Group

1. Azure Portal → Azure Active Directory → Groups
2. Click **New group**
3. Group type: **Security**
4. Group name: `Teams Meeting Fetcher Admins`
5. Add members (users whose meetings you want to monitor)
6. Note down the **Object ID**

### 3. Verify Setup

```bash
# Test Graph API authentication
cd scripts/graph
python 01-verify-setup.py
```

---

## 📚 Additional Resources

### Documentation

- **[README.md](README.md)** — Project overview and features
- **[CONFIGURATION.md](CONFIGURATION.md)** — Complete configuration reference
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Unified deployment guide
- **[DEPLOYMENT_RULES.md](DEPLOYMENT_RULES.md)** — Critical deployment rules
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** — Teams bot setup cheatsheet

### Automation Guides

- **[docs/SETUP_AND_AUTOMATION_GUIDE.md](docs/SETUP_AND_AUTOMATION_GUIDE.md)** — Bootstrap prompts and automation
- **[docs/TEAMS_INVENTORY_AUTOMATION.md](docs/TEAMS_INVENTORY_AUTOMATION.md)** — Configuration inventory
- **[.github/prompts/](. github/prompts/)** — Copilot bootstrap prompts

### Testing

- **[Teams-Meeting-Fetcher-Workflow.ipynb](Teams-Meeting-Fetcher-Workflow.ipynb)** — Interactive Jupyter notebook
- **[test-scripts/](test-scripts/)** — Test scripts for workflows

---

## ❓ FAQ

### Which scenario should I choose?

**Start with No-Bot** if you're learning or testing. It's the simplest and has no infrastructure costs.

**Move to Event Hub** for production deployments where real-time notifications matter.

**Use Teams Bot** only if you specifically need Teams app integration or bot interactions.

### Can I switch scenarios later?

Yes! The scenarios are independent. You can:
1. Start with No-Bot for testing
2. Deploy Event Hub for production
3. Add Teams Bot later if needed

### What permissions do I need?

**Azure AD**:
- Application Administrator or Global Administrator (to create app registrations)
- Group Administrator (to create security groups)

**Microsoft 365**:
- Teams Administrator (to deploy Teams app, if using Bot scenario)

**Cloud**:
- Azure: Contributor role on subscription (Event Hub scenario)
- AWS: IAM permissions to create Lambda, S3, DynamoDB (Event Hub or Bot scenarios)

### How much does it cost?

| Scenario | Azure | AWS | Total/month |
|----------|-------|-----|-------------|
| **No-Bot** | $0 | $0 | **$0** |
| **Event Hub** | ~$85 | ~$15 | **~$100** |
| **Teams Bot** | ~$100 | ~$50 | **~$150** |

### What about Microsoft Teams Premium?

Teams Premium is required for:
- Automatic meeting transcription
- Intelligent meeting recap
- Transcript availability in Graph API

Without Teams Premium, you can still:
- Create meetings programmatically
- Monitor calendar events
- Receive webhook notifications

But transcripts will not be generated automatically.

### Can I monitor multiple users?

Yes, all scenarios support monitoring multiple users:

**No-Bot**: Run scripts for each user (set `WATCH_USER_ID`)  
**Event Hub**: Create subscriptions for all users in a security group  
**Teams Bot**: Bot monitors all meetings in channels where it's installed

### How long are transcripts retained?

By default:
- **Microsoft 365**: 60-120 days
- **This project**: Forever (stored in S3 or local files)

### Can I use this on-premises?

**No-Bot**: Yes, runs anywhere Node.js is available  
**Event Hub**: No, requires Azure Event Hub (cloud-only)  
**Teams Bot**: No, requires Azure Bot Service (cloud-only)

---

## 🆘 Getting Help

1. **Check scenario-specific README** first
2. **Review [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** (if exists)
3. **Search [GitHub Issues](../../issues)**
4. **Open a new issue** with:
   - Scenario you're using
   - Steps to reproduce
   - Error messages and logs

---

## 🎯 Next Steps

✅ **Choose your scenario** from the table above  
✅ **Set up Azure AD app registration**  
✅ **Create security group**  
✅ **Follow scenario-specific quick start**  
✅ **Test with a meeting**  
✅ **Monitor logs and verify storage**

**Ready to start?** Jump to your chosen scenario above! 🚀
