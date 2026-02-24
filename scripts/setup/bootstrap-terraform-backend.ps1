#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Bootstrap the Terraform state backend (S3 bucket + DynamoDB lock table) and
    push the corresponding GitHub repository variables.

.DESCRIPTION
    Creates or validates:
      - S3 bucket with versioning, AES-256 encryption, and all public access blocked
      - DynamoDB table with LockID partition key and pay-per-request billing
    Then sets GitHub repository variables:
      TF_STATE_BUCKET, TF_STATE_KEY, TF_STATE_REGION, TF_STATE_LOCK_TABLE

    Idempotent — safe to re-run.

.PARAMETER Region
    AWS region for the state resources (default: us-east-1)

.PARAMETER BucketPrefix
    Prefix for the S3 bucket name; account ID is appended (default: tmf-terraform-state)

.PARAMETER LockTableName
    DynamoDB table name (default: tmf-terraform-state-lock)

.PARAMETER StateKey
    S3 key path for the state file (default: teams-meeting-fetcher/terraform.tfstate)

.PARAMETER Repository
    GitHub repository in owner/repo format (default: detected from git remote)

.PARAMETER SkipGitHubVars
    Skip setting GitHub variables (useful for testing)

.EXAMPLE
    .\bootstrap-terraform-backend.ps1

.EXAMPLE
    .\bootstrap-terraform-backend.ps1 -Region us-west-2 -Repository "myorg/myrepo"
#>

param(
    [string]$Region = "us-east-1",
    [string]$BucketPrefix = "tmf-terraform-state",
    [string]$LockTableName = "tmf-terraform-state-lock",
    [string]$StateKey = "teams-meeting-fetcher/terraform.tfstate",
    [string]$Repository,
    [switch]$SkipGitHubVars
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Terraform State Backend Bootstrap                             " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# ── Prerequisites ──────────────────────────────────────────────────────────

try {
    $identity = aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
} catch {
    Write-Host "[ERROR] AWS CLI not configured or not authenticated" -ForegroundColor Red
    exit 1
}

$accountId = $identity.Account
$bucketName = "$BucketPrefix-$accountId"

Write-Host "  Account:    $accountId" -ForegroundColor Gray
Write-Host "  Region:     $Region" -ForegroundColor Gray
Write-Host "  Bucket:     $bucketName" -ForegroundColor Gray
Write-Host "  Lock Table: $LockTableName" -ForegroundColor Gray
Write-Host "  State Key:  $StateKey" -ForegroundColor Gray
Write-Host ""

# ── Detect repository ─────────────────────────────────────────────────────

if (-not $Repository) {
    try {
        $remoteUrl = git config --get remote.origin.url
        if ($remoteUrl -match "github\.com[:/](.+)/(.+?)(?:\.git)?$") {
            $Repository = "$($matches[1])/$($matches[2])" -replace "\.git$"
        }
    } catch {
        Write-Host "[WARN] Could not detect repository from git remote" -ForegroundColor Yellow
    }
}

if ($Repository) {
    Write-Host "  Repository: $Repository" -ForegroundColor Gray
} else {
    Write-Host "  Repository: (not detected — GitHub vars will be skipped)" -ForegroundColor Yellow
    $SkipGitHubVars = $true
}
Write-Host ""

# ── S3 Bucket ──────────────────────────────────────────────────────────────

Write-Host "Creating S3 bucket..." -ForegroundColor Yellow
$null = aws s3api head-bucket --bucket $bucketName 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Bucket already exists: $bucketName" -ForegroundColor Green
} else {
    if ($Region -eq "us-east-1") {
        aws s3api create-bucket --bucket $bucketName --region $Region --output json 2>&1 | Out-Null
    } else {
        aws s3api create-bucket --bucket $bucketName --region $Region --create-bucket-configuration "LocationConstraint=$Region" --output json 2>&1 | Out-Null
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create bucket" -ForegroundColor Red
        exit 1
    }
    Write-Host "[PASS] Created bucket: $bucketName" -ForegroundColor Green
}

# Versioning
aws s3api put-bucket-versioning --bucket $bucketName --versioning-configuration Status=Enabled 2>&1 | Out-Null
Write-Host "  [PASS] Versioning enabled" -ForegroundColor Green

# Encryption
$sseJson = '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
$tmpFile = Join-Path $env:TEMP "sse-config-$([guid]::NewGuid().ToString('N').Substring(0,8)).json"
Set-Content -Path $tmpFile -Value $sseJson -NoNewline
aws s3api put-bucket-encryption --bucket $bucketName --server-side-encryption-configuration file://$tmpFile 2>&1 | Out-Null
Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
Write-Host "  [PASS] AES-256 encryption enabled" -ForegroundColor Green

# Block public access
aws s3api put-public-access-block --bucket $bucketName --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true 2>&1 | Out-Null
Write-Host "  [PASS] All public access blocked" -ForegroundColor Green
Write-Host ""

# ── DynamoDB Lock Table ────────────────────────────────────────────────────

Write-Host "Creating DynamoDB lock table..." -ForegroundColor Yellow
$null = aws dynamodb describe-table --table-name $LockTableName --region $Region 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[PASS] Lock table already exists: $LockTableName" -ForegroundColor Green
} else {
    aws dynamodb create-table `
        --table-name $LockTableName `
        --billing-mode PAY_PER_REQUEST `
        --attribute-definitions AttributeName=LockID,AttributeType=S `
        --key-schema AttributeName=LockID,KeyType=HASH `
        --region $Region --output json 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create lock table" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Waiting for table to become active..." -ForegroundColor Gray
    aws dynamodb wait table-exists --table-name $LockTableName --region $Region
    Write-Host "[PASS] Created lock table: $LockTableName" -ForegroundColor Green
}
Write-Host ""

# ── GitHub Variables ───────────────────────────────────────────────────────

if (-not $SkipGitHubVars) {
    Write-Host "Setting GitHub repository variables..." -ForegroundColor Yellow

    $repoFlag = "-R $Repository"

    gh variable set TF_STATE_BUCKET --body $bucketName -R $Repository
    Write-Host "  [PASS] TF_STATE_BUCKET = $bucketName" -ForegroundColor Green

    gh variable set TF_STATE_KEY --body $StateKey -R $Repository
    Write-Host "  [PASS] TF_STATE_KEY = $StateKey" -ForegroundColor Green

    gh variable set TF_STATE_REGION --body $Region -R $Repository
    Write-Host "  [PASS] TF_STATE_REGION = $Region" -ForegroundColor Green

    gh variable set TF_STATE_LOCK_TABLE --body $LockTableName -R $Repository
    Write-Host "  [PASS] TF_STATE_LOCK_TABLE = $LockTableName" -ForegroundColor Green

    Write-Host ""
} else {
    Write-Host "[SKIP] GitHub variables (--SkipGitHubVars or no repository detected)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Set manually:" -ForegroundColor Yellow
    Write-Host "  gh variable set TF_STATE_BUCKET --body '$bucketName'"
    Write-Host "  gh variable set TF_STATE_KEY --body '$StateKey'"
    Write-Host "  gh variable set TF_STATE_REGION --body '$Region'"
    Write-Host "  gh variable set TF_STATE_LOCK_TABLE --body '$LockTableName'"
    Write-Host ""
}

# ── Summary ────────────────────────────────────────────────────────────────

Write-Host "================================================================" -ForegroundColor Green
Write-Host "  Terraform State Backend Ready                                 " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Bucket:     $bucketName" -ForegroundColor Gray
Write-Host "  Lock Table: $LockTableName" -ForegroundColor Gray
Write-Host "  State Key:  $StateKey" -ForegroundColor Gray
Write-Host "  Region:     $Region" -ForegroundColor Gray
Write-Host ""
Write-Host "  terraform init \" -ForegroundColor Yellow
Write-Host "    -backend-config=`"bucket=$bucketName`" \" -ForegroundColor Yellow
Write-Host "    -backend-config=`"key=$StateKey`" \" -ForegroundColor Yellow
Write-Host "    -backend-config=`"region=$Region`" \" -ForegroundColor Yellow
Write-Host "    -backend-config=`"dynamodb_table=$LockTableName`" \" -ForegroundColor Yellow
Write-Host "    -backend-config=`"encrypt=true`"" -ForegroundColor Yellow
Write-Host ""
