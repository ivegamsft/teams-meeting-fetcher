# Tests

Comprehensive test suite for Teams Meeting Fetcher infrastructure, backend services, and integrations.

## Quick Start

### Install Dependencies

**Python tests:**

```bash
cd test
pip install -r requirements.txt
```

**PowerShell tests:**

```powershell
Install-Module -Name Pester -Force -SkipPublisherCheck
```

**Node.js tests (Lambda):**

```bash
cd apps/aws-lambda
npm install --save-dev jest @types/jest aws-sdk-mock
```

### Run All Tests

```bash
# Python tests
pytest test/ -v

# PowerShell tests
Invoke-Pester test/scripts/ -Output Detailed

# Lambda tests
cd apps/aws-lambda && npm test
```

## Test Structure

```
test/
├── unit/                    # Fast unit tests (no external dependencies)
│   ├── aws-lambda/         # Lambda handler tests (Jest)
│   └── scripts/            # Script validation (Pester)
├── integration/            # Integration tests (require deployed resources)
│   ├── aws/               # AWS webhook + S3 tests
│   ├── azure/             # Azure Key Vault, Storage, Event Grid
│   └── graph/             # Microsoft Graph API tests
├── infrastructure/        # IaC validation and compliance
│   ├── terraform/         # Terraform validation tests
│   └── compliance/        # Security compliance checks
├── e2e/                  # End-to-end workflow tests
│   ├── aws/              # AWS webhook flow
│   └── azure/            # Azure service flow
├── scripts/              # Script tests (Pester)
├── fixtures/             # Test data and sample payloads
├── utils/                # Test helper utilities
└── TEST_PLAN.md          # Complete test plan and strategy
```

## Test Categories

### Unit Tests (Fast - No Cloud Resources)

**Lambda Handler:**

```bash
cd apps/aws-lambda
npm test
```

**Scripts:**

```powershell
Invoke-Pester test/scripts/
```

### Integration Tests (Require Deployed Infrastructure)

**AWS Integration:**

```bash
# Requires: AWS infrastructure deployed, profile configured
pytest test/integration/aws/ -v
```

**Azure Integration:**

```bash
# Requires: Azure infrastructure deployed, authenticated
pytest test/integration/azure/ -v
```

**Graph API:**

```bash
# Requires: App registration with consented permissions
pytest test/integration/graph/ -v
```

### Infrastructure Tests

**Terraform Validation:**

```bash
pytest test/infrastructure/terraform/ -v
```

**Security Compliance:**

```bash
pytest test/infrastructure/compliance/ -v
```

## Configuration

### Environment Variables

Create `.env.test` for test configuration:

```bash
# AWS Test Configuration
AWS_PROFILE=tmf-dev
AWS_REGION=us-east-1
AWS_WEBHOOK_URL=https://your-api-gateway-url.com/dev/graph
AWS_S3_BUCKET=tmf-webhook-payloads-dev
AWS_LAMBDA_FUNCTION=tmf-webhook-writer-dev

# Azure Test Configuration
AZURE_SUBSCRIPTION_ID=your-subscription-id
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_KEYVAULT_NAME=tmf-kv-eus-<suffix>
AZURE_STORAGE_ACCOUNT=tmfsteus<suffix>

# Graph API Test Configuration
GRAPH_TENANT_ID=your-tenant-id
GRAPH_CLIENT_ID=your-app-client-id
GRAPH_CLIENT_SECRET=your-app-secret
TEST_USER_EMAIL=test.user@yourdomain.com
```

## Test Fixtures

Sample data in `test/fixtures/`:

- `graph-webhook-created.json` - Meeting created notification
- `graph-webhook-updated.json` - Meeting updated notification
- `graph-meeting-details.json` - Meeting details from Graph API (TBD)
- `invalid-webhook.json` - Invalid payload for negative tests (TBD)

## Writing Tests

### Python Test Example

```python
import pytest
from utils.aws_helpers import get_s3_object_content

def test_example():
    """Test description"""
    result = some_function()
    assert result == expected_value
```

### PowerShell Test Example

```powershell
Describe "Feature Tests" {
    It "Should do something" {
        $result = Get-Something
        $result | Should -Be "expected"
    }
}
```

### Jest Test Example

```javascript
describe('Lambda Handler', () => {
  test('should process webhook', async () => {
    const result = await handler(event, context);
    expect(result.statusCode).toBe(200);
  });
});
```

## CI/CD Integration

Tests run automatically in GitHub Actions on:

- Pull requests to main
- Changes to relevant paths (`iac/**`, `apps/**`, `scripts/**`)

See `.github/workflows/` for pipeline definitions (TBD).

## Playwright Decision

**Not currently needed** ❌

Reasons:

- No UI implemented yet
- Testing focus is on backend/infrastructure
- Python/PowerShell sufficient for current scope

**Reconsider when:**

- UI Dashboard implemented
- Need browser-based testing
- Teams app integration requires E2E UI tests

## Test Coverage

Run with coverage reports:

```bash
# Python coverage
pytest test/ --cov=apps --cov-report=html

# Jest coverage
cd apps/aws-lambda && npm test -- --coverage
```

Coverage reports generated in:

- Python: `htmlcov/index.html`
- Jest: `apps/aws-lambda/coverage/lcov-report/index.html`

## Troubleshooting

### AWS Tests Fail with Auth Error

```bash
# Verify AWS profile configured
aws sts get-caller-identity --profile tmf-dev

# Check credentials
cat ~/.aws/credentials
```

### Azure Tests Fail with Permission Error

```bash
# Verify authentication
az account show

# Check Key Vault permissions
az role assignment list --assignee $(az ad signed-in-user show --query id -o tsv) --scope /subscriptions/.../providers/Microsoft.KeyVault/vaults/tmf-kv-eus-<suffix>
```

### S3 Object Not Found (Eventual Consistency)

```python
# Use wait helper
from utils.aws_helpers import wait_for_s3_object
wait_for_s3_object(bucket, key, max_attempts=10, delay=2)
```

## Next Steps

1. Implement remaining unit tests
2. Add Graph API integration tests (requires backend service)
3. Create infrastructure compliance tests
4. Set up GitHub Actions workflows
5. Add E2E tests for complete workflows

See [TEST_PLAN.md](./TEST_PLAN.md) for comprehensive testing strategy.
