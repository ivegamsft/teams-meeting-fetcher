---
description: Complete end-to-end testing, building, and deployment with log watching
---

## User Input

```text
$ARGUMENTS
```

You **MUST** acknowledge the user input before proceeding.

## Overview

This agent runs the full E2E workflow:

1. Lint and type checks
2. Run unit tests
3. Build the project
4. Deploy infrastructure (AWS, Azure, or both)
5. Update Lambda code
6. Launch log watchers in background
7. Run smoke tests
8. Present next-steps menu

## Workflow

### Step 1: Code Quality Checks

1. Run linter: `npm run lint`
   - If errors found, offer to auto-fix: `npm run lint:fix`
2. Run type check: `npm run type-check`
3. If either fails, ask: "Fix issues before proceeding? (yes/no)"

### Step 2: Unit Tests

1. Run tests: `npm test`
2. Report coverage summary
3. If any tests fail, ask: "Proceed anyway? (yes/no)"

### Step 3: Build

1. Run build: `npm run build`
2. Confirm build succeeded

### Step 4: Ask Deployment Target

Present options:

- **AWS only**
- **Azure only**
- **Both AWS and Azure**

### Step 5: Deploy Infrastructure (if selected)

1. Follow unified deployment workflow (see `deploy-unified.agent.md`)
   - Verify credentials
   - Plan Terraform
   - Apply Terraform
   - Deploy Lambda code
   - Update `.env.local`

### Step 6: Deploy Azure (if selected)

1. Verify tenant (see `deploy-azure.agent.md`)
2. Follow Azure deployment workflow
   - Plan Terraform
   - Apply Terraform
   - Update `.env.local.azure`

### Step 7: Launch Log Watchers (Background)

Start log tailing in **background terminals** (do not block):

**For AWS:**

```bash
# Main Lambda logs
aws logs tail /aws/lambda/<function-name> --follow --format short --profile tmf-dev

# Authorizer logs (optional)
aws logs tail /aws/lambda/<authorizer-name> --follow --format short --profile tmf-dev
```

**For Azure (if deployed):**

```bash
az webapp log tail --name <app-name> --resource-group <rg-name>
```

Report: "Log watchers started in background ✅"

### Step 8: Run Smoke Tests

1. Verify Graph API credentials:

   ```bash
   python scripts/graph/01-verify-setup.py
   ```

2. Check webhook subscriptions:

   ```bash
   python scripts/graph/check-subscriptions.py
   ```

3. Test webhook endpoint (basic connectivity):
   ```bash
   curl -s -o /dev/null -w "%{http_code}" <webhook_url>
   ```

All tests should show ✅ PASS

### Step 9: Present Next Steps Menu

Display a menu of suggested next actions:

```
🎯 NEXT STEPS — Choose an action:

1. Create webhook subscription
   python scripts/graph/02-create-webhook-subscription.py

2. Create test meeting
   python scripts/graph/03-create-test-meeting.py

3. Poll for transcription
   python scripts/graph/04-poll-transcription.py

4. Send manual webhook test
   python scripts/graph/06-test-webhook.py

5. Check CloudWatch logs
   (Already tailing in background terminal)

6. Check recordings
   python scripts/graph/check_recordings.py

7. View deployment summary

8. Exit && continue monitoring logs

9. Tear down (Ctrl+C log watchers, then destroy infra)
```

Wait for user selection and execute or provide the command.

### Step 10: Summary Report

Display a comprehensive E2E summary:

```
✅ END-TO-END DEPLOYMENT COMPLETE

📋 Quality Checks:
  ✅ Lint: PASS
  ✅ Type Check: PASS
  ✅ Tests: 47/47 PASS

🏗️ Build:
  ✅ npm run build completed

🚀 Infrastructure:
  ✅ AWS: 8 resources deployed
  ✅ Azure: 6 resources deployed (if selected)

⚙️ Lambda:
  ✅ Code deployed to tmf-webhook-handler

🔔 Subscriptions:
  ✅ 2 webhook subscriptions active

📊 Endpoints:
  ├─ AWS Webhook: https://xxx.execute-api.us-east-1.amazonaws.com/webhook
  ├─ Graph API: Verified ✅
  └─ Subscriptions: Active ✅

📝 Log Watchers:
  ✅ Running in background (2 terminals)

🎯 Recommended Next: Create test meeting or deploy to Teams
```

## Rules

- **Skip code quality checks only if explicitly asked**
- **Never deploy without passing tests**
- **Always show logs in background** — do not block terminal
- **If deployment fails at any step, stop and ask user** to fix before retrying
- **Log watchers stay active** — user can kill them later
- AWS profile: `tmf-dev`
- For Azure, tenant verification is mandatory (done in deploy-azure step)

## Cancellation Points

User can cancel at:

- After lint errors (ask to fix)
- After test failures (ask to proceed anyway)
- After build failure (stop)
- Before deployment (ask for target selection)
