# Test Scripts

This folder contains ad-hoc test and debugging scripts used during development.

## PowerShell Scripts

### End-to-End Testing

- **test-complete-flow.ps1** - Complete flow test from meeting creation to Lambda processing
- **monitor-e2e-flow.ps1** - Monitor end-to-end flow with live logging
- **verify-end-to-end.py** - Python-based E2E verification

### Infrastructure Testing

- **test-infrastructure.ps1** - Test infrastructure components
- **check-lambda-health.ps1** - Check Lambda function health and status

### Lambda Testing

- **test-lambda-simple.ps1** - Simple Lambda invocation test
- **test-eventhub-lambda.ps1** - Test EventHub-triggered Lambda function

### EventHub Testing

- **test-eventhub-flow.py** - Test EventHub message flow

### Meeting Creation

- **create-meetings.ps1** - Create test meetings via Graph API
- **create-graph-subscription.py** - Create Graph API change subscriptions
- **run-meeting-creation.bat** - Batch file wrapper for meeting creation

## Response Files

Temporary JSON response files from testing:

- **resp.json** - Response data
- **response.json** - Response data
- **test-response.json** - Test response data

## Usage

These scripts are standalone utilities for testing specific components. They are not part of the main test suite in `test/`.

For automated tests, see:

- `test/` - Main test suite
- `scripts/graph/` - Graph API scripts
- `scripts/verify/` - Verification scripts
