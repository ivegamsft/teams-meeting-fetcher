# Communication Flow Diagrams — Code-Based Implementation

Complete communication flows with **infrastructure-as-code (IaC) and source code references** for production deployment and runtime behavior.

## Code-Based Flows

Each flow is documented in a separate file with:

- **Sequence diagram** showing the complete interaction
- **Sample payloads** from actual webhook notifications
- **IaC Definition (Primary)**: Terraform modules for infrastructure provisioning
- **Source code references**: Production code with file paths and line numbers
- **Runtime Locations**: Where each component executes (AWS Lambda, local scripts, Terraform)

### Available Flows

1. **[Bot Installation & Initial Setup](01-bot-installation.md)**  
   Azure AD app registration, permission grants, and initial authentication setup.

2. **[Webhook Subscription Creation](02-webhook-subscription.md)**  
   Creating Graph webhook subscriptions with validation handshake.

3. **[Meeting Notification Flow](03-meeting-notification.md)**  
   Real-time webhook delivery when meetings are created or updated.

4. **[Recording Available Notification](04-recording-available.md)**  
   Event notification flow when meeting recordings are ready.

5. **[Transcript Processing](05-transcript-processing.md)**  
   Complete flow from meeting end to transcript download and storage.

6. **[Subscription Renewal](06-subscription-renewal.md)**  
   Automated subscription renewal before expiration.

## Infrastructure Overview

The system uses the following AWS infrastructure components:

- **API Gateway**: REST API endpoint accepting Graph webhooks
- **Lambda Authorizer**: Validates clientState before processing
- **Webhook Handler Lambda**: Processes and stores notifications to S3
- **S3 Bucket**: Stores webhook payloads and transcripts
- **EventBridge**: Scheduled renewal of Graph subscriptions
- **Renewal Lambda**: Python function renewing expiring subscriptions
- **SNS Topic**: Notification alerts for errors

All infrastructure is defined in Terraform under [`iac/aws/`](../../iac/aws/).

## Documentation Structure

This directory provides **code-based flows** with emphasis on:

- **Terraform/IaC** as the primary deployment method
- **Production code** (Node.js, Python) with exact file locations
- **Runtime context** (where code executes)

### Alternative Documentation

- **[COMMUNICATION_FLOW_DIAGRAMS.md](../COMMUNICATION_FLOW_DIAGRAMS.md)** — Manual/bootstrap flow for initial setup using scripts and manual steps (alternative to IaC)

### Related Resources

- [Webhook Specification](../../specs/docs/webhook-specification.md)
- [Infrastructure Spec](../../specs/infrastructure-minimal-serverless-spec.md)
- [Setup Guide](../../specs/setup-guide.md)

## Sample Payloads

Sample webhook payloads used for testing are available in:

- [sample-webhook.json](../../apps/aws-lambda/sample-webhook.json)
- [test-event.json](../../apps/aws-lambda/test-event.json)
