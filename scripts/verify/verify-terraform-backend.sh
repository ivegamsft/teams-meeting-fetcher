#!/usr/bin/env bash
# Verify that the Terraform state backend (S3 + DynamoDB) exists and
# GitHub repository variables are set correctly.
#
# Usage:
#   ./verify-terraform-backend.sh [options]
#
# Options:
#   --region REGION             AWS region (default: us-east-1)
#   --bucket-prefix PREFIX      S3 bucket name prefix (default: tmf-terraform-state)
#   --lock-table NAME           DynamoDB table name (default: tmf-terraform-state-lock)
#   --repository OWNER/REPO    GitHub repository (default: detected from git remote)
#   --skip-github              Skip GitHub variable checks
#
# Exit code 0 if all checks pass, 1 if any fail.

set -uo pipefail

REGION="us-east-1"
BUCKET_PREFIX="tmf-terraform-state"
LOCK_TABLE="tmf-terraform-state-lock"
REPOSITORY=""
SKIP_GITHUB=false
PASS=0
FAIL=0
WARN=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --region) REGION="$2"; shift 2 ;;
        --bucket-prefix) BUCKET_PREFIX="$2"; shift 2 ;;
        --lock-table) LOCK_TABLE="$2"; shift 2 ;;
        --repository) REPOSITORY="$2"; shift 2 ;;
        --skip-github) SKIP_GITHUB=true; shift ;;
        *) echo "[ERROR] Unknown option: $1"; exit 1 ;;
    esac
done

pass() { PASS=$((PASS + 1)); echo "[PASS] $1"; }
fail() { FAIL=$((FAIL + 1)); echo "[FAIL] $1"; }
warn() { WARN=$((WARN + 1)); echo "[WARN] $1"; }

echo "================================================================"
echo "  Terraform State Backend Verification"
echo "================================================================"
echo ""

# ── AWS Auth ───────────────────────────────────────────────────────────────

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) || {
    fail "AWS CLI not configured or not authenticated"
    echo ""
    echo "Results: ${PASS} passed, ${FAIL} failed, ${WARN} warnings"
    exit 1
}
pass "AWS authenticated (account: ${ACCOUNT_ID})"

BUCKET_NAME="${BUCKET_PREFIX}-${ACCOUNT_ID}"
echo ""

# ── S3 Bucket ──────────────────────────────────────────────────────────────

echo "S3 State Bucket: ${BUCKET_NAME}"

if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
    pass "Bucket exists"
else
    fail "Bucket does not exist: ${BUCKET_NAME}"
fi

# Versioning
VERSIONING=$(aws s3api get-bucket-versioning --bucket "$BUCKET_NAME" --query "Status" --output text 2>/dev/null || echo "None")
if [ "$VERSIONING" = "Enabled" ]; then
    pass "Versioning enabled"
else
    fail "Versioning not enabled (status: ${VERSIONING})"
fi

# Encryption
ENCRYPTION=$(aws s3api get-bucket-encryption --bucket "$BUCKET_NAME" \
    --query "ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm" \
    --output text 2>/dev/null || echo "None")
if [ "$ENCRYPTION" = "AES256" ] || [ "$ENCRYPTION" = "aws:kms" ]; then
    pass "Server-side encryption enabled (${ENCRYPTION})"
else
    fail "Encryption not configured"
fi

# Public access block
BLOCK_PUBLIC=$(aws s3api get-public-access-block --bucket "$BUCKET_NAME" \
    --query "[PublicAccessBlockConfiguration.BlockPublicAcls, PublicAccessBlockConfiguration.IgnorePublicAcls, PublicAccessBlockConfiguration.BlockPublicPolicy, PublicAccessBlockConfiguration.RestrictPublicBuckets]" \
    --output text 2>/dev/null || echo "")
if echo "$BLOCK_PUBLIC" | grep -q "False"; then
    fail "Public access not fully blocked"
else
    pass "All public access blocked"
fi

echo ""

# ── DynamoDB Lock Table ────────────────────────────────────────────────────

echo "DynamoDB Lock Table: ${LOCK_TABLE}"

TABLE_STATUS=$(aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" \
    --query "Table.TableStatus" --output text 2>/dev/null || echo "NOT_FOUND")
if [ "$TABLE_STATUS" = "ACTIVE" ]; then
    pass "Lock table exists and is ACTIVE"
else
    fail "Lock table does not exist or not active (status: ${TABLE_STATUS})"
fi

# Key schema
KEY_NAME=$(aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" \
    --query "Table.KeySchema[0].AttributeName" --output text 2>/dev/null || echo "")
if [ "$KEY_NAME" = "LockID" ]; then
    pass "Partition key is LockID"
else
    fail "Partition key is '${KEY_NAME}' (expected LockID)"
fi

# Billing mode
BILLING=$(aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" \
    --query "Table.BillingModeSummary.BillingMode" --output text 2>/dev/null || echo "")
if [ "$BILLING" = "PAY_PER_REQUEST" ]; then
    pass "Billing mode is PAY_PER_REQUEST"
else
    warn "Billing mode is '${BILLING}' (expected PAY_PER_REQUEST)"
fi

echo ""

# ── GitHub Variables ───────────────────────────────────────────────────────

if [ "$SKIP_GITHUB" = false ]; then
    # Detect repository
    if [ -z "$REPOSITORY" ]; then
        REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
        if [[ "$REMOTE_URL" =~ github\.com[:/](.+)/(.+?)(\.git)?$ ]]; then
            REPOSITORY="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
            REPOSITORY="${REPOSITORY%.git}"
        fi
    fi

    if [ -n "$REPOSITORY" ]; then
        echo "GitHub Variables (${REPOSITORY}):"

        check_var() {
            local NAME="$1"
            local EXPECTED="$2"
            local VALUE
            VALUE=$(gh variable list -R "$REPOSITORY" --json name,value -q ".[] | select(.name==\"${NAME}\") | .value" 2>/dev/null || echo "")
            if [ -z "$VALUE" ]; then
                fail "${NAME} not set"
            elif [ "$VALUE" = "$EXPECTED" ]; then
                pass "${NAME} = ${VALUE}"
            else
                warn "${NAME} = ${VALUE} (expected: ${EXPECTED})"
            fi
        }

        check_var "TF_STATE_BUCKET" "$BUCKET_NAME"
        check_var "TF_STATE_KEY" "teams-meeting-fetcher/terraform.tfstate"
        check_var "TF_STATE_REGION" "$REGION"
        check_var "TF_STATE_LOCK_TABLE" "$LOCK_TABLE"
    else
        warn "Could not detect repository -- skipping GitHub variable checks"
    fi
else
    echo "[SKIP] GitHub variable checks"
fi

echo ""

# ── Summary ────────────────────────────────────────────────────────────────

echo "================================================================"
echo "  Results: ${PASS} passed, ${FAIL} failed, ${WARN} warnings"
echo "================================================================"
echo ""

if [ "$FAIL" -gt 0 ]; then
    exit 1
else
    exit 0
fi
