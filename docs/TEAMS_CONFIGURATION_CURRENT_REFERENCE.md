# Teams Configuration — Current Deployment Reference

**Document Purpose**: Capture the current Teams configuration for the development and production tenants.

**Last Updated**: February 24, 2026  
**Applies To**: Primary deployment tenant  
**Maintainer**: Kobashi (Teams Architect)

---

## Deployed Configuration Summary

### Current Tenant Identifiers

| Item                      | Value                                  | Status         |
| ------------------------- | -------------------------------------- | -------------- |
| **Tenant ID**             | `62837751-4e48-4d06-8bcb-57be1a669b78` | ✅ Active      |
| **Tenant Name**           | GRAPH_TENANT_ID (from .env)            | Reference only |
| **Allow-List Group ID**   | `5e7708f8-b0d2-467d-97f9-d9da4818084a` | ✅ Active      |
| **Allow-List Group Name** | Teams Meeting Monitors                 | Scoped group   |
| **Azure AD App (Bot) ID** | `1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8` | ✅ Active      |
| **Bot Display Name**      | Teams Meeting Fetcher Bot              | Azure AD app   |

### Azure AD App Registration (Current State)

**App ID**: `1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8`  
**Service Principal**: Created ✅  
**Client Secret**: Exists (rotation recommended every 12 months)

#### Granted Permissions

| Permission                         | Type    | Status     | Required For             |
| ---------------------------------- | ------- | ---------- | ------------------------ |
| `OnlineMeetings.ReadWrite.All`     | AppRole | ✅ Granted | Start recording          |
| `Calls.JoinGroupCall.All`          | AppRole | ✅ Granted | Bot joins meeting        |
| `Calls.Initiate.All`               | AppRole | ✅ Granted | Initiate calls/recording |
| `OnlineMeetingTranscript.Read.All` | AppRole | ✅ Granted | Read transcripts         |
| `OnlineMeetings.Read.All`          | AppRole | ✅ Granted | Read meeting details     |

**Admin Consent**: ✅ Granted for current tenant

### Teams Configuration (Current State)

#### App Manifest

| Field                                     | Current Value                                                           | File Location                          |
| ----------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| Manifest ID (constant across deployments) | `5fb90d80-a7cd-43c0-97e3-eb7577e40169`                                  | `apps/teams-app/manifest.json`         |
| Short Name                                | `Meeting Fetcher`                                                       | `name.short`                           |
| Full Name                                 | `Teams Meeting Fetcher`                                                 | `name.full`                            |
| Bot ID (= App ID)                         | `1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8`                                  | `bots[0].botId`                        |
| Valid Domain                              | `epo20g6lg3.execute-api.us-east-1.amazonaws.com`                        | `validDomains[0]`                      |
| Configuration URL                         | `https://epo20g6lg3.execute-api.us-east-1.amazonaws.com/dev/bot/config` | `configurableTabs[0].configurationUrl` |
| Developer Organization                    | Your Organization                                                       | `developer.name`                       |
| Privacy URL                               | `https://your-domain.com/privacy`                                       | `developer.privacyUrl`                 |

#### Teams Catalog Registration

| Item                         | Status            | Value                              |
| ---------------------------- | ----------------- | ---------------------------------- |
| **Organization App Catalog** | ✅ Uploaded       | Org catalog distribution           |
| **App Distribution Method**  | Organization      | Only available in this org         |
| **Catalog App ID**           | ✅ Auto-assigned  | (Retrieved via Teams Admin Center) |
| **App Name in Catalog**      | `Meeting Fetcher` | Display name                       |
| **Approval Status**          | ✅ Approved       | Available for installation         |

### Teams Admin Policies (Current State)

#### App Setup Policy: "Recorded Line"

| Setting            | Value                  | Scope                                  |
| ------------------ | ---------------------- | -------------------------------------- |
| **Policy Name**    | Recorded Line          | Organization                           |
| **Pinned Apps**    | Meeting Fetcher        | Auto-install for users in group        |
| **Assigned Group** | Teams Meeting Monitors | `5e7708f8-b0d2-467d-97f9-d9da4818084a` |
| **Scope Type**     | Group-scoped           | Only affects group members             |
| **Created**        | 2025-Q4                | Reference only                         |

**Behavior**: When a user in the "Teams Meeting Monitors" group logs into Teams, the Meeting Fetcher bot is automatically pinned to their app bar.

#### Meeting Policy: "Recorded Line"

| Setting                    | Value                  | Scope                                  |
| -------------------------- | ---------------------- | -------------------------------------- |
| **Policy Name**            | Recorded Line          | Organization                           |
| **Transcription Required** | Enabled                | All meetings                           |
| **Cloud Recording**        | Enabled                | All meetings                           |
| **Auto-Recording**         | On for Everyone        | Group members                          |
| **Assigned Group**         | Teams Meeting Monitors | `5e7708f8-b0d2-467d-97f9-d9da4818084a` |
| **Scope Type**             | Group-scoped           | Only affects group members             |

**Behavior**: Meetings attended by users in the "Teams Meeting Monitors" group are automatically recorded and transcribed.

#### Application Access Policy

| Setting          | Value                                   |
| ---------------- | --------------------------------------- |
| **Policy Type**  | Application Access Policy (tenant-wide) |
| **Allowed Apps** | Teams Meeting Fetcher Bot               |
| **Access Level** | Graph API access to online meetings     |
| **Scope**        | Tenant-wide (required by Graph API)     |

**Behavior**: Grants the bot service principal permission to read and write to users' online meetings via Microsoft Graph API.

### Lambda & API Gateway Configuration (Current State)

#### Lambda Function Environment Variables

```env
# Microsoft Graph Configuration
GRAPH_TENANT_ID=62837751-4e48-4d06-8bcb-57be1a669b78
GRAPH_CLIENT_ID=1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8
GRAPH_CLIENT_SECRET=[SECURED IN AWS SECRETS MANAGER]

# Teams Configuration
ENTRA_GROUP_ID=5e7708f8-b0d2-467d-97f9-d9da4818084a
BOT_APP_ID=1b5a61f5-4c7f-41bf-9308-e4adaea6a7c8  # Same as GRAPH_CLIENT_ID

# Webhook Configuration
WEBHOOK_ENDPOINT=https://epo20g6lg3.execute-api.us-east-1.amazonaws.com/webhook
BOT_WEBHOOK_URL=https://epo20g6lg3.execute-api.us-east-1.amazonaws.com/bot/callbacks

# DynamoDB Configuration
MEETINGS_TABLE=tmf-meetings
SUBSCRIPTIONS_TABLE=tmf-subscriptions
```

#### API Gateway Endpoint

| Setting                 | Value                                                    |
| ----------------------- | -------------------------------------------------------- |
| **Base URL**            | `https://epo20g6lg3.execute-api.us-east-1.amazonaws.com` |
| **Stage**               | `dev` (development), `prod` (production)                 |
| **Region**              | `us-east-1`                                              |
| **Distribution Method** | CloudFront (optional)                                    |

### Webhook Subscription (Current State)

| Setting              | Value                                                            |
| -------------------- | ---------------------------------------------------------------- |
| **Subscription ID**  | (Stored in DynamoDB / Graph API)                                 |
| **Resource**         | `/groups/5e7708f8-b0d2-467d-97f9-d9da4818084a/events`            |
| **Change Type**      | `created` (new event notifications)                              |
| **Notification URL** | `https://epo20g6lg3.execute-api.us-east-1.amazonaws.com/webhook` |
| **Expiration**       | Auto-renews every 4320 minutes (3 days)                          |
| **Client State**     | [Configured in Lambda]                                           |

**Status**: ✅ Active and receiving notifications

---

## Deployment Infrastructure (AWS)

### Lambda Functions

| Function                 | Runtime      | Handler              | Status    | Purpose                 |
| ------------------------ | ------------ | -------------------- | --------- | ----------------------- |
| `meeting-bot-handler`    | Node.js 18.x | `handler.js`         | ✅ Active | Bot activity processing |
| `meeting-bot-authorizer` | Node.js 18.x | `authorizer.js`      | ✅ Active | API authorization       |
| `meeting-bot-eventhub`   | Node.js 18.x | Event Hub processor  | ✅ Active | Event Hub integration   |
| `meeting-bot-renewal`    | Python 3.11  | Subscription renewal | ✅ Active | Webhook auto-renewal    |

### DynamoDB Tables

| Table               | Partition Key    | Sort Key      | Status    | Purpose               |
| ------------------- | ---------------- | ------------- | --------- | --------------------- |
| `tmf-meetings`      | `meetingId`      | `timestamp`   | ✅ Active | Meeting records       |
| `tmf-subscriptions` | `subscriptionId` | `tenantId`    | ✅ Active | Webhook subscriptions |
| `tmf-recordings`    | `meetingId`      | `recordingId` | ✅ Active | Recording metadata    |

### Other AWS Resources

| Resource                  | Name                  | Status    |
| ------------------------- | --------------------- | --------- |
| **API Gateway**           | meeting-fetcher-api   | ✅ Active |
| **S3 Bucket**             | transcripts           | ✅ Active |
| **SNS Topic**             | meeting-notifications | ✅ Active |
| **CloudWatch Log Groups** | /aws/lambda/\*        | ✅ Active |

---

## Azure Infrastructure

| Resource                    | Name                  | Lease     | Status    |
| --------------------------- | --------------------- | --------- | --------- |
| **Event Hub Namespace**     | `tmf-ehns-eus-6an5wk` | 30 days   | ✅ Active |
| **Event Hub**               | `tmf-eh-eus-6an5wk`   | 30 days   | ✅ Active |
| **Key Vault**               | `tmf-kv-eus-6an5wk`   | 30 days   | ✅ Active |
| **App Registrations**       | 3 total               | Permanent | ✅ Active |
| **Bot Service**             | `tmf-bot-eus-6an5wk`  | 30 days   | ✅ Active |
| **Log Analytics Workspace** | `tmf-law-eus-6an5wk`  | 30 days   | ✅ Active |

---

## Documentation Index

### How to Use This Reference

1. **For Reproducing in New Tenant**: Read [TEAMS_CONFIGURATION_REPRODUCIBLE.md](./TEAMS_CONFIGURATION_REPRODUCIBLE.md)
2. **For Current Tenant Issues**: Use values in this document (Current Deployment Reference)
3. **For Understanding Architecture**: See [TEAMS_BOT_SPEC.md](./TEAMS_BOT_SPEC.md)
4. **For Inventory & Audit**: Run `python scripts/teams/run-inventory.py`

### When to Update This Document

- [ ] When Azure AD app is rotated (update client secret status)
- [ ] When Teams admin policies are modified
- [ ] When Lambda endpoint URL changes
- [ ] Quarterly (or on request) to verify all configurations still match reality

---

## Verification Checklist

Use this checklist to verify the current deployment is functioning:

```
Last Verified: ___________  By: ___________

Teams Configuration Status:
☐ Azure AD App exists at Azure Portal
☐ All Graph API permissions granted
☐ Bot ID matches manifest ID in app code
☐ Allow-list group exists and has members
☐ Allow-list group ID matches env vars

Teams Admin Center Verification:
☐ "Recorded Line" App Setup Policy exists
☐ "Recorded Line" Meeting Policy exists
☐ "Recorded Line" policies assigned to allow-list group
☐ Teams Meeting Fetcher app in org catalog
☐ App can be installed/pinned by test users

Lambda Verification:
☐ Lambda function has correct env vars
☐ API Gateway endpoint is responding (HTTP 200)
☐ CloudWatch logs show recent activity
☐ Webhook endpoint is accessible from Graph API

Webhook Verification:
☐ Subscription is active in DynamoDB
☐ Expiration is > 24 hours away
☐ Recent events are appearing in Lambda logs
☐ Auto-renewal job has run recently

End-to-End Test:
☐ Created test meeting in allow-list user account
☐ Bot notification triggered Lambda within 5 seconds
☐ Meeting recorded in Teams
☐ Transcript available in Graph API

Overall Status: ☐ HEALTHY  ☐ NEEDS ATTENTION
Notes: _________________________________________
```

---

## Emergency Contacts & Escalation

| Issue                             | Contact                   | Escalation                  |
| --------------------------------- | ------------------------- | --------------------------- |
| Teams admin policies not applying | Teams Admin               | Microsoft 365 Support       |
| Bot not joining meetings          | Kobashi / Teams Architect | Microsoft Graph API support |
| Lambda errors                     | DevOps / Backend          | AWS Support                 |
| Graph API permission issues       | Kobashi / Security        | Microsoft Identity support  |

---

## Change Log

| Date       | Change                     | Requester | Status    |
| ---------- | -------------------------- | --------- | --------- |
| 2026-02-24 | Created reference document | Kobashi   | ✅ Active |
