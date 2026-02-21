# Flow 2: Webhook Subscription Creation

This flow shows how Microsoft Graph webhook subscriptions are created for each monitored user, including the validation handshake that Graph performs to verify the endpoint.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant App as Application
    participant AAD as Azure AD
    participant Graph as Microsoft Graph API
    participant APIGW as API Gateway
    participant Auth as Lambda Authorizer
    participant Lambda as Webhook Handler

    Note over App,Lambda: Phase 1 - Get Access Token

    App->>AAD: POST /oauth2/v2.0/token
    activate AAD
    Note right of App: grant_type=client_credentials<br/>client_id=CLIENT_ID<br/>client_secret=SECRET<br/>scope=https://graph.microsoft.com/.default
    AAD-->>App: Access Token + expires_in
    deactivate AAD

    Note over App,Lambda: Phase 2 - Fetch Group Members

    App->>Graph: GET /groups/groupId/members
    activate Graph
    Note right of App: Authorization: Bearer token
    Graph-->>App: Return Member List
    deactivate Graph

    Note over App,Lambda: Phase 3 - Create Subscription per user

    loop For Each Group Member
        App->>Graph: POST /subscriptions
        activate Graph
        Note right of App: changeType: created,updated<br/>notificationUrl: AWS endpoint<br/>resource: /users/userId/events<br/>expirationDateTime: +29 days<br/>clientState: random-uuid

        Note over Graph,APIGW: Subscription Validation

        Graph->>APIGW: GET /graph?validationToken=token
        activate APIGW
        APIGW->>Auth: Invoke Authorizer
        activate Auth
        Auth->>Auth: Detect validationToken query
        Auth-->>APIGW: Allow Policy
        deactivate Auth

        APIGW->>Lambda: Route GET request
        activate Lambda
        Lambda->>Lambda: Extract validationToken
        Lambda-->>APIGW: Echo validationToken (text/plain)
        deactivate Lambda
        APIGW-->>Graph: Return token (200 OK)
        deactivate APIGW

        Graph-->>App: Subscription Created
        Note over Graph,App: Returns subscription ID<br/>and expiration date

        App->>App: Store Subscription Info
    end

    Note over App,Lambda: All Subscriptions Active
```

## Sample Payloads

### Create Subscription Request

```http
POST https://graph.microsoft.com/v1.0/subscriptions HTTP/1.1
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJub25jZSI6IjEyMzQ1Njc4OTAi...
Content-Type: application/json

{
  "changeType": "created,updated",
  "notificationUrl": "https://abc123def456.execute-api.us-east-1.amazonaws.com/dev/graph",
  "resource": "/users/john.doe@contoso.com/events",
  "expirationDateTime": "2026-03-19T18:23:45.935Z",
  "clientState": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Validation Handshake (GET Request)

```http
GET /dev/graph?validationToken=Validate.0123456789abcdef HTTP/1.1
Host: abc123def456.execute-api.us-east-1.amazonaws.com
Content-Type: application/json
```

**API Gateway Event to Lambda:**

```json
{
  "resource": "/graph",
  "path": "/dev/graph",
  "httpMethod": "GET",
  "queryStringParameters": {
    "validationToken": "Validate.0123456789abcdef"
  },
  "headers": {
    "Content-Type": "application/json",
    "Host": "abc123def456.execute-api.us-east-1.amazonaws.com"
  },
  "requestContext": {
    "requestId": "12345-67890-abcde-fghij",
    "stage": "dev"
  }
}
```

**Lambda Response:**

```http
HTTP/1.1 200 OK
Content-Type: text/plain

Validate.0123456789abcdef
```

### Create Subscription Response

```json
{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#subscriptions/$entity",
  "id": "7f103c7e-4e2e-4d1b-8e0f-7c12345abcde",
  "resource": "/users/john.doe@contoso.com/events",
  "changeType": "created,updated",
  "clientState": "550e8400-e29b-41d4-a716-446655440000",
  "notificationUrl": "https://abc123def456.execute-api.us-east-1.amazonaws.com/dev/graph",
  "expirationDateTime": "2026-03-19T18:23:45.935Z",
  "creatorId": "87654321-4321-4321-4321-cba987654321"
}
```

## Infrastructure Components

### AWS Resources (Terraform)

All resources defined in [../../iac/aws/main.tf](../../iac/aws/main.tf):

**1. API Gateway REST API**

- Module: [../../iac/aws/modules/api-gateway/](../../iac/aws/modules/api-gateway/)
- Resource: `aws_api_gateway_rest_api.webhook_api`
- Purpose: Exposes `/graph` endpoint for receiving Graph webhooks
- Configuration:
  - Name: `tmf-graph-webhooks-{environment}`
  - Endpoint Type: `REGIONAL`
  - Authorization: Uses custom Lambda authorizer
- Outputs: `api_gateway_url` - The notificationUrl used in subscriptions

**2. Lambda Authorizer**

- Module: [../../iac/aws/modules/authorizer/](../../iac/aws/modules/authorizer/)
- Resource: `aws_lambda_function.authorizer`
- Purpose: Validates incoming requests before Lambda execution
- Code: [../../apps/aws-lambda-authorizer/authorizer.js](../../apps/aws-lambda-authorizer/authorizer.js)
- Configuration:
  - Runtime: `nodejs20.x`
  - Handler: `authorizer.handler`
  - Environment: `CLIENT_STATE` (for validation)
  - Timeout: 10 seconds
- Authorization Logic:
  - **GET with validationToken query**: Always allow (lines 22-25)
  - **POST requests**: Always allow, handler validates clientState (lines 28-31)

**3. Webhook Handler Lambda**

- Module: [../../iac/aws/modules/lambda/](../../iac/aws/modules/lambda/)
- Resource: `aws_lambda_function.webhook_handler`
- Purpose: Echoes validationToken or processes webhook notifications
- Code: [../../apps/aws-lambda/handler.js](../../apps/aws-lambda/handler.js)
- Configuration:
  - Runtime: `nodejs20.x`
  - Handler: `handler.handler`
  - Environment: `BUCKET_NAME`, `CLIENT_STATE`
  - Timeout: 30 seconds
  - IAM Role: Includes `s3:PutObject` permission

**4. S3 Bucket**

- Module: [../../iac/aws/modules/storage/](../../iac/aws/modules/storage/)
- Resource: `aws_s3_bucket.webhook_storage`
- Purpose: Stores webhook notification payloads
- Configuration:
  - Name: `{bucket_name}` (from variables)
  - Versioning: Disabled
  - Encryption: Server-side encryption enabled

**5. CloudWatch Log Groups**

- Created automatically for Lambda functions
- Log group names:
  - `/aws/lambda/tmf-webhook-authorizer-{environment}`
  - `/aws/lambda/tmf-webhook-writer-{environment}`
- Retention: 14 days (configurable)

### Terraform Variables

Required variables in [iac/aws/terraform.tfvars.example](iac/aws/terraform.tfvars.example):

```hcl
# Webhook Security
client_state = "550e8400-e29b-41d4-a716-446655440000"  # Must match WEBHOOK_AUTH_SECRET

# S3 Storage
bucket_name = "teams-meeting-fetcher-webhooks-dev"

# Lambda Package Paths
lambda_package_path      = "../../apps/aws-lambda/package.zip"
authorizer_package_path  = "../../apps/aws-lambda-authorizer/package.zip"
```

## Source Code References

### IaC Definition (Primary)

- Terraform entrypoint: [../../iac/aws/main.tf](../../iac/aws/main.tf)
- API Gateway module: [../../iac/aws/modules/api-gateway/](../../iac/aws/modules/api-gateway/)
- Authorizer module: [../../iac/aws/modules/authorizer/](../../iac/aws/modules/authorizer/)
- Lambda module: [../../iac/aws/modules/lambda/](../../iac/aws/modules/lambda/)
- Storage module: [../../iac/aws/modules/storage/](../../iac/aws/modules/storage/)

### Webhook Handler Implementation (Primary)

**Lambda Handler** (production code)

- File: [../../apps/aws-lambda/handler.js](../../apps/aws-lambda/handler.js)
  - Validation token echo (lines 11-19): Echoes `validationToken` for subscription handshake
  - Binary payload handling (lines 21-37): Parses JSON webhook body
  - clientState validation (lines 44-48): Validates security token
  - S3 storage (lines 59-75): Stores notifications to S3
  - 202 response (lines 77-82): Returns accepted status

**Lambda Authorizer** (production code)

- File: [../../apps/aws-lambda-authorizer/authorizer.js](../../apps/aws-lambda-authorizer/authorizer.js)
  - Validation token detection (lines 22-25): Allows GET with `validationToken`
  - POST allow policy (lines 28-31): Permits all POST requests
  - IAM policy generation (line 48): Builds authorization policy

### Subscription Creation & Testing (Secondary)

**Interactive Script** (used for manual subscription creation/testing)

- File: [../../scripts/graph/02-create-webhook-subscription.py](../../scripts/graph/02-create-webhook-subscription.py)
  - `create_subscription()` (lines 41-82) - Manually create subscription
  - `list_subscriptions()` (lines 11-36) - List active subscriptions
  - **Purpose**: Manual testing and validation

### Graph Token Acquisition (Secondary)

- Auth helper: [../../scripts/graph/auth_helper.py](../../scripts/graph/auth_helper.py) lines 13-56

## Runtime Locations

- API Gateway and Lambda authorizer/handler run in AWS.
- Terraform runs locally or in CI to provision AWS resources.
- Subscription management scripts run locally from `scripts/graph/`.
  - `get_graph_token()` - Acquires OAuth token
  - `get_graph_headers()` - Builds Authorization header
  - **Purpose**: Manual testing

## Deployment Steps

1. **Provision AWS Infrastructure**

   ```bash
   cd iac/aws
   terraform init
   terraform plan
   terraform apply
   ```

2. **Get API Gateway URL**

   ```bash
   terraform output api_gateway_url
   # Example: https://abc123def456.execute-api.us-east-1.amazonaws.com/dev
   ```

3. **Configure Environment Variable**

   ```bash
   # Add to .env.local
   AWS_WEBHOOK_ENDPOINT=https://abc123def456.execute-api.us-east-1.amazonaws.com/dev/graph
   ```

4. **Create Subscription**
   ```bash
   cd ../../scripts/graph
   python 02-create-webhook-subscription.py
   ```

## Validation Testing

Test the validation handshake manually:

```bash
# Test validation endpoint
curl "https://abc123def456.execute-api.us-east-1.amazonaws.com/dev/graph?validationToken=TestToken123"

# Expected response:
# TestToken123
```

## Next Steps

After subscription creation:

1. ✅ AWS infrastructure provisioned
2. ✅ API Gateway endpoint created
3. ✅ Lambda authorizer and handler deployed
4. ✅ Subscription created and validated
5. ✅ Graph will send notifications when events change

**Next Flow**: [Meeting Notification Flow](03-meeting-notification.md)

---

[Back to Flows Index](README.md)
