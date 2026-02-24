#!/usr/bin/env bash
# Bootstrap the Terraform state backend (S3 bucket + DynamoDB lock table)
# and push the corresponding GitHub repository variables.
#
# Usage:
#   ./bootstrap-terraform-backend.sh [options]
#
# Options:
#   --region REGION             AWS region (default: us-east-1)
#   --bucket-prefix PREFIX      S3 bucket name prefix (default: tmf-terraform-state)
#   --lock-table NAME           DynamoDB table name (default: tmf-terraform-state-lock)
#   --state-key KEY             S3 key for state file (default: teams-meeting-fetcher/terraform.tfstate)
#   --repository OWNER/REPO    GitHub repository (default: detected from git remote)
#   --skip-github-vars          Skip setting GitHub variables

set -euo pipefail

REGION="us-east-1"
BUCKET_PREFIX="tmf-terraform-state"
LOCK_TABLE="tmf-terraform-state-lock"
STATE_KEY="teams-meeting-fetcher/terraform.tfstate"
REPOSITORY=""
SKIP_GITHUB_VARS=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --region) REGION="$2"; shift 2 ;;
        --bucket-prefix) BUCKET_PREFIX="$2"; shift 2 ;;
        --lock-table) LOCK_TABLE="$2"; shift 2 ;;
        --state-key) STATE_KEY="$2"; shift 2 ;;
        --repository) REPOSITORY="$2"; shift 2 ;;
        --skip-github-vars) SKIP_GITHUB_VARS=true; shift ;;
        *) echo "[ERROR] Unknown option: $1"; exit 1 ;;
    esac
done

echo "================================================================"
echo "  Terraform State Backend Bootstrap"
echo "================================================================"
echo ""

# ── Prerequisites ──────────────────────────────────────────────────────────

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || {
    echo "[ERROR] AWS CLI not configured or not authenticated"
    exit 1
}

BUCKET_NAME="${BUCKET_PREFIX}-${ACCOUNT_ID}"

echo "  Account:    ${ACCOUNT_ID}"
echo "  Region:     ${REGION}"
echo "  Bucket:     ${BUCKET_NAME}"
echo "  Lock Table: ${LOCK_TABLE}"
echo "  State Key:  ${STATE_KEY}"
echo ""

# ── Detect repository ─────────────────────────────────────────────────────

if [ -z "$REPOSITORY" ]; then
    REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
    if [[ "$REMOTE_URL" =~ github\.com[:/](.+)/(.+?)(\.git)?$ ]]; then
        REPOSITORY="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
        REPOSITORY="${REPOSITORY%.git}"
    fi
fi

if [ -n "$REPOSITORY" ]; then
    echo "  Repository: ${REPOSITORY}"
else
    echo "  Repository: (not detected -- GitHub vars will be skipped)"
    SKIP_GITHUB_VARS=true
fi
echo ""

# ── S3 Bucket ──────────────────────────────────────────────────────────────

echo "Creating S3 bucket..."
if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
    echo "[PASS] Bucket already exists: ${BUCKET_NAME}"
else
    if [ "$REGION" = "us-east-1" ]; then
        aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" --output json >/dev/null
    else
        aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" \
            --create-bucket-configuration "LocationConstraint=${REGION}" --output json >/dev/null
    fi
    echo "[PASS] Created bucket: ${BUCKET_NAME}"
fi

# Versioning
aws s3api put-bucket-versioning --bucket "$BUCKET_NAME" \
    --versioning-configuration Status=Enabled >/dev/null 2>&1
echo "  [PASS] Versioning enabled"

# Encryption
aws s3api put-bucket-encryption --bucket "$BUCKET_NAME" \
    --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}' >/dev/null 2>&1
echo "  [PASS] AES-256 encryption enabled"

# Block public access
aws s3api put-public-access-block --bucket "$BUCKET_NAME" \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true >/dev/null 2>&1
echo "  [PASS] All public access blocked"
echo ""

# ── DynamoDB Lock Table ────────────────────────────────────────────────────

echo "Creating DynamoDB lock table..."
if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" >/dev/null 2>&1; then
    echo "[PASS] Lock table already exists: ${LOCK_TABLE}"
else
    aws dynamodb create-table \
        --table-name "$LOCK_TABLE" \
        --billing-mode PAY_PER_REQUEST \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --region "$REGION" --output json >/dev/null
    echo "  Waiting for table to become active..."
    aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$REGION"
    echo "[PASS] Created lock table: ${LOCK_TABLE}"
fi
echo ""

# ── GitHub Variables ───────────────────────────────────────────────────────

if [ "$SKIP_GITHUB_VARS" = false ] && [ -n "$REPOSITORY" ]; then
    echo "Setting GitHub repository variables..."

    gh variable set TF_STATE_BUCKET --body "$BUCKET_NAME" -R "$REPOSITORY"
    echo "  [PASS] TF_STATE_BUCKET = ${BUCKET_NAME}"

    gh variable set TF_STATE_KEY --body "$STATE_KEY" -R "$REPOSITORY"
    echo "  [PASS] TF_STATE_KEY = ${STATE_KEY}"

    gh variable set TF_STATE_REGION --body "$REGION" -R "$REPOSITORY"
    echo "  [PASS] TF_STATE_REGION = ${REGION}"

    gh variable set TF_STATE_LOCK_TABLE --body "$LOCK_TABLE" -R "$REPOSITORY"
    echo "  [PASS] TF_STATE_LOCK_TABLE = ${LOCK_TABLE}"

    echo ""
else
    echo "[SKIP] GitHub variables"
    echo ""
    echo "Set manually:"
    echo "  gh variable set TF_STATE_BUCKET --body '${BUCKET_NAME}'"
    echo "  gh variable set TF_STATE_KEY --body '${STATE_KEY}'"
    echo "  gh variable set TF_STATE_REGION --body '${REGION}'"
    echo "  gh variable set TF_STATE_LOCK_TABLE --body '${LOCK_TABLE}'"
    echo ""
fi

# ── Summary ────────────────────────────────────────────────────────────────

echo "================================================================"
echo "  Terraform State Backend Ready"
echo "================================================================"
echo ""
echo "  Bucket:     ${BUCKET_NAME}"
echo "  Lock Table: ${LOCK_TABLE}"
echo "  State Key:  ${STATE_KEY}"
echo "  Region:     ${REGION}"
echo ""
echo "  terraform init \\"
echo "    -backend-config=\"bucket=${BUCKET_NAME}\" \\"
echo "    -backend-config=\"key=${STATE_KEY}\" \\"
echo "    -backend-config=\"region=${REGION}\" \\"
echo "    -backend-config=\"dynamodb_table=${LOCK_TABLE}\" \\"
echo "    -backend-config=\"encrypt=true\""
echo ""
