# Decision: Deploy Unified Workflow Variables Need Manual Fix

**Author:** Fenster  
**Date:** 2026-03-02  
**Context:** Push & deploy of 4 commits (bot Calls permissions, DynamoDB GSI, squad logs)

## What Happened

Deploy Unified run 22561653991 completed successfully (all 3 jobs green: Build Lambda, Infrastructure, Deploy Lambda Code). However, two workflow annotations flagged that GitHub Variables could not be auto-exported from Terraform outputs:

- `RESOURCE_GROUP_NAME` — needs: `gh variable set RESOURCE_GROUP_NAME --body tmf-rg-eus-8akfpg`
- `KEY_VAULT_NAME` — needs: `gh variable set KEY_VAULT_NAME --body tmf-kv-eus-8akfpg`

## Decision

These variables should be set manually via `gh variable set` if other workflows depend on them (e.g., deploy-azure.yml, deploy-admin-app.yml). The export failure is likely a permissions issue — the workflow has `actions: write` but variable export may require admin-level repo permissions or a PAT.

## Impact

No immediate breakage — Terraform applied successfully. But downstream workflows referencing these variables may use stale values if the resource group or key vault names ever change.
