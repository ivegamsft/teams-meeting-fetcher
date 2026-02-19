# Sync Azure-to-AWS Terraform Variables

Automatically syncs Azure Terraform outputs (Event Hub, Graph API credentials, etc.) into AWS `terraform.tfvars`.

## Usage

### PowerShell (Windows)

```powershell
.\scripts\sync-azure-to-aws.ps1
```

### Bash (Linux/Mac)

```bash
chmod +x scripts/sync-azure-to-aws.sh
./scripts/sync-azure-to-aws.sh
```

## What It Does

1. Reads Azure Terraform outputs from `iac/azure`
2. Extracts:
   - Graph API credentials (tenant, client ID, client secret)
   - Bot app credentials
   - Admin group ID
   - Event Hub connection string and name
3. Merges with existing AWS `terraform.tfvars` (preserves AWS-specific values)
4. Writes updated `iac/aws/terraform.tfvars`

## After Running

1. **Review** `iac/aws/terraform.tfvars`
2. **Fill in** missing AWS values:
   - `aws_account_id`
   - `client_state` (webhook secret)
   - `notification_email` (optional)
3. **Deploy** AWS infrastructure:
   ```bash
   cd iac/aws
   terraform plan
   terraform apply
   ```

## Prerequisites

- Azure infrastructure already deployed (`cd iac/azure && terraform apply`)
- Terraform installed and in PATH
- For Bash script: `jq` installed

## Example Output

```
================================================
Sync Azure -> AWS Terraform Variables
================================================

[INFO] Getting Azure Terraform outputs...
[OK] Retrieved Azure outputs
   Tenant ID: 62837751-4e48-4d06-8bcb-57be1a669b78
   Graph Client ID: f5708f7f-78c3-4cbb-9886-2805edbd2827
   Bot App ID: a1b2c3d4-...
   Event Hub Namespace: tmf-ehns-eus-abc123
   Event Hub Name: tmf-eh-eus-abc123

[INFO] Writing terraform.tfvars...
[OK] Written to: iac/aws/terraform.tfvars

[DONE] Sync Complete!
```
