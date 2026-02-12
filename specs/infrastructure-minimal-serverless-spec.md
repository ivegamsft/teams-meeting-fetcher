# Teams Meeting Fetcher - Minimal Serverless Infrastructure

Lightweight Terraform specification for Teams Meeting Fetcher using serverless architecture with minimal infrastructure. Uses AWS Lambda for processing and Azure Event Grid for event routing.

IaC folder layout:
- Terraform code lives in [iac/aws/](../iac/aws/)
- Lambda source lives in [apps/aws-lambda/](../apps/aws-lambda/)

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Azure Infrastructure (Minimal)](#azure-infrastructure-minimal)
3. [AWS Infrastructure](#aws-infrastructure)
4. [Terraform Configuration](#terraform-configuration)
5. [Deployment Guide](#deployment-guide)
6. [Cost Estimation](#cost-estimation)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Microsoft Teams                               │
│              (Calendar Events / Recordings)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              (Graph API Change Notifications)
                           │
        ┌──────────────────▼──────────────────┐
        │   AWS API Gateway                    │
        │   (receives Graph webhooks)          │
        │   https://{api-id}.execute-api      │
        │     .{region}.amazonaws.com/graph   │
        └──────────────────┬──────────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │   AWS Lambda                         │
        │  (subscription manager +             │
        │   webhook processor)                 │
        │   • Enumerates group members         │
        │   • Creates Graph subscriptions      │
        │   • Processes notifications          │
        │   • Publishes events to Event Grid   │
        └──────────────────┬──────────────────┘
                           │
              (Event Grid Publishing)
                           │
        ┌──────────────────▼──────────────────┐
        │  Azure Event Grid Topic              │
        │  (routes transcript-ready events)    │
        └──────────────────┬──────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │   AWS     │   │  Azure    │   │  External │
    │   SNS     │   │  Logic    │   │  Webhook  │
    │ (notify)  │   │   Apps    │   │ (custom)  │
    └───────────┘   └───────────┘   └───────────┘
```

**Key Features:**
- Zero servers to manage (serverless)
- Minimal infrastructure (no containers, no app services)
- Event-driven architecture
- Auto-scaling (Lambda + Event Grid)
- Pay-per-use pricing

---

## Azure Infrastructure (Minimal)

### 1. Resource Group

```hcl
resource "azurerm_resource_group" "main" {
  name     = "rg-tmf-${var.environment}-${var.region_short}"
  location = var.azure_region
  
  tags = local.common_tags
}
```

### 2. Key Vault (for Graph API credentials)

```hcl
resource "azurerm_key_vault" "main" {
  name                = "kv-tmf-${var.environment}-${random_string.kv_suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  
  sku_name = "standard"
  
  enabled_for_disk_encryption      = false
  enabled_for_deployment           = false
  enabled_for_template_deployment  = false
  
  public_network_access_enabled = true  # Accessible from Lambda
  rbac_authorization_enabled    = true
  
  purge_protection_enabled   = true
  soft_delete_retention_days = 7
  
  tags = local.common_tags
}

# Store Graph credentials
resource "azurerm_key_vault_secret" "graph_tenant_id" {
  name         = "graph-tenant-id"
  value        = data.azurerm_client_config.current.tenant_id
  key_vault_id = azurerm_key_vault.main.id
}

resource "azurerm_key_vault_secret" "graph_client_id" {
  name         = "graph-client-id"
  value        = azuread_application.main.client_id
  key_vault_id = azurerm_key_vault.main.id
}

resource "azurerm_key_vault_secret" "graph_client_secret" {
  name         = "graph-client-secret"
  value        = azuread_application_password.main.value
  key_vault_id = azurerm_key_vault.main.id
}

resource "azurerm_key_vault_secret" "entra_group_id" {
  name         = "entra-group-id"
  value        = local.entra_group_id
  key_vault_id = azurerm_key_vault.main.id
}

resource "azurerm_key_vault_secret" "event_grid_key" {
  name         = "eventgrid-key"
  value        = azurerm_eventgrid_topic.main.primary_access_key
  key_vault_id = azurerm_key_vault.main.id
}
```

### 3. Event Grid Topic (event routing)

```hcl
resource "azurerm_eventgrid_topic" "main" {
  name                = "evgt-tmf-${var.environment}-${var.region_short}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  
  public_network_access_enabled = true
  
  tags = local.common_tags
}

# Subscription: Route transcript-ready events to AWS
resource "azurerm_eventgrid_event_subscription" "aws_transcription_ready" {
  name              = "sub-aws-transcriptions"
  scope             = azurerm_eventgrid_topic.main.id
  event_delivery_schema = "EventGridSchema"
  
  webhook_endpoint {
    url = "https://${aws_apigateway_rest_api.transcription_events.id}.execute-api.${var.aws_region}.amazonaws.com/prod/transcriptions"
    
    # Authentication: API key in header
    azure_function_single_header_values = {
      "X-API-Key" = var.aws_webhook_api_key
    }
  }
  
  # Filter: Only transcript-ready events
  advanced_filter {
    string_in {
      key    = "eventType"
      values = ["transcription.ready"]
    }
  }
  
  # Retry policy
  retry_policy {
    event_time_to_live_minutes = 1440  # 24 hours
    max_delivery_attempts      = 30
  }
}

output "eventgrid_topic_uri" {
  value = azurerm_eventgrid_topic.main.endpoint
}

output "eventgrid_topic_key" {
  value     = azurerm_eventgrid_topic.main.primary_access_key
  sensitive = true
}
```

### 4. Entra App Registration

```hcl
resource "azuread_application" "main" {
  display_name = "teams-meeting-fetcher-${var.environment}"
  description  = "Serverless webhook processor for Teams meetings"
  
  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000"  # Microsoft Graph
    
    resource_access {
      id   = "5f8c8dbb-01c1-4f79-83c8-a80a4ce7e231"  # GroupMember.Read.All
      type = "Role"
    }
    
    resource_access {
      id   = "2ba27b99-cd9d-430e-b8ad-8f8e5ccc726c"  # Calendars.Read.All
      type = "Role"
    }
    
    resource_access {
      id   = "dfabfca4-ee0f-4218-b897-c24fb2fb4698"  # OnlineMeetingRecording.Read.All
      type = "Role"
    }
    
    resource_access {
      id   = "d55c4eca-6f3f-4d6a-b7bd-dc7c28c3906e"  # CallTranscripts.Read.All
      type = "Role"
    }
  }
  
  owners = [data.azurerm_client_config.current.object_id]
}

resource "azuread_service_principal" "main" {
  client_id = azuread_application.main.client_id
  owners    = [data.azurerm_client_config.current.object_id]
}

# Client secret (1 year rotation)
resource "azuread_application_password" "main" {
  application_id    = azuread_application.main.id
  display_name      = "lambda-secret-${var.environment}"
  end_date_relative = "8760h"
}

# Grant admin consent for app permissions
resource "azuread_app_role_assignment" "group_member_read" {
  app_role_id         = "5f8c8dbb-01c1-4f79-83c8-a80a4ce7e231"
  principal_object_id = azuread_service_principal.main.object_id
  resource_object_id  = azuread_service_principal.msgraph.object_id
}

resource "azuread_app_role_assignment" "calendars_read" {
  app_role_id         = "2ba27b99-cd9d-430e-b8ad-8f8e5ccc726c"
  principal_object_id = azuread_service_principal.main.object_id
  resource_object_id  = azuread_service_principal.msgraph.object_id
}

resource "azuread_app_role_assignment" "recording_read" {
  app_role_id         = "dfabfca4-ee0f-4218-b897-c24fb2fb4698"
  principal_object_id = azuread_service_principal.main.object_id
  resource_object_id  = azuread_service_principal.msgraph.object_id
}

resource "azuread_app_role_assignment" "transcript_read" {
  app_role_id         = "d55c4eca-6f3f-4d6a-b7bd-dc7c28c3906e"
  principal_object_id = azuread_service_principal.main.object_id
  resource_object_id  = azuread_service_principal.msgraph.object_id
}

data "azuread_service_principal" "msgraph" {
  client_id = "00000003-0000-0000-c000-000000000000"
}
```

### 5. Key Vault Access (allow Lambda to read secrets)

```hcl
# Get Lambda service principal
data "azuread_service_principal" "lambda" {
  client_id = var.aws_lambda_principal_id  # From AWS
}

# Allow Lambda to read secrets from Key Vault
resource "azurerm_role_assignment" "lambda_kv_reader" {
  scope              = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id       = data.azuread_service_principal.lambda.object_id
}
```

---

## AWS Infrastructure

### 1. IAM Role for Lambda

```hcl
resource "aws_iam_role" "lambda_role" {
  name = "tmf-lambda-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
  
  tags = local.common_tags
}

# Policy: Read from Key Vault
resource "aws_iam_role_policy" "lambda_keyvault" {
  name = "tmf-lambda-keyvault"
  role = aws_iam_role.lambda_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:tmf/*"
    }]
  })
}

# Policy: CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

output "lambda_role_arn" {
  value = aws_iam_role.lambda_role.arn
}
```

### 2. Lambda Function (Node.js)

```hcl
resource "aws_lambda_function" "graph_webhook_processor" {
  filename         = "lambda.zip"
  function_name    = "tmf-graph-webhook-${var.environment}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "dist/index.handler"
  runtime          = "nodejs18.x"
  timeout          = 60
  memory_size      = 512
  
  environment {
    variables = {
      GRAPH_TENANT_ID    = var.graph_tenant_id
      GRAPH_CLIENT_ID    = var.graph_client_id
      ENTRA_GROUP_ID     = var.entra_group_id
      AZURE_KEYVAULT_URL = azurerm_key_vault.main.vault_uri
      EVENTGRID_ENDPOINT = azurerm_eventgrid_topic.main.endpoint
      EVENTGRID_KEY      = azurerm_eventgrid_topic.main.primary_access_key
      WEBHOOK_AUTH_SECRET = var.webhook_auth_secret
      ENVIRONMENT        = var.environment
    }
  }
  
  layers = [
    aws_lambda_layer_version.dependencies.arn
  ]
  
  tags = local.common_tags
}

# Lambda layer for dependencies
resource "aws_lambda_layer_version" "dependencies" {
  filename   = "lambda-dependencies.zip"
  layer_name = "tmf-dependencies"
  
  source_code_hash = filebase64sha256("lambda-dependencies.zip")
  
  compatible_runtimes = ["nodejs18.x"]
}
```

### 3. API Gateway

```hcl
resource "aws_apigateway_rest_api" "graph_webhooks" {
  name        = "tmf-graph-webhooks-${var.environment}"
  description = "Teams Meeting Fetcher Graph API webhooks"
  
  endpoint_configuration {
    types = ["REGIONAL"]
  }
  
  tags = local.common_tags
}

# Resource: /graph
resource "aws_apigateway_resource" "graph" {
  rest_api_id = aws_apigateway_rest_api.graph_webhooks.id
  parent_id   = aws_apigateway_rest_api.graph_webhooks.root_resource_id
  path_part   = "graph"
}

# Method: POST /graph
resource "aws_apigateway_method" "graph_post" {
  rest_api_id      = aws_apigateway_rest_api.graph_webhooks.id
  resource_id      = aws_apigateway_resource.graph.id
  http_method      = "POST"
  authorization    = "CUSTOM"
  authorizer_id    = aws_apigateway_authorizer.bearer_token.id
}

# Integration: Lambda
resource "aws_apigateway_integration" "graph_lambda" {
  rest_api_id      = aws_apigateway_rest_api.graph_webhooks.id
  resource_id      = aws_apigateway_resource.graph.id
  http_method      = aws_apigateway_method.graph_post.http_method
  type             = "AWS_PROXY"
  integration_http_method = "POST"
  uri              = aws_lambda_function.graph_webhook_processor.invoke_arn
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graph_webhook_processor.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigateway_rest_api.graph_webhooks.execution_arn}/*/*"
}

# Authorizer: Bearer Token validation
resource "aws_apigateway_authorizer" "bearer_token" {
  name          = "tmf-bearer-token"
  type          = "TOKEN"
  rest_api_id   = aws_apigateway_rest_api.graph_webhooks.id
  identity_source = "method.request.header.Authorization"
  
  authorizer_uri = aws_lambda_function.bearer_token_authorizer.invoke_arn
  
  depends_on = [aws_lambda_function.bearer_token_authorizer]
}

# Lambda: Bearer token authorizer
resource "aws_lambda_function" "bearer_token_authorizer" {
  filename      = "lambda-authorizer.zip"
  function_name = "tmf-bearer-token-${var.environment}"
  role          = aws_iam_role.lambda_role.arn
  handler       = "dist/authorizer.handler"
  runtime       = "nodejs18.x"
  
  environment {
    variables = {
      WEBHOOK_AUTH_SECRET = var.webhook_auth_secret
    }
  }
}

# Permission: API Gateway can invoke authorizer
resource "aws_lambda_permission" "authorizer" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bearer_token_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigateway_rest_api.graph_webhooks.execution_arn}/authorizers/*"
}

# Deployment
resource "aws_apigateway_deployment" "main" {
  rest_api_id = aws_apigateway_rest_api.graph_webhooks.id
  stage_name  = var.environment
  
  depends_on = [
    aws_apigateway_integration.graph_lambda
  ]
}

output "api_endpoint" {
  value = aws_apigateway_deployment.main.invoke_url
}
```

### 4. CloudWatch Logs

```hcl
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/tmf-${var.environment}"
  retention_in_days = 30
  
  tags = local.common_tags
}
```

### 5. SNS Topic (optional: notify on transcript ready)

```hcl
resource "aws_sns_topic" "transcription_ready" {
  name = "tmf-transcription-ready-${var.environment}"
  
  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "email_notification" {
  topic_arn = aws_sns_topic.transcription_ready.arn
  protocol  = "email"
  endpoint  = var.notification_email
}
```

---

## Terraform Configuration

### Variables

```hcl
variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "azure_region" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

variable "region_short" {
  description = "Short region code"
  type        = string
  default     = "eus"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
  sensitive   = true
}

variable "graph_tenant_id" {
  description = "Entra tenant ID"
  type        = string
}

variable "graph_client_id" {
  description = "Graph app client ID"
  type        = string
}

variable "entra_group_id" {
  description = "Target Entra group ID"
  type        = string
}

variable "webhook_auth_secret" {
  description = "Bearer token for webhook authentication"
  type        = string
  sensitive   = true
}

variable "aws_webhook_api_key" {
  description = "API key for Event Grid → AWS authentication"
  type        = string
  sensitive   = true
}

variable "notification_email" {
  description = "Email for SNS notifications"
  type        = string
}

variable "aws_lambda_principal_id" {
  description = "AWS Lambda service principal ID (for cross-account)"
  type        = string
  default     = "000000000000"  # Get from AWS account
}

locals {
  common_tags = {
    Project     = "TeamsMeetingFetcher"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
```

### Providers

```hcl
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = false
    }
  }
}

provider "awsaws" {
  region = var.aws_region
}
```

### Outputs

```hcl
output "api_webhook_url" {
  value       = "${aws_apigateway_deployment.main.invoke_url}/graph"
  description = "URL to provide to Graph API subscriptions"
}

output "eventgrid_topic_endpoint" {
  value       = azurerm_eventgrid_topic.main.endpoint
  description = "Event Grid topic endpoint"
}

output "lambda_function_name" {
  value       = aws_lambda_function.graph_webhook_processor.function_name
  description = "Lambda function name for logs/monitoring"
}

output "sns_topic_arn" {
  value       = aws_sns_topic.transcription_ready.arn
  description = "SNS topic for notifications"
}

output "keyvault_uri" {
  value       = azurerm_key_vault.main.vault_uri
  description = "Key Vault URI for credential storage"
}
```

---

## Deployment Guide

### Prerequisites

```bash
# Azure CLI
az login
az account set --subscription <subscription-id>

# AWS CLI
aws configure

# Terraform
terraform version  # >= 1.0
```

### 1. Create terraform.tfvars

```hcl
environment              = "prod"
azure_region             = "eastus"
aws_region               = "us-east-1"
aws_account_id           = "<REPLACE_ME>"
graph_tenant_id          = "<REPLACE_ME>"
graph_client_id          = "<REPLACE_ME>"
entra_group_id           = "<REPLACE_ME>"
webhook_auth_secret      = "<REPLACE_ME>"
aws_webhook_api_key      = "<REPLACE_ME>"
notification_email       = "admin@example.com"
aws_lambda_principal_id  = "<REPLACE_ME>"
```

### 2. Deploy

```bash
# Initialize
terraform init

# Plan
terraform plan -out=tfplan

# Apply
terraform apply tfplan

# Get outputs
terraform output -json > deployment-outputs.json
```

### 3. Post-Deployment

```bash
# Get webhook URL
WEBHOOK_URL=$(terraform output -raw api_webhook_url)

# Get Event Grid key
EVENTGRID_KEY=$(terraform output -raw eventgrid_topic_key)

# Create Graph subscriptions (manual or via Lambda on-demand call)
# Lambda will auto-create on first invocation
```

### 4. Grant Admin Consent

```bash
APP_ID=$(terraform output -raw graph_app_id)
az ad app permission admin-consent --id $APP_ID
```

---

## Lambda Code Example

### index.ts (main webhook handler)

```typescript
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { EventGridPublisherClient, AzureKeyCredential } from '@azure/eventgrid';
import axios from 'axios';

const keyVaultUrl = process.env.AZURE_KEYVAULT_URL;
const eventGridEndpoint = process.env.EVENTGRID_ENDPOINT;
const eventGridKey = process.env.EVENTGRID_KEY;

const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(keyVaultUrl, credential);

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Parse notification
    const notifications = JSON.parse(event.body || '[]');
    
    // Authenticate with Graph API
    const secrets = await Promise.all([
      secretClient.getSecret('graph-tenant-id'),
      secretClient.getSecret('graph-client-id'),
      secretClient.getSecret('graph-client-secret')
    ]);

    const tenantId = secrets[0].value;
    const clientId = secrets[1].value;
    const clientSecret = secrets[2].value;

    // Get access token
    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Process notifications
    for (const notification of notifications) {
      // Check for recording
      const recordingResult = await axios.post(
        `https://graph.microsoft.com/v1.0/me/events/${notification.data.eventId}/microsoft.graph.getOnlineMeetingRecordings()`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (recordingResult.data.value?.length > 0) {
        // Publish transcript-ready event to Event Grid
        const eventGridClient = new EventGridPublisherClient(
          eventGridEndpoint,
          new AzureKeyCredential(eventGridKey)
        );

        await eventGridClient.sendEvents([
          {
            eventType: 'transcription.ready',
            subject: `/meetings/${notification.data.eventId}`,
            dataVersion: '1.0',
            data: {
              meetingId: notification.data.eventId,
              recordingUrl: recordingResult.data.value[0].contentUrl,
              timestamp: new Date()
            }
          }
        ]);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'OK' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
```

---

## Cost Estimation

| Service | Usage | Est. Cost/Month |
|---------|-------|-----------------|
| AWS Lambda | ~10,000 invocations/month | $0.20 |
| API Gateway | ~10,000 requests | $3.50 |
| Azure Event Grid | ~10,000 events | $1.00 |
| Azure Key Vault | ~5 requests/day | $0.67 |
| SNS (notifications) | ~100 notifications | $0.50 |
| CloudWatch Logs | ~1GB/month | $0.50 |
| **Total Estimated** | | **~$6-10/month** |

---

## Next Steps

1. **Get AWS Subscription** - Standard AWS account
2. **Deploy Terraform** - Both Azure and AWS resources
3. **Lambda Layer** - Package Node dependencies
4. **Entra Admin Consent** - Grant Graph API permissions
5. **Test** - Create sample meeting, verify webhook flow
6. **Monitor** - CloudWatch logs + Event Grid diagnostics

