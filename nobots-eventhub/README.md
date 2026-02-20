# nobots-eventhub — Event-Driven Transcript Workflow

**Event Hub-based workflow** that uses Microsoft Graph API subscriptions to receive real-time notifications when meetings are created/updated, then automatically processes transcripts.

> **This is a complete, self-contained scenario package.** Everything you need is in this folder: documentation, scripts, code, and configuration.

## 🚀 START HERE - Complete Testing in 30-45 Minutes

**👉 [GUIDED-TESTING.md](GUIDED-TESTING.md)** - Step-by-step walkthrough including:

- Pre-flight verification
- Monitor setup (3 terminals)
- Create test meeting
- Join meeting to capture transcript
- Verify data flow: Meeting → Event Hub → Lambda → S3 → DynamoDB
- Troubleshooting

## 🎯 When to Use EventHub Approach

| Feature        | nobots (Polling)   | nobots-eventhub (EventHub) |
| -------------- | ------------------ | -------------------------- |
| **Latency**    | 30-60 seconds      | Real-time (<5 sec)         |
| **API Calls**  | Continuous polling | On-demand only             |
| **Complexity** | Simple             | Requires EventHub          |
| **Cost**       | Higher (polling)   | Lower (event-driven)       |
| **Use Case**   | Development, demos | Production workloads       |

**Choose EventHub if you need**: Real-time updates, low API quota usage, scalability

## 📂 Quick Navigation

### 🚀 Getting Started (New Users)

**Start here if you haven't tested yet:**

1. **[GUIDED-TESTING.md](GUIDED-TESTING.md)** ← **START HERE** (30-45 min, step-by-step)
   - Pre-flight checks
   - Setup monitoring
   - Create & join test meeting
   - Verify transcript data flow
   - Troubleshooting

2. **[PRE-TEST-CHECKLIST.md](PRE-TEST-CHECKLIST.md)** — Quick verification (2 min)

### 📊 Reference Documents

3. **[SETUP.md](SETUP.md)** — Prerequisites & configuration
4. **[DEPLOYMENT.md](DEPLOYMENT.md)** — Infrastructure deployment (Terraform)
5. **[TESTING.md](TESTING.md)** — Alternative testing guide (manual approach)
6. **[MONITORING.md](MONITORING.md)** — Operational monitoring & troubleshooting

### 💻 Implementation

- **[src/](src/)** — Lambda handlers and utilities
  - `handler.js` — Event Hub consumer
  - `package.json` — Dependencies
- **[scripts/](scripts/)** — Management and testing scripts
  - `create-group-eventhub-subscription.py` — Create Graph subscription
  - `create-test-meeting.py` — Create test meeting
  - `list-subscriptions.py` — View active subscriptions

### 🧪 Testing

- **[tests/](tests/)** — Automated tests
  - `unit/` — Handler logic tests
  - `integration/` — Lambda + EventHub integration
  - `e2e/` — Full flow end-to-end
- **[data/fixtures/](data/fixtures/)** — Sample event payloads

### ⚙️ Configuration

- **[config/](config/)** — Configuration templates
  - `.env.example` — Environment variables
  - `terraform.tfvars.example` — Infrastructure variables

## 🏗️ Architecture

```
User Creates Meeting in Teams
            ↓
Microsoft Graph API
  ↓ (change notification)
Azure Event Hub
  ↓ (1-minute polling)
AWS Lambda: tmf-eventhub-processor-dev
            ↓
AWS Lambda: tmf-webhook-writer-dev
    ├─→ AWS S3: Stores webhook payload
    └─→ AWS DynamoDB: Updates checkpoint offset
```

## ⚡ Quick Start (5 minutes)

### Prerequisites

- Azure AD app with `Calendars.Read` permission
- AWS account (or use existing deployment)
- Python 3.8+ and Node.js 18+

### 1. Configure Environment

```bash
# Copy and edit
cp config/.env.example ../.env.local.azure

# Fill in from Azure & AWS
GRAPH_TENANT_ID=62837751-4e48-4d06-8bcb-57be1a669b78
GRAPH_CLIENT_ID=1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8
GRAPH_CLIENT_SECRET=your-secret
ENTRA_GROUP_ID=5e7708f8-b0d2-467d-97f9-d9da4818084a
AZURE_EVENTHUB_CONNECTION_STRING=your-connection-string
```

### 2. Install Dependencies

```bash
cd scripts
pip install -r requirements.txt
```

### 3. Verify Setup

```bash
python 01-verify-setup.py
```

### 4. Create Graph Subscription

```bash
python create-group-eventhub-subscription.py
```

### 5. Create Test Meeting

```bash
python create-test-meeting.py --minutes 30
```

### 6. Monitor Data Flow

Open 3 terminals:

**Terminal 1**: Process logs

```bash
aws logs tail /aws/lambda/tmf-eventhub-processor-dev --follow
```

**Terminal 2**: Writer logs

```bash
aws logs tail /aws/lambda/tmf-webhook-writer-dev --follow
```

**Terminal 3**: Checkpoints

```bash
watch -n 5 'aws dynamodb scan --table-name eventhub-checkpoints'
```

## 📖 Detailed Guides

### For First-Time Setup

1. Start with **[SETUP.md](SETUP.md)** for prerequisites
2. Follow **[DEPLOYMENT.md](DEPLOYMENT.md)** to deploy infrastructure
3. Run scripts in `scripts/` to create subscriptions and test

### For Monitoring & Troubleshooting

- See **[MONITORING.md](MONITORING.md)** for health checks, log analysis, and troubleshooting

### For Understanding the Code

- Check `src/handler.js` for Lambda implementation
- See `scripts/` for automation examples
- Review `tests/` for usage patterns

## 🔑 Key Resources

| Resource                | Value                                         |
| ----------------------- | --------------------------------------------- |
| **Event Hub Namespace** | `tmf-ehns-eus-6an5wk`                         |
| **Event Hub Name**      | `tmf-eh-eus-6an5wk`                           |
| **Lambda Processor**    | `tmf-eventhub-processor-dev`                  |
| **Lambda Writer**       | `tmf-webhook-writer-dev`                      |
| **S3 Bucket**           | `tmf-webhooks-eus-dev`                        |
| **DynamoDB Tables**     | `eventhub-checkpoints`, `graph_subscriptions` |
| **Region**              | US East 1 (AWS) / East US (Azure)             |

## 📋 Development Workflow

### Add New Feature

1. Create test in `tests/unit/` or `tests/integration/`
2. Implement in `src/`
3. Test locally: `npm test`
4. Deploy: See [DEPLOYMENT.md](DEPLOYMENT.md)

### Debug Issue

1. Check logs: See [MONITORING.md](MONITORING.md)
2. Verify subscription: `python scripts/list-subscriptions.py`
3. Check checkpoints: `aws dynamodb scan --table-name eventhub-checkpoints`
4. Review payloads: See "Monitoring S3 Payloads" in [MONITORING.md](MONITORING.md)

### Monitor in Production

1. Set up CloudWatch dashboards
2. Enable SNS alerts for Lambda errors
3. Monitor checkpoint offset growth
4. Track subscription expiration

## 🚀 Deployment

### First Deployment

```bash
cd ../../iac
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

### Updates

```bash
cd ../../iac
terraform plan
terraform apply
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## ✅ Verification Checklist

After setup, verify:

- [ ] Event Hub namespace accessible
- [ ] Lambda functions deployed
- [ ] DynamoDB tables created
- [ ] S3 bucket exists
- [ ] Graph subscription created
- [ ] Test meeting created
- [ ] Lambda logs show processing
- [ ] Checkpoints updating
- [ ] Payloads in S3

## 🐛 Common Issues

### No Lambda Activity

→ Check Graph subscription created: `python scripts/list-subscriptions.py`

### Event Hub Not Receiving Messages

→ Verify subscription notification URL includes `?tenantId=...` parameter

### S3 Upload Fails

→ Check Lambda IAM role has S3 permissions

See [MONITORING.md](MONITORING.md#troubleshooting) for detailed troubleshooting.

## 📚 Additional Resources

- Azure Event Hub: https://learn.microsoft.com/en-us/azure/event-hubs/
- Microsoft Graph Subscriptions: https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions
- AWS Lambda: https://docs.aws.amazon.com/lambda/
- DynamoDB: https://docs.aws.amazon.com/dynamodb/

## 🤝 Contributing

To improve this scenario:

1. Make changes in appropriate folder (src/, tests/, scripts/)
2. Update documentation if needed
3. Test changes thoroughly
4. Commit with clear message
5. Reference this scenario in commit: `nobots-eventhub: ...`

## 📞 Support

For issues specific to this scenario:

1. Check [MONITORING.md](MONITORING.md#troubleshooting)
2. Review logs in all 3 terminal windows
3. Verify configuration in [SETUP.md](SETUP.md)
4. Check Graph subscription status

## Related Scenarios

- **nobots** — Polling-based approach (compare for simpler alternative)
- **apps/aws-lambda** — Bot service implementation
- **iac/** — Full infrastructure deployment (unified Terraform)

---

**Last Updated**: February 2026  
**Status**: Production Ready  
**Folder Structure**: Self-contained scenario package
