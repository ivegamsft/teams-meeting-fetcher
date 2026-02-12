# Teams Meeting Fetcher Specifications

This directory contains all technical specifications and documentation for the Teams Meeting Fetcher project, organized for SpecKit compatibility.

## Specification Structure

```
specs/
├── system-specification.md                    # Complete system architecture & design
├── setup-guide.md                             # Step-by-step deployment guide
├── infrastructure-terraform-spec.md           # Full-featured Azure infra (Container Apps)
├── infrastructure-minimal-serverless-spec.md  # Minimal serverless (Lambda + Event Grid)
└── docs/
    ├── api-reference.md                       # REST API endpoint documentation
    ├── webhook-specification.md               # Microsoft Graph webhook implementation
    └── usage-examples.md                      # Code examples & integrations
```

## Key Documents

### 1. [System Specification](./system-specification.md)
**Complete technical specification** covering:
- Architecture overview with diagrams
- Component specifications (Teams app, external service, UI)
- Authentication & security model
- API endpoint specifications
- Data models (TypeScript interfaces)
- Workflow documentation
- Deployment options
- Testing strategy

**When to use**: Understanding overall system design, making architectural decisions

### 2. [Setup Guide](./setup-guide.md)
**Step-by-step deployment instructions**:
- Prerequisites checklist
- Entra app registration
- Graph API permissions
- Entra group configuration
- External app deployment (Docker, systemd, cloud)
- HTTPS/reverse proxy setup
- Verification procedures
- Troubleshooting

**When to use**: Deploying the application, configuring infrastructure

### 3. [API Reference](./docs/api-reference.md)
**Complete REST API documentation**:
- All endpoints with request/response schemas
- Query parameters & filters
- Error codes & handling
- Rate limiting
- Authentication
- Pagination

**When to use**: Integrating with the API, building clients

### 4. [Webhook Specification](./docs/webhook-specification.md)
**Microsoft Graph webhook implementation**:
- Bearer token authentication
- Graph subscription management
- Notification processing flow
- Transcription polling strategy
- Idempotency handling
- Subscription lifecycle
- Error handling & monitoring

**When to use**: Understanding webhook behavior, debugging notification issues

### 5. [Usage Examples](./docs/usage-examples.md)
**Practical code examples**:
- JavaScript/Node.js client
- Python client
- cURL examples
- Integration examples (Slack, Email, SharePoint, S3)
- Automation scripts (daily digest, compliance)
- Testing examples

**When to use**: Implementing integrations, learning how to use the API

### 6. [Infrastructure Terraform Specification](./infrastructure-terraform-spec.md)
**Azure cloud infrastructure as code**:
- Complete architecture overview with diagrams
- VNet design (subnets, NSGs, routing)
- Resource specifications (Container Apps, ACR, Key Vault, Storage, Event Grid)
- Security architecture (RBAC, managed identities, private endpoints)
- Private endpoint configuration for all PaaS services
- Monitoring & logging strategy
- Best practices applied (zero-trust, HA, compliance, cost optimization)
- Terraform variables, outputs, and deployment process
- Cost estimation

**When to use**: Deploying to Azure, understanding infrastructure design, provisioning resources with IaC

### 7. [Minimal Serverless Infrastructure Specification](./infrastructure-minimal-serverless-spec.md)
**Lightweight serverless deployment** (recommended for new AWS accounts):
- AWS Lambda for webhook processing & subscription management
- Azure Event Grid for event routing
- Azure Key Vault for credentials
- Minimal infrastructure footprint (~$6-10/month)
- Complete Terraform code for both AWS and Azure
- Lambda code examples (Node.js)
- Cross-account authentication patterns
- Event-driven architecture

**When to use**: Minimal infrastructure, new AWS account, cost-conscious deployments, event-driven integration with AWS services

## Infrastructure Comparison

| Aspect | Full Container Infra | Minimal Serverless |
|--------|----------------------|-------------------|
| **Compute** | Container Apps | Lambda |
| **Registry** | ACR | None (code only) |
| **Networking** | VNet + NSGs + PEs | API Gateway |
| **Event Routing** | Event Grid | Event Grid |
| **Secrets** | Key Vault | Key Vault |
| **Est. Cost/month** | $180-375 | $6-10 |
| **Min Time to Deploy** | 30-45 min | 15-20 min |
| **Scaling** | Manual replica config | Automatic (Lambda) |
| **Best For** | Enterprise, high volume | Startups, cost-conscious, <100/day |

## Quick Navigation

| Task | Document |
|------|----------|
| Understand the system | [System Specification](./system-specification.md) |
| Deploy the application | [Setup Guide](./setup-guide.md) |
| Full Azure infrastructure | [Infrastructure Terraform Specification](./infrastructure-terraform-spec.md) |
| Minimal serverless (Lambda + AWS) | [Minimal Serverless Specification](./infrastructure-minimal-serverless-spec.md) |
| Build an API client | [API Reference](./docs/api-reference.md) + [Usage Examples](./docs/usage-examples.md) |
| Debug webhooks | [Webhook Specification](./docs/webhook-specification.md) |
| Integrate with other services | [Usage Examples](./docs/usage-examples.md) |
| Configure security | [System Specification](./system-specification.md) Section 9 + [Infrastructure Specification](./infrastructure-terraform-spec.md) Security sections |

## Specification Principles

These specifications follow:
- ✅ **Completeness**: All system aspects documented
- ✅ **Clarity**: Technical but readable
- ✅ **Actionability**: Includes concrete examples
- ✅ **Maintainability**: Structured for easy updates
- ✅ **SpecKit Compatibility**: Organized for SpecKit workflows

## Contributing to Specs

When updating specifications:
1. Keep system-specification.md as single source of truth
2. Update related docs if changes affect them
3. Maintain consistent terminology
4. Include examples for new features
5. Update this README if structure changes

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-11 | Initial specification suite |

