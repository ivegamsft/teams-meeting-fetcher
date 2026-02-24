#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Bootstrap GitHub OIDC connections for secure authentication
    
.DESCRIPTION
    Sets up OpenID Connect trust relationships between GitHub and AWS/Azure
    eliminating the need for long-lived credentials in GitHub Secrets.
    
    This is more secure than using static credentials and is recommended
    for all GitHub Actions workflows.
    
.PARAMETER AzureOnly
    Only setup Azure OIDC, skip AWS
    
.PARAMETER AwsOnly
    Only setup AWS OIDC, skip Azure
    
.PARAMETER Repository
    GitHub repository in format 'owner/repo' (default: current git remote)

.PARAMETER RoleName
    AWS IAM role name for GitHub Actions (default: GitHubActionsTeamsMeetingFetcher)

.PARAMETER SetSecrets
    Automatically set GitHub secrets via gh CLI instead of just printing commands

.PARAMETER SetupTerraformState
    Create S3/DynamoDB Terraform state backend and apply bucket policy

.PARAMETER StateBucketName
    S3 bucket name for Terraform state

.PARAMETER StateLockTableName
    DynamoDB table name for Terraform state locking

.PARAMETER StateKey
    State file key/path within the bucket

.PARAMETER StateRegion
    AWS region for the state bucket and lock table

.PARAMETER StateIpCidr
    CIDR to allowlist for state bucket access
    
.EXAMPLE
    .\bootstrap-github-oidc.ps1
    
.EXAMPLE
    .\bootstrap-github-oidc.ps1 -AzureOnly
    
.EXAMPLE
    .\bootstrap-github-oidc.ps1 -Repository "myorg/myrepo"

.EXAMPLE
    .\bootstrap-github-oidc.ps1 -AwsOnly -RoleName "MyCustomRole" -SetSecrets
#>

param(
    [switch]$AzureOnly,
    [switch]$AwsOnly,
    [string]$Repository,
    [string]$RoleName = "GitHubActionsTeamsMeetingFetcher",
    [switch]$SetSecrets,
    [switch]$SetupTerraformState,
    [string]$StateBucketName,
    [string]$StateLockTableName,
    [string]$StateKey,
    [string]$StateRegion,
    [string]$StateIpCidr
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  GitHub OIDC Bootstrap -- Zero-Knowledge Authentication        " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# Detect repository if not provided
if (-not $Repository) {
    try {
        $remoteUrl = git config --get remote.origin.url
        if ($remoteUrl -match "github\.com[:/](.+)/(.+?)(?:\.git)?$") {
            $Repository = "$($matches[1])/$($matches[2])"
            $Repository = $Repository -replace "\.git$"
        }
    } catch {
        Write-Host "[ERROR] Could not detect repository. Run inside a git repo or specify -Repository" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Repository: $Repository" -ForegroundColor Yellow
Write-Host "AWS Role Name: $RoleName" -ForegroundColor Yellow
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# AZURE OIDC SETUP
# ═══════════════════════════════════════════════════════════════════════════

if (-not $AwsOnly) {
    Write-Host "[Azure] Setting up Azure OIDC..." -ForegroundColor Cyan
    Write-Host ""
    
    # Check prerequisites
    try {
        $null = az version 2>&1
    }
    catch {
        Write-Host "[ERROR] Azure CLI not installed" -ForegroundColor Red
        exit 1
    }
    
    # Get current context
    $subscriptionId = az account show --query id -o tsv
    $tenantId = az account show --query tenantId -o tsv
    
    Write-Host "  Subscription: $subscriptionId" -ForegroundColor Gray
    Write-Host "  Tenant ID: $tenantId" -ForegroundColor Gray
    Write-Host ""
    
    # Find or create service principal
    $spnName = "tmf-github-actions-oidc"
    $existingSp = az ad sp list --display-name $spnName --query "[0]" -o json | ConvertFrom-Json
    
    if ($existingSp.id) {
        $spAppId = $existingSp.appId
        Write-Host "[PASS] Found existing SPN: $spnName" -ForegroundColor Green
    } else {
        Write-Host "Creating new SPN: $spnName..." -ForegroundColor Yellow
        $createResult = az ad sp create-for-rbac --name $spnName --output json | ConvertFrom-Json
        $spAppId = $createResult.appId
        Write-Host "[PASS] Created SPN: $spnName" -ForegroundColor Green
    }
    
    Write-Host "  App ID: $spAppId" -ForegroundColor Gray
    Write-Host ""
    
    # Create federated credential for GitHub main branch
    Write-Host "Creating federated credential for GitHub Actions..." -ForegroundColor Yellow
    
    $credentialName = "github-actions-oidc"
    $issuer = "https://token.actions.githubusercontent.com"
    $audience = "api://AzureADTokenExchange"
    $subject = "repo:$($Repository):ref:refs/heads/main"
    
    try {
        # Check if credential already exists
        $existing = az ad app federated-credential list --id $spAppId --query "[?name=='$credentialName']" -o json | ConvertFrom-Json
        
        if ($existing -and $existing.Count -gt 0) {
            Write-Host "  Credential already exists, updating..." -ForegroundColor Gray
            az ad app federated-credential delete --id $spAppId --federated-credential-id ($existing[0].id) --yes 2>&1 | Out-Null
        }
    } catch {
        # Ignore if not found
    }
    
    $credentialParams = @{
        name = $credentialName
        issuer = $issuer
        subject = $subject
        audiences = @($audience)
        description = "GitHub Actions OIDC for $Repository (main branch)"
    } | ConvertTo-Json -Depth 5

    az ad app federated-credential create `
        --id $spAppId `
        --parameters $credentialParams 2>&1 | Out-Null
    
    Write-Host "[PASS] Created federated credential" -ForegroundColor Green
    Write-Host "  Subject: $subject" -ForegroundColor Gray
    Write-Host ""
    
    # Assign roles
    Write-Host "Assigning Azure roles..." -ForegroundColor Yellow
    $rolesToAssign = @(
        @{ name = "Contributor"; scope = "/subscriptions/$subscriptionId" }
        @{ name = "User Access Administrator"; scope = "/subscriptions/$subscriptionId" }
    )
    
    foreach ($role in $rolesToAssign) {
        try {
            az role assignment create `
                --assignee $spAppId `
                --role $role.name `
                --scope $role.scope 2>&1 | Out-Null
            Write-Host "  [PASS] Assigned: $($role.name)" -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] $($role.name) may already be assigned" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "Azure OIDC Configuration:" -ForegroundColor Cyan
    Write-Host "  Client ID: $spAppId" -ForegroundColor Yellow
    Write-Host "  Tenant ID: $tenantId" -ForegroundColor Yellow
    Write-Host "  Subscription ID: $subscriptionId" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[PASS] Azure OIDC setup complete!" -ForegroundColor Green
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════
# AWS OIDC SETUP
# ═══════════════════════════════════════════════════════════════════════════

if (-not $AzureOnly) {
    Write-Host "[AWS] Setting up AWS OIDC..." -ForegroundColor Cyan
    Write-Host ""
    
    # Check prerequisites
    try {
        $null = aws sts get-caller-identity 2>&1
    }
    catch {
        Write-Host "[ERROR] AWS CLI not configured" -ForegroundColor Red
        exit 1
    }
    
    # Get AWS account ID
    $accountId = aws sts get-caller-identity --query Account --output text
    if ([string]::IsNullOrWhiteSpace($env:AWS_REGION)) {
        $region = "us-east-1"
    } else {
        $region = $env:AWS_REGION
    }
    
    Write-Host "  Account ID: $accountId" -ForegroundColor Gray
    Write-Host "  Region: $region" -ForegroundColor Gray
    Write-Host ""
    
    # Create OIDC provider if it doesn't exist
    Write-Host "Creating OpenID Connect provider..." -ForegroundColor Yellow
    
    $oidcProviderName = "token.actions.githubusercontent.com"
    $oidcProviderArn = "arn:aws:iam::$accountId`:oidc-provider/$oidcProviderName"
    
    try {
        $existing = aws iam get-open-id-connect-provider --open-id-connect-provider-arn $oidcProviderArn 2>&1
        Write-Host "[PASS] OIDC provider already exists" -ForegroundColor Green
    }
    catch {
        # Create new OIDC provider
        $thumbprint = "6938fd4d98bab03faadb97b34396831e3780aea1"  # GitHub's OIDC thumbprint
        
        aws iam create-open-id-connect-provider `
            --url "https://$oidcProviderName" `
            --client-id-list "sts.amazonaws.com" `
            --thumbprint-list $thumbprint | Out-Null
        
        Write-Host "[PASS] Created OIDC provider" -ForegroundColor Green
    }
    
    Write-Host "  ARN: $oidcProviderArn" -ForegroundColor Gray
    Write-Host ""
    
    # Create IAM role for GitHub Actions
    Write-Host "Creating IAM role for GitHub Actions..." -ForegroundColor Yellow
    
    $assumeRolePolicyDocument = @{
        Version = "2012-10-17"
        Statement = @(
            @{
                Effect = "Allow"
                Principal = @{
                    Federated = $oidcProviderArn
                }
                Action = "sts:AssumeRoleWithWebIdentity"
                Condition = @{
                    StringEquals = @{
                        "$($oidcProviderName):aud" = "sts.amazonaws.com"
                    }
                    StringLike = @{
                        "$($oidcProviderName):sub" = "repo:$Repository`:*"
                    }
                }
            }
        )
    } | ConvertTo-Json -Depth 10
    
    $existingRole = aws iam get-role --role-name $RoleName --output json 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[PASS] Role already exists: $RoleName" -ForegroundColor Green

        # Update trust policy
        aws iam update-assume-role-policy `
            --role-name $RoleName `
            --policy-document $assumeRolePolicyDocument | Out-Null
        Write-Host "  Updated trust policy" -ForegroundColor Gray
    } else {
        # Create new role
        aws iam create-role `
            --role-name $RoleName `
            --assume-role-policy-document $assumeRolePolicyDocument `
            --description "GitHub Actions OIDC role for $Repository" | Out-Null

        Write-Host "[PASS] Created role: $RoleName" -ForegroundColor Green
    }
    
    Write-Host ""
    
    # Attach policies
    Write-Host "Attaching policies..." -ForegroundColor Yellow
    
    $policiesToAttach = @(
        "arn:aws:iam::aws:policy/AmazonS3FullAccess",
        "arn:aws:iam::aws:policy/AWSLambda_FullAccess",
        "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
        "arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator",
        "arn:aws:iam::aws:policy/IAMFullAccess",
        "arn:aws:iam::aws:policy/AmazonEventBridgeFullAccess",
        "arn:aws:iam::aws:policy/AmazonSNSFullAccess",
        "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
        "arn:aws:iam::aws:policy/CloudWatchFullAccessV2"
    )
    
    foreach ($policy in $policiesToAttach) {
        try {
            aws iam attach-role-policy `
                --role-name $RoleName `
                --policy-arn $policy 2>&1 | Out-Null
            Write-Host "  [PASS] Attached: $policy" -ForegroundColor Green
        }
        catch {
            Write-Host "  [WARN] Policy may already be attached: $policy" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "AWS OIDC Configuration:" -ForegroundColor Cyan
    Write-Host "  Role ARN: arn:aws:iam::$accountId`:role/$RoleName" -ForegroundColor Yellow
    Write-Host "  OIDC Provider: $oidcProviderArn" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[PASS] AWS OIDC setup complete!" -ForegroundColor Green
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════
# TERRAFORM STATE BACKEND SETUP (AWS)
# ═══════════════════════════════════════════════════════════════════════════

if ($SetupTerraformState) {
        if ($AzureOnly) {
                Write-Host "[ERROR] Terraform state setup requires AWS access" -ForegroundColor Red
                exit 1
        }

        if ([string]::IsNullOrWhiteSpace($StateBucketName) -or
                [string]::IsNullOrWhiteSpace($StateLockTableName) -or
                [string]::IsNullOrWhiteSpace($StateKey) -or
                [string]::IsNullOrWhiteSpace($StateRegion) -or
                [string]::IsNullOrWhiteSpace($StateIpCidr)) {
                Write-Host "[ERROR] Missing state backend parameters. Provide -StateBucketName, -StateLockTableName, -StateKey, -StateRegion, -StateIpCidr" -ForegroundColor Red
                exit 1
        }

        Write-Host "Setting up Terraform state backend..." -ForegroundColor Cyan
        Write-Host "  Bucket: $StateBucketName" -ForegroundColor Gray
        Write-Host "  Table:  $StateLockTableName" -ForegroundColor Gray
        Write-Host "  Key:    $StateKey" -ForegroundColor Gray
        Write-Host "  Region: $StateRegion" -ForegroundColor Gray
        Write-Host "  IP:     $StateIpCidr" -ForegroundColor Gray
        Write-Host ""

        try {
                $null = aws sts get-caller-identity 2>&1
        }
        catch {
                Write-Host "[ERROR] AWS CLI not configured" -ForegroundColor Red
                exit 1
        }

        $accountId = aws sts get-caller-identity --query Account --output text
        $roleArn = "arn:aws:iam::$accountId`:role/$RoleName"

        # Create bucket if needed
        $null = aws s3api head-bucket --bucket $StateBucketName 2>&1
        if ($LASTEXITCODE -ne 0) {
                if ($StateRegion -eq "us-east-1") {
                        aws s3api create-bucket --bucket $StateBucketName | Out-Null
                } else {
                        aws s3api create-bucket --bucket $StateBucketName --region $StateRegion --create-bucket-configuration "LocationConstraint=$StateRegion" | Out-Null
                }
        }

        aws s3api put-public-access-block --bucket $StateBucketName --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" | Out-Null
        aws s3api put-bucket-versioning --bucket $StateBucketName --versioning-configuration "Status=Enabled" | Out-Null
        aws s3api put-bucket-encryption --bucket $StateBucketName --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' | Out-Null

        # Create lock table if needed
        $null = aws dynamodb describe-table --table-name $StateLockTableName --region $StateRegion 2>&1
        if ($LASTEXITCODE -ne 0) {
                aws dynamodb create-table --table-name $StateLockTableName --billing-mode PAY_PER_REQUEST --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --region $StateRegion | Out-Null
                aws dynamodb wait table-exists --table-name $StateLockTableName --region $StateRegion
        }

        # Apply bucket policy (GitHub role + IP allowlist)
        $policy = @"
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowGitHubRoleStateAccess",
            "Effect": "Allow",
            "Principal": {"AWS": "${roleArn}"},
            "Action": [
                "s3:ListBucket",
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:GetBucketVersioning"
            ],
            "Resource": [
                "arn:aws:s3:::$StateBucketName",
                "arn:aws:s3:::$StateBucketName/*"
            ]
        },
        {
            "Sid": "AllowAccountFromOfficeIP",
            "Effect": "Allow",
            "Principal": "*",
            "Action": [
                "s3:ListBucket",
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:GetBucketVersioning"
            ],
            "Resource": [
                "arn:aws:s3:::$StateBucketName",
                "arn:aws:s3:::$StateBucketName/*"
            ],
            "Condition": {
                "IpAddress": {"aws:SourceIp": "${StateIpCidr}"},
                "StringEquals": {"aws:PrincipalAccount": "${accountId}"}
            }
        }
    ]
}
"@
        $policyPath = Join-Path $env:TEMP "terraform-state-policy.json"
        Set-Content -Path $policyPath -Value $policy -NoNewline
        aws s3api put-bucket-policy --bucket $StateBucketName --policy file://$policyPath | Out-Null
        Remove-Item $policyPath -Force

        Write-Host "[PASS] Terraform state backend ready" -ForegroundColor Green
        Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════
# GITHUB SECRETS
# ═══════════════════════════════════════════════════════════════════════════

Write-Host "----------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "GitHub Secrets for Workflows" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

if (-not $AwsOnly) {
    Write-Host "Azure Secrets (OIDC - no client secret needed):" -ForegroundColor Yellow
    Write-Host "  GitHub CLI:"
    Write-Host "    gh secret set AZURE_CLIENT_ID --body '$spAppId'"
    Write-Host "    gh secret set AZURE_TENANT_ID --body '$tenantId'"
    Write-Host "    gh secret set AZURE_SUBSCRIPTION_ID --body '$subscriptionId'"
    Write-Host ""
    Write-Host "  GitHub UI: Settings > Secrets and variables > Actions"
    Write-Host ""
}

if (-not $AzureOnly) {
    $awsRoleArn = "arn:aws:iam::$accountId`:role/$RoleName"
    Write-Host "AWS Secrets (OIDC - no access key/secret needed):" -ForegroundColor Yellow
    Write-Host "  GitHub CLI:"
    Write-Host "    gh secret set AWS_ROLE_ARN --body '$awsRoleArn'"
    Write-Host "    gh secret set AWS_REGION --body '$region'"
    Write-Host ""
    Write-Host "  GitHub UI: Settings > Secrets and variables > Actions"
    Write-Host ""

    if ($SetSecrets) {
        Write-Host "Setting GitHub secrets via gh CLI..." -ForegroundColor Yellow
        try {
            gh secret set AWS_ROLE_ARN --body $awsRoleArn
            Write-Host "  [PASS] Set AWS_ROLE_ARN" -ForegroundColor Green
            gh secret set AWS_REGION --body $region
            Write-Host "  [PASS] Set AWS_REGION" -ForegroundColor Green
        } catch {
            Write-Host "  [ERROR] Failed to set secrets. Ensure gh CLI is authenticated." -ForegroundColor Red
        }
        Write-Host ""
    }
}

if ($SetupTerraformState) {
    Write-Host "Terraform State Variables:" -ForegroundColor Yellow
    Write-Host "  GitHub CLI:"
    Write-Host "    gh variable set TF_STATE_BUCKET --body '$StateBucketName'"
    Write-Host "    gh variable set TF_STATE_KEY --body '$StateKey'"
    Write-Host "    gh variable set TF_STATE_REGION --body '$StateRegion'"
    Write-Host "    gh variable set TF_STATE_LOCK_TABLE --body '$StateLockTableName'"
    Write-Host ""
    Write-Host "Terraform State Secrets:" -ForegroundColor Yellow
    Write-Host "  GitHub CLI:"
    Write-Host "    gh secret set TF_STATE_IP_CIDR --body '$StateIpCidr'"
    Write-Host ""
    Write-Host "  GitHub UI: Settings > Secrets and variables > Actions"
    Write-Host ""
}

Write-Host "----------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "Benefits of OIDC Setup" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
Write-Host "[PASS] No long-lived credentials stored in GitHub" -ForegroundColor Green
Write-Host "[PASS] Credentials are short-lived (expires after workflow)" -ForegroundColor Green
Write-Host "[PASS] Reduced attack surface and compliance risk" -ForegroundColor Green
Write-Host "[PASS] Easier credential rotation" -ForegroundColor Green
Write-Host "[PASS] Full audit trail in AWS/Azure" -ForegroundColor Green
Write-Host ""

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  GitHub OIDC Bootstrap Complete!                               " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Add secrets to GitHub (see commands above)"
Write-Host "  2. Update workflows to use OIDC (see: .github/workflows/)"
Write-Host "  3. Test workflows with: gh workflow run <workflow-name>"
Write-Host "  4. Monitor in: https://github.com/$Repository/actions"
Write-Host ""
