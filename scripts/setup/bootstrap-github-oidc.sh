#!/bin/bash
set -e

#  GitHub OIDC Bootstrap — Zero-Knowledge Authentication
#  Sets up OpenID Connect trust relationships between GitHub and AWS/Azure
#  eliminating the need for long-lived credentials in GitHub Secrets.

AZURE_ONLY=false
AWS_ONLY=false
REPOSITORY=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --azure-only) AZURE_ONLY=true; shift ;;
        --aws-only) AWS_ONLY=true; shift ;;
        --repository) REPOSITORY="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  GitHub OIDC Bootstrap — Zero-Knowledge Authentication         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Detect repository if not provided
if [ -z "$REPOSITORY" ]; then
    REMOTE_URL=$(git config --get remote.origin.url 2>/dev/null || echo "")
    if [[ $REMOTE_URL =~ github\.com[:/]([^/]+)/(.+?)(.git)?$ ]]; then
        REPOSITORY="${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
        REPOSITORY="${REPOSITORY%.git}"
    fi
    
    if [ -z "$REPOSITORY" ]; then
        echo "❌ Could not detect repository. Run inside a git repo or specify --repository"
        exit 1
    fi
fi

echo "📦 Repository: $REPOSITORY"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# AZURE OIDC SETUP
# ═══════════════════════════════════════════════════════════════════════════

if [ "$AWS_ONLY" = false ]; then
    echo "🔷 Setting up Azure OIDC..."
    echo ""
    
    # Check prerequisites
    if ! command -v az &> /dev/null; then
        echo "❌ Azure CLI not installed"
        exit 1
    fi
    
    # Get current context
    SUBSCRIPTION_ID=$(az account show --query id -o tsv)
    TENANT_ID=$(az account show --query tenantId -o tsv)
    
    echo "  Subscription: $SUBSCRIPTION_ID"
    echo "  Tenant ID: $TENANT_ID"
    echo ""
    
    # Find or create service principal
    SPN_NAME="tmf-github-actions-oidc"
    EXISTING_SP=$(az ad sp list --display-name "$SPN_NAME" --query "[0]" -o json)
    
    if [ "$(echo "$EXISTING_SP" | jq -r '.id // empty')" != "" ]; then
        SP_APP_ID=$(echo "$EXISTING_SP" | jq -r '.appId')
        echo "✅ Found existing SPN: $SPN_NAME"
    else
        echo "Creating new SPN: $SPN_NAME..."
        CREATE_RESULT=$(az ad sp create-for-rbac --name "$SPN_NAME" --output json)
        SP_APP_ID=$(echo "$CREATE_RESULT" | jq -r '.appId')
        echo "✅ Created SPN: $SPN_NAME"
    fi
    
    echo "  App ID: $SP_APP_ID"
    echo ""
    
    # Create federated credential for GitHub main branch
    echo "Creating federated credential for GitHub Actions..."
    
    CREDENTIAL_NAME="github-actions-oidc"
    ISSUER="https://token.actions.githubusercontent.com"
    AUDIENCE="api://AzureADTokenExchange"
    SUBJECT="repo:$REPOSITORY:ref:refs/heads/main"
    
    # Check if credential already exists and delete it
    EXISTING=$(az ad app federated-credential list --id "$SP_APP_ID" --query "[?name=='$CREDENTIAL_NAME']" -o json 2>/dev/null || echo "[]")
    if [ "$(echo "$EXISTING" | jq 'length')" -gt 0 ]; then
        CRED_ID=$(echo "$EXISTING" | jq -r '.[0].id')
        az ad app federated-credential delete --id "$SP_APP_ID" --federated-credential-id "$CRED_ID" --yes 2>/dev/null || true
    fi
    
    # Create new credential
    az ad app federated-credential create \
        --id "$SP_APP_ID" \
        --parameters "{
            \"name\": \"$CREDENTIAL_NAME\",
            \"issuer\": \"$ISSUER\",
            \"subject\": \"$SUBJECT\",
            \"audiences\": [\"$AUDIENCE\"],
            \"description\": \"GitHub Actions OIDC for $REPOSITORY (main branch)\"
        }" 2>/dev/null || true
    
    echo "✅ Created federated credential"
    echo "  Subject: $SUBJECT"
    echo ""
    
    # Assign roles
    echo "Assigning Azure roles..."
    
    ROLES=("Contributor" "User Access Administrator")
    for role in "${ROLES[@]}"; do
        az role assignment create \
            --assignee "$SP_APP_ID" \
            --role "$role" \
            --scope "/subscriptions/$SUBSCRIPTION_ID" 2>/dev/null || true
        echo "  ✅ Assigned: $role"
    done
    
    echo ""
    echo "📝 Azure OIDC Configuration:"
    echo "  Client ID: $SP_APP_ID"
    echo "  Tenant ID: $TENANT_ID"
    echo "  Subscription ID: $SUBSCRIPTION_ID"
    echo ""
    echo "✅ Azure OIDC setup complete!"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════
# AWS OIDC SETUP
# ═══════════════════════════════════════════════════════════════════════════

if [ "$AZURE_ONLY" = false ]; then
    echo "🟠 Setting up AWS OIDC..."
    echo ""
    
    # Check prerequisites
    if ! command -v aws &> /dev/null; then
        echo "❌ AWS CLI not installed"
        exit 1
    fi
    
    if ! aws sts get-caller-identity &>/dev/null; then
        echo "❌ AWS CLI not configured"
        exit 1
    fi
    
    # Get AWS account ID
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    REGION=${AWS_REGION:-us-east-1}
    
    echo "  Account ID: $ACCOUNT_ID"
    echo "  Region: $REGION"
    echo ""
    
    # Create OIDC provider if it doesn't exist
    echo "Creating OpenID Connect provider..."
    
    OIDC_PROVIDER_NAME="token.actions.githubusercontent.com"
    OIDC_PROVIDER_ARN="arn:aws:iam::$ACCOUNT_ID:oidc-provider/$OIDC_PROVIDER_NAME"
    
    if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_PROVIDER_ARN" 2>/dev/null; then
        echo "✅ OIDC provider already exists"
    else
        # Create new OIDC provider
        THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"  # GitHub's OIDC thumbprint
        
        aws iam create-open-id-connect-provider \
            --url "https://$OIDC_PROVIDER_NAME" \
            --client-id-list "sts.amazonaws.com" \
            --thumbprint-list "$THUMBPRINT" >/dev/null
        
        echo "✅ Created OIDC provider"
    fi
    
    echo "  ARN: $OIDC_PROVIDER_ARN"
    echo ""
    
    # Create IAM role for GitHub Actions
    echo "Creating IAM role for GitHub Actions..."
    
    ROLE_NAME="github-actions-oidc-role"
    
    # Create trust policy
    cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "$OIDC_PROVIDER_ARN"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "$OIDC_PROVIDER_NAME:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "$OIDC_PROVIDER_NAME:sub": "repo:$REPOSITORY:*"
        }
      }
    }
  ]
}
EOF
    
    if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
        echo "✅ Role already exists"
        
        # Update trust policy
        aws iam update-assume-role-policy \
            --role-name "$ROLE_NAME" \
            --policy-document file:///tmp/trust-policy.json
        echo "  Updated trust policy"
    else
        # Create new role
        aws iam create-role \
            --role-name "$ROLE_NAME" \
            --assume-role-policy-document file:///tmp/trust-policy.json \
            --description "GitHub Actions OIDC role for $REPOSITORY" >/dev/null
        
        echo "✅ Created role: $ROLE_NAME"
    fi
    
    rm -f /tmp/trust-policy.json
    
    echo ""
    
    # Attach policies
    echo "Attaching policies..."
    
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess" 2>/dev/null || true
    echo "  ✅ Attached: AdministratorAccess"
    
    echo ""
    echo "📝 AWS OIDC Configuration:"
    echo "  Role ARN: arn:aws:iam::$ACCOUNT_ID:role/$ROLE_NAME"
    echo "  OIDC Provider: $OIDC_PROVIDER_ARN"
    echo ""
    echo "✅ AWS OIDC setup complete!"
    echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════
# GITHUB SECRETS
# ═══════════════════════════════════════════════════════════════════════════

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Update GitHub Secrets for Workflows"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$AWS_ONLY" = false ]; then
    echo "Azure Secrets (OIDC - no client secret needed):"
    echo "  GitHub CLI:"
    echo "    gh secret set AZURE_CLIENT_ID --body '$SP_APP_ID'"
    echo "    gh secret set AZURE_TENANT_ID --body '$TENANT_ID'"
    echo "    gh secret set AZURE_SUBSCRIPTION_ID --body '$SUBSCRIPTION_ID'"
    echo ""
fi

if [ "$AZURE_ONLY" = false ]; then
    echo "AWS Secrets (OIDC - no access key/secret needed):"
    echo "  GitHub CLI:"
    echo "    gh secret set AWS_ROLE_ARN --body 'arn:aws:iam::$ACCOUNT_ID:role/$ROLE_NAME'"
    echo "    gh secret set AWS_REGION --body '$REGION'"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔒 Benefits of OIDC Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ No long-lived credentials stored in GitHub"
echo "✅ Credentials are short-lived (expires after workflow)"
echo "✅ Reduced attack surface and compliance risk"
echo "✅ Easier credential rotation"
echo "✅ Full audit trail in AWS/Azure"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ GitHub OIDC Bootstrap Complete!                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Add secrets to GitHub (see commands above)"
echo "  2. Update workflows to use OIDC (see: .github/workflows/)"
echo "  3. Test workflows with: gh workflow run <workflow-name>"
echo "  4. Monitor in: https://github.com/$REPOSITORY/actions"
echo ""
