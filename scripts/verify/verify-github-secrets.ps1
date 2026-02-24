#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verify GitHub OIDC configuration for AWS deployments

.DESCRIPTION
    Checks both GitHub-side secrets and AWS-side resources needed for
    OIDC-based GitHub Actions deployments. Reports pass/fail for each check.

.PARAMETER RoleName
    AWS IAM role name to verify (default: GitHubActionsTeamsMeetingFetcher)

.PARAMETER Repository
    GitHub repository in format 'owner/repo' (default: current git remote)
#>

param(
    [string]$RoleName = "GitHubActionsTeamsMeetingFetcher",
    [string]$Repository
)

$ErrorActionPreference = "Continue"
$passed = 0
$failed = 0

function Write-Check {
    param([bool]$Ok, [string]$Label)
    if ($Ok) {
        Write-Host "  [PASS] $Label" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "  [FAIL] $Label" -ForegroundColor Red
        $script:failed++
    }
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  OIDC Deployment Verification                                  " -ForegroundColor Cyan
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
    } catch {}
}

if ($Repository) {
    Write-Host "Repository: $Repository" -ForegroundColor Yellow
}
Write-Host "Role Name:  $RoleName" -ForegroundColor Yellow
Write-Host ""

# ---------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------
Write-Host "Prerequisites:" -ForegroundColor Cyan

$ghInstalled = $false
try {
    $null = gh --version 2>&1
    $ghInstalled = $true
} catch {}
Write-Check $ghInstalled "GitHub CLI (gh) installed"

$awsInstalled = $false
try {
    $null = aws sts get-caller-identity 2>&1
    if ($LASTEXITCODE -eq 0) { $awsInstalled = $true }
} catch {}
Write-Check $awsInstalled "AWS CLI configured"

Write-Host ""

# ---------------------------------------------------------------
# 2. GitHub Secrets (OIDC-era)
# ---------------------------------------------------------------
Write-Host "GitHub Secrets (OIDC):" -ForegroundColor Cyan

if ($ghInstalled -and $Repository) {
    $secretList = @()
    try {
        $rawList = gh secret list -R $Repository 2>&1
        if ($LASTEXITCODE -eq 0) {
            $secretList = $rawList | ForEach-Object { ($_ -split '\s+')[0] }
        }
    } catch {}

    $oidcSecrets = @("AWS_ROLE_ARN", "AWS_REGION")
    foreach ($secret in $oidcSecrets) {
        Write-Check ($secretList -contains $secret) "$secret exists in GitHub"
    }

    # Warn about stale IAM-user-era secrets
    $staleSecrets = @("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")
    foreach ($secret in $staleSecrets) {
        if ($secretList -contains $secret) {
            Write-Host "  [WARN] $secret still present -- remove this legacy IAM-user secret" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  [SKIP] Cannot check GitHub secrets without gh CLI" -ForegroundColor Yellow
}

Write-Host ""

# ---------------------------------------------------------------
# 3. AWS OIDC Provider
# ---------------------------------------------------------------
Write-Host "AWS OIDC Provider:" -ForegroundColor Cyan

if ($awsInstalled) {
    $accountId = aws sts get-caller-identity --query Account --output text
    $oidcArn = "arn:aws:iam::$accountId`:oidc-provider/token.actions.githubusercontent.com"

    $oidcExists = $false
    try {
        $null = aws iam get-open-id-connect-provider --open-id-connect-provider-arn $oidcArn 2>&1
        if ($LASTEXITCODE -eq 0) { $oidcExists = $true }
    } catch {}
    Write-Check $oidcExists "OIDC provider exists ($oidcArn)"
} else {
    Write-Host "  [SKIP] Cannot check AWS resources without AWS CLI" -ForegroundColor Yellow
}

Write-Host ""

# ---------------------------------------------------------------
# 4. IAM Role & Trust Policy
# ---------------------------------------------------------------
Write-Host "IAM Role:" -ForegroundColor Cyan

if ($awsInstalled) {
    $roleJson = $null
    try {
        $roleJson = aws iam get-role --role-name $RoleName --output json 2>$null
    } catch {}

    $roleExists = ($LASTEXITCODE -eq 0 -and $roleJson)
    Write-Check $roleExists "Role '$RoleName' exists"

    if ($roleExists -and $Repository) {
        $trustOk = $false
        try {
            $roleObj = $roleJson | ConvertFrom-Json
            $trustDoc = $roleObj.Role.AssumeRolePolicyDocument
            # Handle both string (URL-encoded) and object (parsed JSON) formats
            if ($trustDoc -is [string]) {
                $trustDoc = [uri]::UnescapeDataString($trustDoc)
            } else {
                $trustDoc = $trustDoc | ConvertTo-Json -Depth 10
            }
            if ($trustDoc -match [regex]::Escape($Repository)) {
                $trustOk = $true
            }
        } catch {}
        Write-Check $trustOk "Trust policy references repo '$Repository'"
    }
} else {
    Write-Host "  [SKIP] Cannot check IAM role without AWS CLI" -ForegroundColor Yellow
}

Write-Host ""

# ---------------------------------------------------------------
# 5. Attached Policies
# ---------------------------------------------------------------
Write-Host "Attached Policies:" -ForegroundColor Cyan

$expectedPolicies = @(
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

if ($awsInstalled -and $roleExists) {
    $attachedRaw = aws iam list-attached-role-policies --role-name $RoleName --query "AttachedPolicies[].PolicyArn" --output json 2>$null
    $attachedPolicies = @()
    if ($LASTEXITCODE -eq 0 -and $attachedRaw) {
        $attachedPolicies = ($attachedRaw | ConvertFrom-Json)
    }

    foreach ($policy in $expectedPolicies) {
        $shortName = $policy -replace "arn:aws:iam::aws:policy/", ""
        Write-Check ($attachedPolicies -contains $policy) "$shortName"
    }

    # Warn about overly broad policies
    if ($attachedPolicies -contains "arn:aws:iam::aws:policy/AdministratorAccess") {
        Write-Host "  [WARN] AdministratorAccess is still attached -- consider removing it" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [SKIP] Cannot check policies (role not found or AWS CLI unavailable)" -ForegroundColor Yellow
}

Write-Host ""

# ---------------------------------------------------------------
# Summary
# ---------------------------------------------------------------
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Results: $passed passed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

if ($failed -gt 0) {
    exit 1
}
