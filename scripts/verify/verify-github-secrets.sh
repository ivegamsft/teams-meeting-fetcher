#!/bin/bash
# Verify GitHub OIDC configuration for AWS deployments.
# Checks both GitHub-side secrets and AWS-side resources.
# Reports pass/fail for each check.

set +e

ROLE_NAME="GitHubActionsTeamsMeetingFetcher"
REPOSITORY=""
PASSED=0
FAILED=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --role-name) ROLE_NAME="$2"; shift 2 ;;
        --repository) REPOSITORY="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

check() {
    local ok=$1
    local label=$2
    if [ "$ok" = "true" ]; then
        echo "  [PASS] $label"
        PASSED=$((PASSED + 1))
    else
        echo "  [FAIL] $label"
        FAILED=$((FAILED + 1))
    fi
}

echo "================================================================"
echo "  OIDC Deployment Verification                                  "
echo "================================================================"
echo ""

# Detect repository if not provided
if [ -z "$REPOSITORY" ]; then
    REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
    if [[ $REMOTE_URL =~ github\.com[:/]([^/]+)/(.+?)(.git)?$ ]]; then
        REPOSITORY="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
        REPOSITORY="${REPOSITORY%.git}"
    fi
fi

if [ -n "$REPOSITORY" ]; then
    echo "Repository: $REPOSITORY"
fi
echo "Role Name:  $ROLE_NAME"
echo ""

# ---------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------
echo "Prerequisites:"

GH_INSTALLED=false
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
    GH_INSTALLED=true
fi
check "$GH_INSTALLED" "GitHub CLI (gh) installed and authenticated"

AWS_INSTALLED=false
if command -v aws &>/dev/null && aws sts get-caller-identity &>/dev/null; then
    AWS_INSTALLED=true
fi
check "$AWS_INSTALLED" "AWS CLI configured"

echo ""

# ---------------------------------------------------------------
# 2. GitHub Secrets (OIDC-era)
# ---------------------------------------------------------------
echo "GitHub Secrets (OIDC):"

if [ "$GH_INSTALLED" = true ] && [ -n "$REPOSITORY" ]; then
    SECRET_LIST=$(gh secret list -R "$REPOSITORY" 2>/dev/null || echo "")

    for secret in AWS_ROLE_ARN AWS_REGION; do
        if echo "$SECRET_LIST" | grep -q "^${secret}"; then
            check "true" "$secret exists in GitHub"
        else
            check "false" "$secret exists in GitHub"
        fi
    done

    # Warn about stale IAM-user-era secrets
    for secret in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
        if echo "$SECRET_LIST" | grep -q "^${secret}"; then
            echo "  [WARN] $secret still present -- remove this legacy IAM-user secret"
        fi
    done
else
    echo "  [SKIP] Cannot check GitHub secrets without gh CLI"
fi

echo ""

# ---------------------------------------------------------------
# 3. AWS OIDC Provider
# ---------------------------------------------------------------
echo "AWS OIDC Provider:"

if [ "$AWS_INSTALLED" = true ]; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

    if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" &>/dev/null; then
        check "true" "OIDC provider exists ($OIDC_ARN)"
    else
        check "false" "OIDC provider exists ($OIDC_ARN)"
    fi
else
    echo "  [SKIP] Cannot check AWS resources without AWS CLI"
fi

echo ""

# ---------------------------------------------------------------
# 4. IAM Role & Trust Policy
# ---------------------------------------------------------------
echo "IAM Role:"

ROLE_EXISTS=false
if [ "$AWS_INSTALLED" = true ]; then
    ROLE_JSON=$(aws iam get-role --role-name "$ROLE_NAME" --output json 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$ROLE_JSON" ]; then
        ROLE_EXISTS=true
    fi
    check "$ROLE_EXISTS" "Role '$ROLE_NAME' exists"

    if [ "$ROLE_EXISTS" = true ] && [ -n "$REPOSITORY" ]; then
        TRUST_DOC=$(echo "$ROLE_JSON" | python3 -c "
import sys, json, urllib.parse
data = json.load(sys.stdin)
doc = data['Role']['AssumeRolePolicyDocument']
if isinstance(doc, str):
    doc = urllib.parse.unquote(doc)
else:
    doc = json.dumps(doc)
print(doc)
" 2>/dev/null || echo "")
        if echo "$TRUST_DOC" | grep -q "$REPOSITORY"; then
            check "true" "Trust policy references repo '$REPOSITORY'"
        else
            check "false" "Trust policy references repo '$REPOSITORY'"
        fi
    fi
else
    echo "  [SKIP] Cannot check IAM role without AWS CLI"
fi

echo ""

# ---------------------------------------------------------------
# 5. Attached Policies
# ---------------------------------------------------------------
echo "Attached Policies:"

EXPECTED_POLICIES=(
    "arn:aws:iam::aws:policy/AmazonS3FullAccess"
    "arn:aws:iam::aws:policy/AWSLambda_FullAccess"
    "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
    "arn:aws:iam::aws:policy/AmazonAPIGatewayAdministrator"
    "arn:aws:iam::aws:policy/IAMFullAccess"
    "arn:aws:iam::aws:policy/AmazonEventBridgeFullAccess"
    "arn:aws:iam::aws:policy/AmazonSNSFullAccess"
    "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
    "arn:aws:iam::aws:policy/CloudWatchFullAccessV2"
)

if [ "$AWS_INSTALLED" = true ] && [ "$ROLE_EXISTS" = true ]; then
    ATTACHED_RAW=$(aws iam list-attached-role-policies --role-name "$ROLE_NAME" --query "AttachedPolicies[].PolicyArn" --output json 2>/dev/null || echo "[]")

    for policy in "${EXPECTED_POLICIES[@]}"; do
        SHORT_NAME="${policy##*/}"
        if echo "$ATTACHED_RAW" | grep -q "\"$policy\""; then
            check "true" "$SHORT_NAME"
        else
            check "false" "$SHORT_NAME"
        fi
    done

    # Warn about overly broad policies
    if echo "$ATTACHED_RAW" | grep -q "AdministratorAccess"; then
        echo "  [WARN] AdministratorAccess is still attached -- consider removing it"
    fi
else
    echo "  [SKIP] Cannot check policies (role not found or AWS CLI unavailable)"
fi

echo ""

# ---------------------------------------------------------------
# Summary
# ---------------------------------------------------------------
echo "================================================================"
echo "  Results: $PASSED passed, $FAILED failed"
echo "================================================================"
echo ""

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
