# Project Context

- **Owner:** ivegamsft
- **Project:** Teams Meeting Fetcher — webhook-driven service for Microsoft Teams meeting transcriptions via Graph API
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Created:** 2026-02-24

## Learnings

### 2026-02-24: Test Import Path Fixes and Jest Configuration
- Fixed broken import paths in unit tests after code reorganization:
  - `test/unit/meeting-bot/graph-client.test.js`: Updated to use `scenarios/lambda/meeting-bot/graph-client`
  - `test/unit/meeting-bot/index.test.js`: Updated mock and require paths to `scenarios/lambda/meeting-bot/`
- Updated `jest.config.js`:
  - Added `'<rootDir>/apps/aws-lambda/node_modules'` to `modulePaths` for proper @aws-sdk resolution
  - Fixed coverage paths from `lambda/meeting-bot/**/*.js` to `scenarios/lambda/meeting-bot/**/*.js`
  - Fixed exclusion pattern for node_modules
- Updated test assertion for auto-recording message to match new wording
- All Jest tests now pass (74 tests total)

### 2026-02-24: Pester Test Implementation for generate-azure-env.ps1
- Implemented real assertions for PowerShell script testing in `test/scripts/generate-env.tests.ps1`
- Successfully tests:
  - Error handling (missing IaC directory, empty terraform output, missing required outputs)
  - Cross-platform compatibility (verifies bash script exists)
- Mocking challenge: Mocking `terraform output -json` for positive test cases remains complex due to:
  - PowerShell script execution context (Push-Location changes working directory)
  - PATH resolution for .ps1 files across directory boundaries
  - Here-string and escaping complexities in dynamically generated mock scripts
- Note: The error handling tests (which don't require terraform mocking) all pass successfully

<!-- Append new learnings below. Each entry is something lasting about the project. -->
