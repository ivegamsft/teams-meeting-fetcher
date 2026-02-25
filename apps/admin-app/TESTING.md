# Testing Guide -- Admin App

Comprehensive testing documentation for the Teams Meeting Fetcher admin app (`apps/admin-app/`).

## Table of Contents

1. [Overview](#overview)
2. [Running Tests](#running-tests)
3. [Test File Organization](#test-file-organization)
4. [Unit Tests](#unit-tests)
5. [Integration Tests](#integration-tests)
6. [End-to-End Tests](#end-to-end-tests)
7. [Mocking Strategy](#mocking-strategy)
8. [Coverage](#coverage)
9. [Adding New Tests](#adding-new-tests)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The admin app uses a three-layer testing strategy:

| Layer       | Count       | Framework       | Location                  | Purpose                                      |
|-------------|-------------|-----------------|---------------------------|----------------------------------------------|
| Unit        | 193 tests   | Jest + ts-jest  | `test/unit/`              | Isolated logic: services, stores, middleware  |
| Integration | 64 tests    | Jest + supertest| `test/integration/`       | HTTP routes against the Express app           |
| E2E         | Scripts     | PowerShell/Python | `test-scripts/`, `test/e2e/` | Live deployed app on ECS Fargate          |

All unit and integration tests run locally with no external dependencies. AWS services (DynamoDB, S3), Microsoft Graph API, and Entra ID are fully mocked.

---

## Running Tests

All commands assume you are in the `apps/admin-app/` directory:

```bash
cd apps/admin-app
```

### Run All Tests (with coverage)

```bash
npm test
```

This runs `jest --coverage` (configured in `package.json`).

### Run Unit Tests Only

```bash
npx jest --testPathPattern=unit
```

### Run Integration Tests Only

```bash
npx jest --testPathPattern=integration
```

Or use the package.json script:

```bash
npm run test:integration
```

### Run a Single Test File

```bash
npx jest test/unit/services/sanitizationService.test.ts
```

### Run Tests in Watch Mode

```bash
npx jest --watch
```

### Generate Coverage Report

```bash
npx jest --coverage
```

The coverage report is written to `coverage/` in HTML, LCOV, and text formats. Open `coverage/lcov-report/index.html` in a browser for the interactive report.

Coverage is collected from all `src/**/*.ts` files except `server.ts` and `app.ts` (entry points), as configured in `jest.config.ts`.

---

## Test File Organization

```
apps/admin-app/
  jest.config.ts                  # Jest configuration (ts-jest preset, path aliases)
  test/
    helpers/
      testSetup.ts                # Shared test utilities and mock factories
    unit/
      middleware/
        auth.test.ts              # webhookAuth, dashboardAuth, optionalAuth
      services/
        sanitizationService.test.ts   # PII redaction (email, phone, SSN, credit card, IP)
        meetingService.test.ts        # Meeting CRUD, notification processing
        transcriptService.test.ts     # Transcript retrieval, S3 content fetching
        graphSubscriptionService.test.ts  # Graph subscription lifecycle
      stores/
        configStore.test.ts           # App config DynamoDB operations
        subscriptionStore.test.ts     # Subscription DynamoDB operations
        meetingStore.test.ts          # Meeting DynamoDB operations
        transcriptStore.test.ts       # Transcript DynamoDB operations
    integration/
      routes/
        health.test.ts            # GET /health
        config.test.ts            # GET/PUT /api/config, GET /api/config/health
        subscriptions.test.ts     # CRUD /api/subscriptions, sync-group
        meetings.test.ts          # GET /api/meetings, GET /api/meetings/:id
        transcripts.test.ts       # GET /api/transcripts, GET /api/transcripts/:id
        webhooks.test.ts          # POST /api/webhooks/graph (validation, notifications)
        auth.test.ts              # Auth routes, login/logout/callback/status
```

---

## Unit Tests

Unit tests validate individual functions and modules in isolation. Each test file corresponds to a single source module.

### Services (4 suites)

- **sanitizationService** -- Validates PII redaction rules: email addresses, phone numbers (with/without country codes and parentheses), SSNs, credit card numbers, and IP addresses. Tests both single and multiple matches, edge cases, and clean-through behavior.
- **meetingService** -- Tests meeting listing with filters (status, organizer, date range, pagination), single meeting retrieval, and webhook notification processing.
- **transcriptService** -- Tests transcript listing, retrieval by ID and meeting ID, S3 content fetching for both raw and sanitized transcripts.
- **graphSubscriptionService** -- Tests the full subscription lifecycle: create (with Graph API call), renew, delete, list, and Entra group sync.

### Stores (4 suites)

- **configStore** -- DynamoDB get/put/update operations for application configuration, including defaults initialization and field-level updates.
- **subscriptionStore** -- DynamoDB CRUD for Graph webhook subscriptions, including last-notification timestamp updates.
- **meetingStore** -- DynamoDB CRUD for meeting records, including scan with filters.
- **transcriptStore** -- DynamoDB CRUD for transcript metadata, including query by meeting ID.

### Middleware (1 suite)

- **auth** -- Tests three auth middleware functions: `webhookAuth` (Bearer token validation), `dashboardAuth` (API key + Entra OIDC session), and `optionalAuth` (non-blocking auth check).

---

## Integration Tests

Integration tests use [supertest](https://github.com/ladislav-zezula/supertest) to make HTTP requests against the Express app. They verify:

- Correct HTTP status codes (200, 201, 400, 401, 403, 404, 500)
- Response body structure and content
- Authentication enforcement (API key required for protected routes)
- Webhook validation token echo (Graph subscription validation)
- Error handling for missing/invalid resources

### Routes (7 suites)

| Suite | Endpoint | Key scenarios |
|-------|----------|---------------|
| health | `GET /health` | Returns status, uptime, version, timestamp |
| config | `GET/PUT /api/config` | Read/update config, health sub-endpoint |
| subscriptions | `/api/subscriptions` | List, get, create, renew, delete, sync-group |
| meetings | `/api/meetings` | List with filters, get by ID, get transcript |
| transcripts | `/api/transcripts` | List with status filter, get by ID |
| webhooks | `POST /api/webhooks/graph` | Validation token, notification processing, auth |
| auth | `/auth/*` | Login, callback, logout, status |

### How Integration Tests Work

Each integration test file:

1. Sets environment variables before any imports (`process.env.API_KEY = 'test-api-key-12345'`)
2. Mocks AWS SDK clients (`@aws-sdk/lib-dynamodb`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`)
3. Mocks `passport-azure-ad` to prevent real Entra connections
4. Imports the Express `app` and wraps it with supertest
5. Uses mock factories from `test/helpers/testSetup.ts` for consistent test data

---

## End-to-End Tests

E2E tests run against the live deployed admin app on AWS ECS Fargate. They are not part of the Jest test suite.

### Location

- `test-scripts/` -- PowerShell and Python scripts for infrastructure and flow testing
- `test/e2e/` -- Structured E2E test suite with its own Jest config and helpers

### What E2E Tests Cover

- Health endpoint availability on the public ECS IP (port 3000)
- Authentication flow (API key and Entra OIDC)
- API endpoint responses with real DynamoDB data
- Pipeline data flow: webhook ingestion through transcript processing
- Infrastructure connectivity (DynamoDB, S3, Graph API)

### Running E2E Tests

E2E tests require a deployed environment. See `test/e2e/README.md` and `test/e2e/E2E_RUNBOOK.md` for setup instructions.

```powershell
# From repo root -- run E2E validation scripts
.\test-scripts\test-infrastructure.ps1
.\test-scripts\test-complete-flow.ps1
.\test-scripts\monitor-e2e-flow.ps1
```

---

## Mocking Strategy

### What Is Mocked

| Dependency | Mock approach | Why |
|------------|--------------|-----|
| DynamoDB (`@aws-sdk/lib-dynamodb`) | `jest.mock()` with `send` spy | Avoid real AWS calls; control responses |
| DynamoDB Client (`@aws-sdk/client-dynamodb`) | `jest.mock()` constructor | Prevent real client initialization |
| S3 (`@aws-sdk/client-s3`) | `jest.mock()` with `send` spy | Avoid real S3 reads/writes |
| Graph API (`config/graph`) | `jest.mock()` with `getGraphClient`/`getGraphToken` | No real Microsoft Graph calls |
| Passport Azure AD (`passport-azure-ad`) | `jest.mock()` OIDCStrategy | Prevent real Entra authentication |

### Unit Test Mocking

Unit tests mock at the module level using `jest.mock()` before imports. Each store test mocks the DynamoDB document client `send` method, and each service test mocks the store it depends on.

Example pattern (from store tests):

```typescript
jest.mock('../../../src/config/dynamodb', () => ({
  dynamoDb: { send: jest.fn() },
}));

import { configStore } from '../../../src/services/configStore';
import { dynamoDb } from '../../../src/config/dynamodb';

const mockSend = dynamoDb.send as jest.Mock;
```

### Integration Test Mocking

Integration tests mock at the AWS SDK package level so the full Express middleware chain executes, but no real AWS or Entra calls are made:

```typescript
jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  PutCommand: jest.fn().mockImplementation((params) => ({ _type: 'Put', ...params })),
  // ... other commands
}));
```

### Test Helpers

`test/helpers/testSetup.ts` provides:

- `setupTestEnv()` / `teardownTestEnv()` -- Save and restore environment variables
- `TEST_API_KEY` / `TEST_WEBHOOK_SECRET` -- Constants for auth headers
- `createMockMeeting()` -- Factory for Meeting objects with sensible defaults
- `createMockSubscription()` -- Factory for Subscription objects
- `createMockTranscript()` -- Factory for Transcript objects
- `createMockAppConfig()` -- Factory for AppConfig objects

All factories accept an `overrides` parameter to customize specific fields.

---

## Coverage

Coverage is collected automatically when running `npm test`. The Jest configuration (`jest.config.ts`) specifies:

```typescript
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/server.ts',   // Entry point excluded
  '!src/app.ts',       // Express setup excluded
],
```

### Viewing Coverage

After running tests, open the HTML report:

```
apps/admin-app/coverage/lcov-report/index.html
```

---

## Adding New Tests

### Adding a Unit Test

1. Create a test file at the corresponding path under `test/unit/`. For example, a new service `src/services/newService.ts` gets `test/unit/services/newService.test.ts`.

2. Mock dependencies at the top of the file before imports:

```typescript
jest.mock('../../../src/config/dynamodb', () => ({
  dynamoDb: { send: jest.fn() },
}));

jest.mock('../../../src/config', () => ({
  config: { /* minimal config needed */ },
}));

import { newService } from '../../../src/services/newService';
```

3. Use `beforeEach(() => jest.clearAllMocks())` to reset state between tests.

4. Follow the existing `describe` / `test` structure. Group tests by method.

### Adding an Integration Test

1. Create a test file under `test/integration/routes/`.

2. Set up environment variables and mocks before the app import (see existing tests for the full boilerplate).

3. Use supertest to make requests:

```typescript
import request from 'supertest';
import app from '../../../src/app';
import { TEST_API_KEY } from '../../helpers/testSetup';

describe('New Route', () => {
  test('returns 401 without API key', async () => {
    const response = await request(app).get('/api/new-endpoint');
    expect(response.status).toBe(401);
  });

  test('returns data with valid API key', async () => {
    mockDynamoSend.mockResolvedValue({ Items: [] });
    const response = await request(app)
      .get('/api/new-endpoint')
      .set('x-api-key', TEST_API_KEY);
    expect(response.status).toBe(200);
  });
});
```

4. Test both success and error paths (401, 404, 500).

### Naming Conventions

- Test files: `<module>.test.ts`
- Describe blocks: Match the module or class name
- Test names: Describe the expected behavior (`'returns 404 when meeting not found'`)

---

## Troubleshooting

### Tests fail with "Cannot find module '@/...'"

The Jest config uses `moduleNameMapper` to resolve the `@/` path alias. Ensure `jest.config.ts` contains:

```typescript
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/src/$1',
},
```

### Integration tests fail with timeout

Integration tests import the full Express app, which initializes Passport. Ensure `passport-azure-ad` is mocked before the app import to prevent real HTTP calls during startup.

### Environment variables not set

Integration tests set `process.env` values at the top of each file before any imports. If a test relies on a specific env var, set it before the `import app` statement.

### Mock not working

Ensure `jest.mock()` calls are at the top level of the file (not inside `describe` or `test` blocks). Jest hoists mock calls, but they must appear before the module being tested is imported.
