# Sync Azure Terraform outputs to AWS terraform.tfvars
# Run after deploying Azure infrastructure

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Sync Azure -> AWS Terraform Variables" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Paths
$azureTfDir = Join-Path $PSScriptRoot "..\iac\azure"
$awsTfDir = Join-Path $PSScriptRoot "..\iac\aws"
$awsTfvarsPath = Join-Path $awsTfDir "terraform.tfvars"

# Check if Azure Terraform directory exists
if (-not (Test-Path $azureTfDir)) {
    Write-Host "[ERROR] Azure Terraform directory not found: $azureTfDir" -ForegroundColor Red
    exit 1
}

# Check if AWS Terraform directory exists
if (-not (Test-Path $awsTfDir)) {
    Write-Host "[ERROR] AWS Terraform directory not found: $awsTfDir" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Getting Azure Terraform outputs..." -ForegroundColor Cyan
Push-Location $azureTfDir

try {
    # Get Azure outputs
    $azureOutputs = terraform output -json | ConvertFrom-Json
    
    if (-not $azureOutputs) {
        Write-Host "[ERROR] No Azure Terraform outputs found. Deploy Azure infrastructure first." -ForegroundColor Red
        Pop-Location
        exit 1
    }

    # Extract values
    $tenantId = $azureOutputs.tenant_id.value
    $graphClientId = $azureOutputs.app_client_id.value
    $graphClientSecret = $azureOutputs.app_client_secret.value
    $botAppId = $azureOutputs.bot_app_id.value
    $botAppSecret = $azureOutputs.bot_app_secret.value
    $adminGroupId = $azureOutputs.admin_group_id.value
    $eventHubNamespace = $azureOutputs.eventhub_namespace_name.value
    $eventHubName = $azureOutputs.eventhub_name.value
    $eventHubConnString = $azureOutputs.eventhub_connection_string.value

    Write-Host "[OK] Retrieved Azure outputs" -ForegroundColor Green
    Write-Host "   Tenant ID: $tenantId"
    Write-Host "   Graph Client ID: $graphClientId"
    Write-Host "   Bot App ID: $botAppId"
    Write-Host "   Admin Group ID: $adminGroupId"
    Write-Host "   Event Hub Namespace: $eventHubNamespace"
    Write-Host "   Event Hub Name: $eventHubName"
    Write-Host ""

} catch {
    Write-Host "[ERROR] Failed to get Azure outputs: $($_.Exception.Message)" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

# Read existing AWS tfvars if it exists
Write-Host "[INFO] Checking existing AWS terraform.tfvars..." -ForegroundColor Cyan

$existingVars = @{}
if (Test-Path $awsTfvarsPath) {
    Write-Host "[OK] Found existing terraform.tfvars" -ForegroundColor Green
    
    # Parse existing tfvars (simple key = "value" format)
    Get-Content $awsTfvarsPath | ForEach-Object {
        if ($_ -match '^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]*)"') {
            $existingVars[$matches[1]] = $matches[2]
        }
    }
} else {
    Write-Host "[WARN] No existing terraform.tfvars found, will create new" -ForegroundColor Yellow
}

# Merge values (keep existing non-Azure values)
$vars = @{
    # Keep or set AWS-specific variables
    environment = if ($existingVars.environment) { $existingVars.environment } else { "dev" }
    aws_region = if ($existingVars.aws_region) { $existingVars.aws_region } else { "us-east-1" }
    aws_account_id = if ($existingVars.aws_account_id) { $existingVars.aws_account_id } else { "" }
    s3_bucket_name = if ($existingVars.s3_bucket_name) { $existingVars.s3_bucket_name } else { "tmf-webhook-payloads-dev" }
    client_state = if ($existingVars.client_state) { $existingVars.client_state } else { "" }
    notification_email = if ($existingVars.notification_email) { $existingVars.notification_email } else { "" }
    
    # Azure values from Terraform outputs
    azure_graph_tenant_id = $tenantId
    azure_graph_client_id = $graphClientId
    azure_graph_client_secret = $graphClientSecret
    azure_bot_app_id = $botAppId
    azure_bot_app_secret = $botAppSecret
    azure_allowed_group_id = $adminGroupId
    
    # Event Hub values
    eventhub_connection_string = $eventHubConnString
    eventhub_name = $eventHubName
    eventhub_consumer_group = if ($existingVars.eventhub_consumer_group) { $existingVars.eventhub_consumer_group } else { "`$Default" }
    eventhub_checkpoints_table_name = if ($existingVars.eventhub_checkpoints_table_name) { $existingVars.eventhub_checkpoints_table_name } else { "eventhub-checkpoints" }
    
    # Keep other existing values
    lambda_package_path = if ($existingVars.lambda_package_path) { $existingVars.lambda_package_path } else { "../../apps/aws-lambda/lambda.zip" }
    authorizer_package_path = if ($existingVars.authorizer_package_path) { $existingVars.authorizer_package_path } else { "../../apps/aws-lambda-authorizer/authorizer.zip" }
    eventhub_lambda_package_path = if ($existingVars.eventhub_lambda_package_path) { $existingVars.eventhub_lambda_package_path } else { "../../apps/aws-lambda-eventhub/lambda.zip" }
    renewal_schedule_expression = if ($existingVars.renewal_schedule_expression) { $existingVars.renewal_schedule_expression } else { "cron(0 2 * * ? *)" }
    eventhub_poll_schedule_expression = if ($existingVars.eventhub_poll_schedule_expression) { $existingVars.eventhub_poll_schedule_expression } else { "rate(1 minute)" }
    eventhub_poll_window_minutes = if ($existingVars.eventhub_poll_window_minutes) { $existingVars.eventhub_poll_window_minutes } else { "10" }
    eventhub_max_events = if ($existingVars.eventhub_max_events) { $existingVars.eventhub_max_events } else { "50" }
    group_cache_ttl_seconds = if ($existingVars.group_cache_ttl_seconds) { $existingVars.group_cache_ttl_seconds } else { "900" }
    teams_catalog_app_id = if ($existingVars.teams_catalog_app_id) { $existingVars.teams_catalog_app_id } else { "" }
    watched_user_ids = if ($existingVars.watched_user_ids) { $existingVars.watched_user_ids } else { "" }
    poll_lookahead_minutes = if ($existingVars.poll_lookahead_minutes) { $existingVars.poll_lookahead_minutes } else { "60" }
    graph_notification_url = if ($existingVars.graph_notification_url) { $existingVars.graph_notification_url } else { "" }
    graph_notification_client_state = if ($existingVars.graph_notification_client_state) { $existingVars.graph_notification_client_state } else { "" }
}

# Generate terraform.tfvars content
$tfvarsContent = @"
# Auto-generated by sync-azure-to-aws.ps1 on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# Azure values synced from Azure Terraform outputs

environment    = "$($vars.environment)"
aws_region     = "$($vars.aws_region)"
aws_account_id = "$($vars.aws_account_id)"

# S3 bucket name (must be globally unique)
s3_bucket_name = "$($vars.s3_bucket_name)"

# Lambda package paths
lambda_package_path             = "$($vars.lambda_package_path)"
authorizer_package_path         = "$($vars.authorizer_package_path)"
eventhub_lambda_package_path    = "$($vars.eventhub_lambda_package_path)"

# Client state secret for webhook validation
client_state = "$($vars.client_state)"

# Optional: Email for SNS notifications
notification_email = "$($vars.notification_email)"

#=============================================================================
# AZURE-SYNCED VALUES (from Azure Terraform outputs)
#=============================================================================

# Microsoft Graph credentials
azure_graph_tenant_id     = "$($vars.azure_graph_tenant_id)"
azure_graph_client_id     = "$($vars.azure_graph_client_id)"
azure_graph_client_secret = "$($vars.azure_graph_client_secret)"

# Teams bot credentials
azure_bot_app_id     = "$($vars.azure_bot_app_id)"
azure_bot_app_secret = "$($vars.azure_bot_app_secret)"

# Admin group for allow-listing
azure_allowed_group_id = "$($vars.azure_allowed_group_id)"

# Event Hub
eventhub_connection_string = "$($vars.eventhub_connection_string)"
eventhub_name              = "$($vars.eventhub_name)"
eventhub_consumer_group    = "$($vars.eventhub_consumer_group)"

#=============================================================================
# AWS-SPECIFIC SETTINGS
#=============================================================================

# DynamoDB checkpoint table
eventhub_checkpoints_table_name = "$($vars.eventhub_checkpoints_table_name)"

# Subscription renewal schedule
renewal_schedule_expression = "$($vars.renewal_schedule_expression)"

# Event Hub polling
eventhub_poll_schedule_expression = "$($vars.eventhub_poll_schedule_expression)"
eventhub_poll_window_minutes      = $($vars.eventhub_poll_window_minutes)
eventhub_max_events               = $($vars.eventhub_max_events)

# Meeting bot settings
group_cache_ttl_seconds = $($vars.group_cache_ttl_seconds)
teams_catalog_app_id    = "$($vars.teams_catalog_app_id)"
watched_user_ids        = "$($vars.watched_user_ids)"
poll_lookahead_minutes  = $($vars.poll_lookahead_minutes)

# Graph notifications
graph_notification_url          = "$($vars.graph_notification_url)"
graph_notification_client_state = "$($vars.graph_notification_client_state)"
"@

# Write to file
Write-Host "[INFO] Writing terraform.tfvars..." -ForegroundColor Cyan
$tfvarsContent | Out-File -FilePath $awsTfvarsPath -Encoding utf8
Write-Host "[OK] Written to: $awsTfvarsPath" -ForegroundColor Green

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "[DONE] Sync Complete!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Review: $awsTfvarsPath"
Write-Host "2. Fill in missing AWS values (aws_account_id, client_state, etc.)"
Write-Host "3. cd iac/aws && terraform plan"
Write-Host ""
