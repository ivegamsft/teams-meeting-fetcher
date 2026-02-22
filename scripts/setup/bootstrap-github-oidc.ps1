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
    
.EXAMPLE
    .\bootstrap-github-oidc.ps1
    
.EXAMPLE
    .\bootstrap-github-oidc.ps1 -AzureOnly
    
.EXAMPLE
    .\bootstrap-github-oidc.ps1 -Repository "myorg/myrepo"
#>

param(
    [switch]$AzureOnly,
    [switch]$AwsOnly,
    [string]$Repository
)

$ErrorActionPreference = "Stop"

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  GitHub OIDC Bootstrap — Zero-Knowledge Authentication         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
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
        Write-Host "❌ Could not detect repository. Run inside a git repo or specify -Repository" -ForegroundColor Red
        exit 1
    }
}

Write-Host "📦 Repository: $Repository" -ForegroundColor Yellow
Write-Host ""

# ═══════════════════════════════════════════════════════════════════════════
# AZURE OIDC SETUP
# ═══════════════════════════════════════════════════════════════════════════

if (-not $AwsOnly) {
    Write-Host "🔷 Setting up Azure OIDC..." -ForegroundColor Cyan
    Write-Host ""
    
    # Check prerequisites
    try {
        $null = az version 2>&1
    }
    catch {
        Write-Host "❌ Azure CLI not installed" -ForegroundColor Red
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
        Write-Host "✅ Found existing SPN: $spnName" -ForegroundColor Green
    } else {
        Write-Host "Creating new SPN: $spnName..." -ForegroundColor Yellow
        $createResult = az ad sp create-for-rbac --name $spnName --output json | ConvertFrom-Json
        $spAppId = $createResult.appId
        Write-Host "✅ Created SPN: $spnName" -ForegroundColor Green
    }
    
    Write-Host "  App ID: $spAppId" -ForegroundColor Gray
    Write-Host ""
    
    # Create federated credential for GitHub main branch
    Write-Host "Creating federated credential for GitHub Actions..." -ForegroundColor Yellow
    
    $credentialName = "github-actions-oidc"
    $issuer = "https://token.actions.githubusercontent.com"
    $audience = "api://AzureADTokenExchange"
    $subject = "repo:$Repository:ref:refs/heads/main"
    
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
    
    az ad app federated-credential create `
        --id $spAppId `
        --parameters @{
            name = $credentialName
            issuer = $issuer
            subject = $subject
            audiences = @($audience)
            description = "GitHub Actions OIDC for $Repository (main branch)"
        } 2>&1 | Out-Null
    
    Write-Host "✅ Created federated credential" -ForegroundColor Green
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
            Write-Host "  ✅ Assigned: $($role.name)" -ForegroundColor Green
        } catch {
            Write-Host "  ⚠️  $($role.name) may already be assigned" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "📝 Azure OIDC Configuration:" -ForegroundColor Cyan
    Write-Host "  Client ID: $spAppId" -ForegroundColor Yellow
    Write-Host "  Tenant ID: $tenantId" -ForegroundColor Yellow
    Write-Host "  Subscription ID: $subscriptionId" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "✅ Azure OIDC setup complete!" -ForegroundColor Green
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════
# AWS OIDC SETUP
# ═══════════════════════════════════════════════════════════════════════════

if (-not $AzureOnly) {
    Write-Host "🟠 Setting up AWS OIDC..." -ForegroundColor Cyan
    Write-Host ""
    
    # Check prerequisites
    try {
        $null = aws sts get-caller-identity 2>&1
    }
    catch {
        Write-Host "❌ AWS CLI not configured" -ForegroundColor Red
        exit 1
    }
    
    # Get AWS account ID
    $accountId = aws sts get-caller-identity --query Account --output text
    $region = $env:AWS_REGION -or "us-east-1"
    
    Write-Host "  Account ID: $accountId" -ForegroundColor Gray
    Write-Host "  Region: $region" -ForegroundColor Gray
    Write-Host ""
    
    # Create OIDC provider if it doesn't exist
    Write-Host "Creating OpenID Connect provider..." -ForegroundColor Yellow
    
    $oidcProviderName = "token.actions.githubusercontent.com"
    $oidcProviderArn = "arn:aws:iam::$accountId`:oidc-provider/$oidcProviderName"
    
    try {
        $existing = aws iam get-open-id-connect-provider --open-id-connect-provider-arn $oidcProviderArn 2>&1
        Write-Host "✅ OIDC provider already exists" -ForegroundColor Green
    }
    catch {
        # Create new OIDC provider
        $thumbprint = "6938fd4d98bab03faadb97b34396831e3780aea1"  # GitHub's OIDC thumbprint
        
        aws iam create-open-id-connect-provider `
            --url "https://$oidcProviderName" `
            --client-id-list "sts.amazonaws.com" `
            --thumbprint-list $thumbprint | Out-Null
        
        Write-Host "✅ Created OIDC provider" -ForegroundColor Green
    }
    
    Write-Host "  ARN: $oidcProviderArn" -ForegroundColor Gray
    Write-Host ""
    
    # Create IAM role for GitHub Actions
    Write-Host "Creating IAM role for GitHub Actions..." -ForegroundColor Yellow
    
    $roleName = "github-actions-oidc-role"
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
    
    try {
        # Check if role exists
        $existingRole = aws iam get-role --role-name $roleName 2>&1
        Write-Host "✅ Role already exists" -ForegroundColor Green
        
        # Update trust policy
        aws iam update-assume-role-policy `
            --role-name $roleName `
            --policy-document $assumeRolePolicyDocument | Out-Null
        Write-Host "  Updated trust policy" -ForegroundColor Gray
    }
    catch {
        # Create new role
        aws iam create-role `
            --role-name $roleName `
            --assume-role-policy-document $assumeRolePolicyDocument `
            --description "GitHub Actions OIDC role for $Repository" | Out-Null
        
        Write-Host "✅ Created role: $roleName" -ForegroundColor Green
    }
    
    Write-Host ""
    
    # Attach policies
    Write-Host "Attaching policies..." -ForegroundColor Yellow
    
    $policiesToAttach = @(
        "arn:aws:iam::aws:policy/AdministratorAccess"  # For dev; use least-privilege in production
    )
    
    foreach ($policy in $policiesToAttach) {
        try {
            aws iam attach-role-policy `
                --role-name $roleName `
                --policy-arn $policy 2>&1 | Out-Null
            Write-Host "  ✅ Attached: $policy" -ForegroundColor Green
        }
        catch {
            Write-Host "  ⚠️  Policy may already be attached" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "📝 AWS OIDC Configuration:" -ForegroundColor Cyan
    Write-Host "  Role ARN: arn:aws:iam::$accountId`:role/$roleName" -ForegroundColor Yellow
    Write-Host "  OIDC Provider: $oidcProviderArn" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "✅ AWS OIDC setup complete!" -ForegroundColor Green
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════════════════
# GITHUB SECRETS
# ═══════════════════════════════════════════════════════════════════════════

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📝 Update GitHub Secrets for Workflows" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
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
    Write-Host "AWS Secrets (OIDC - no access key/secret needed):" -ForegroundColor Yellow
    Write-Host "  GitHub CLI:"
    Write-Host "    gh secret set AWS_ROLE_ARN --body 'arn:aws:iam::$accountId`:role/$roleName'"
    Write-Host "    gh secret set AWS_REGION --body '$region'"
    Write-Host ""
    Write-Host "  GitHub UI: Settings > Secrets and variables > Actions"
    Write-Host ""
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🔒 Benefits of OIDC Setup" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ No long-lived credentials stored in GitHub" -ForegroundColor Green
Write-Host "✅ Credentials are short-lived (expires after workflow)" -ForegroundColor Green
Write-Host "✅ Reduced attack surface and compliance risk" -ForegroundColor Green
Write-Host "✅ Easier credential rotation" -ForegroundColor Green
Write-Host "✅ Full audit trail in AWS/Azure" -ForegroundColor Green
Write-Host ""

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ GitHub OIDC Bootstrap Complete!                           ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Add secrets to GitHub (see commands above)"
Write-Host "  2. Update workflows to use OIDC (see: .github/workflows/)"
Write-Host "  3. Test workflows with: gh workflow run <workflow-name>"
Write-Host "  4. Monitor in: https://github.com/$Repository/actions"
Write-Host ""
