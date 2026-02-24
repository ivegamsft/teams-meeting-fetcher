#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verify that the Terraform state backend (S3 + DynamoDB) exists and
    GitHub repository variables are set correctly.

.DESCRIPTION
    Checks:
      1. S3 bucket exists, versioning enabled, encryption enabled, public access blocked
      2. DynamoDB lock table exists and is ACTIVE
      3. GitHub variables TF_STATE_BUCKET, TF_STATE_KEY, TF_STATE_REGION, TF_STATE_LOCK_TABLE are set

    Exits with code 0 if all checks pass, 1 if any fail.

.PARAMETER Region
    AWS region to check (default: us-east-1)

.PARAMETER BucketPrefix
    S3 bucket name prefix (default: tmf-terraform-state)

.PARAMETER LockTableName
    DynamoDB table name (default: tmf-terraform-state-lock)

.PARAMETER Repository
    GitHub repository in owner/repo format (default: detected from git remote)

.PARAMETER SkipGitHub
    Skip GitHub variable checks

.EXAMPLE
    .\verify-terraform-backend.ps1

.EXAMPLE
    .\verify-terraform-backend.ps1 -SkipGitHub
#>

param(
    [string]$Region = "us-east-1",
    [string]$BucketPrefix = "tmf-terraform-state",
    [string]$LockTableName = "tmf-terraform-state-lock",
    [string]$Repository,
    [switch]$SkipGitHub
)

$ErrorActionPreference = "Continue"
$pass = 0
$fail = 0
$warn = 0

function Pass($msg) { $script:pass++; Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { $script:fail++; Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Warn($msg) { $script:warn++; Write-Host "[WARN] $msg" -ForegroundColor Yellow }

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Terraform State Backend Verification                          " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# ── AWS Auth ───────────────────────────────────────────────────────────────

try {
    $identity = aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
    $accountId = $identity.Account
    Pass "AWS authenticated (account: $accountId)"
} catch {
    Fail "AWS CLI not configured or not authenticated"
    Write-Host ""
    Write-Host "Results: $pass passed, $fail failed, $warn warnings" -ForegroundColor Cyan
    exit 1
}

$bucketName = "$BucketPrefix-$accountId"
Write-Host ""

# ── S3 Bucket ──────────────────────────────────────────────────────────────

Write-Host "S3 State Bucket: $bucketName" -ForegroundColor Cyan

$null = aws s3api head-bucket --bucket $bucketName 2>&1
if ($LASTEXITCODE -eq 0) {
    Pass "Bucket exists"
} else {
    Fail "Bucket does not exist: $bucketName"
}

# Versioning
$versioning = aws s3api get-bucket-versioning --bucket $bucketName --query "Status" --output text 2>&1
if ($versioning -eq "Enabled") {
    Pass "Versioning enabled"
} else {
    Fail "Versioning not enabled (status: $versioning)"
}

# Encryption
$encryption = aws s3api get-bucket-encryption --bucket $bucketName --query "ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm" --output text 2>&1
if ($encryption -eq "AES256" -or $encryption -eq "aws:kms") {
    Pass "Server-side encryption enabled ($encryption)"
} else {
    Fail "Encryption not configured"
}

# Public access block
$publicBlock = aws s3api get-public-access-block --bucket $bucketName --output json 2>&1 | ConvertFrom-Json
if ($publicBlock.PublicAccessBlockConfiguration.BlockPublicAcls -eq $true -and
    $publicBlock.PublicAccessBlockConfiguration.IgnorePublicAcls -eq $true -and
    $publicBlock.PublicAccessBlockConfiguration.BlockPublicPolicy -eq $true -and
    $publicBlock.PublicAccessBlockConfiguration.RestrictPublicBuckets -eq $true) {
    Pass "All public access blocked"
} else {
    Fail "Public access not fully blocked"
}

Write-Host ""

# ── DynamoDB Lock Table ────────────────────────────────────────────────────

Write-Host "DynamoDB Lock Table: $LockTableName" -ForegroundColor Cyan

$tableStatus = aws dynamodb describe-table --table-name $LockTableName --region $Region --query "Table.TableStatus" --output text 2>&1
if ($LASTEXITCODE -eq 0 -and $tableStatus -eq "ACTIVE") {
    Pass "Lock table exists and is ACTIVE"
} else {
    Fail "Lock table does not exist or not active (status: $tableStatus)"
}

# Key schema
$keySchema = aws dynamodb describe-table --table-name $LockTableName --region $Region --query "Table.KeySchema[0].AttributeName" --output text 2>&1
if ($keySchema -eq "LockID") {
    Pass "Partition key is LockID"
} else {
    Fail "Partition key is '$keySchema' (expected LockID)"
}

# Billing mode
$billingMode = aws dynamodb describe-table --table-name $LockTableName --region $Region --query "Table.BillingModeSummary.BillingMode" --output text 2>&1
if ($billingMode -eq "PAY_PER_REQUEST") {
    Pass "Billing mode is PAY_PER_REQUEST"
} else {
    Warn "Billing mode is '$billingMode' (expected PAY_PER_REQUEST)"
}

Write-Host ""

# ── GitHub Variables ───────────────────────────────────────────────────────

if (-not $SkipGitHub) {
    # Detect repository
    if (-not $Repository) {
        try {
            $remoteUrl = git config --get remote.origin.url
            if ($remoteUrl -match "github\.com[:/](.+)/(.+?)(?:\.git)?$") {
                $Repository = "$($matches[1])/$($matches[2])" -replace "\.git$"
            }
        } catch {}
    }

    if ($Repository) {
        Write-Host "GitHub Variables ($Repository):" -ForegroundColor Cyan

        $vars = gh variable list -R $Repository --json name,value 2>&1 | ConvertFrom-Json
        $varMap = @{}
        foreach ($v in $vars) { $varMap[$v.name] = $v.value }

        $expectedVars = @{
            "TF_STATE_BUCKET"     = $bucketName
            "TF_STATE_KEY"        = "teams-meeting-fetcher/terraform.tfstate"
            "TF_STATE_REGION"     = $Region
            "TF_STATE_LOCK_TABLE" = $LockTableName
        }

        foreach ($name in $expectedVars.Keys) {
            if ($varMap.ContainsKey($name)) {
                if ($varMap[$name] -eq $expectedVars[$name]) {
                    Pass "$name = $($varMap[$name])"
                } else {
                    Warn "$name = $($varMap[$name]) (expected: $($expectedVars[$name]))"
                }
            } else {
                Fail "$name not set"
            }
        }
    } else {
        Warn "Could not detect repository — skipping GitHub variable checks"
    }
} else {
    Write-Host "[SKIP] GitHub variable checks" -ForegroundColor Yellow
}

Write-Host ""

# ── Summary ────────────────────────────────────────────────────────────────

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Results: $pass passed, $fail failed, $warn warnings" -ForegroundColor $(if ($fail -gt 0) { "Red" } else { "Green" })
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

if ($fail -gt 0) {
    exit 1
} else {
    exit 0
}
