# Decision: Renewal Lambda Packaging Pattern

**Proposed by:** Fenster
**Date:** 2026-02-28
**Status:** Implemented

## Context

The subscription renewal Lambda (`tmf-subscription-renewal-dev`) was broken because Terraform's `data.archive_file` zipped only the Python source file without pip dependencies. The `requests` library (required by the handler) was missing from the deployment package, causing `Runtime.ImportModuleError` on every invocation. All Graph webhook subscriptions expired as a result.

## Decision

1. **Added build script and requirements.txt** for the renewal Lambda at `scenarios/lambda/package.ps1` and `scenarios/lambda/requirements.txt`, following the same pattern as the eventhub Lambda (`apps/aws-lambda-eventhub/package.ps1`).
2. **Added `lifecycle { ignore_changes = [filename, source_code_hash] }` to the Terraform resource** so Terraform manages infrastructure only and code is deployed separately via `aws lambda update-function-code`. This is consistent with the eventhub-processor module pattern.
3. Terraform's `data.archive_file` remains for initial deployment only; subsequent code deploys use the build script.

## Impact

- Any future Python dependency changes require running `package.ps1` and deploying the zip.
- CI/CD workflows that deploy the renewal Lambda should use `package.ps1` to build, then `aws lambda update-function-code`.
- The Terraform `data.archive_file` still packages the single `.py` file for initial resource creation, but deployed code is never overwritten by `terraform apply`.
