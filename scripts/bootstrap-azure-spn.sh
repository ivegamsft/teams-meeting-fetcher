#!/bin/bash
# Bootstrap script for setting up Azure Service Principal with required permissions
# Run this script with Global Administrator or Privileged Role Administrator privileges

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================"
echo "Teams Meeting Fetcher - SPN Bootstrap Script"
echo "================================================"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}❌ Azure CLI is not installed${NC}"
    echo "Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

echo -e "${GREEN}✅ Azure CLI found${NC}"

# Check if logged in
if ! az account show &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Azure${NC}"
    echo "Logging in..."
    az login
fi

# Get current subscription
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_NAME=$(az account show --query name -o tsv)

echo ""
echo "Current Azure context:"
echo "  Subscription: $SUBSCRIPTION_NAME"
echo "  Subscription ID: $SUBSCRIPTION_ID"
echo "  Tenant ID: $TENANT_ID"
echo ""

read -p "Is this the correct subscription? (yes/no): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
    echo "Please select the correct subscription with 'az account set --subscription <id>'"
    exit 1
fi

# Create Service Principal
echo ""
echo "Creating Service Principal for Terraform deployment..."
SPN_NAME="tmf-terraform-deploy-spn"

# Check if SPN already exists
EXISTING_SPN=$(az ad sp list --display-name "$SPN_NAME" --query "[0].appId" -o tsv)

if [[ -n "$EXISTING_SPN" ]]; then
    echo -e "${YELLOW}⚠️  Service Principal '$SPN_NAME' already exists${NC}"
    read -p "Do you want to reset credentials? (yes/no): " RESET
    if [[ "$RESET" == "yes" ]]; then
        APP_ID="$EXISTING_SPN"
        echo "Resetting credentials for existing SPN..."
        SPN_CREDENTIALS=$(az ad sp credential reset --id "$APP_ID" 2>&1)
    else
        echo "Using existing SPN. You'll need to provide credentials manually."
        APP_ID="$EXISTING_SPN"
        SPN_CREDENTIALS=""
    fi
else
    echo "Creating new Service Principal..."
    SPN_CREDENTIALS=$(az ad sp create-for-rbac \
        --name "$SPN_NAME" \
        --role Contributor \
        --scopes "/subscriptions/$SUBSCRIPTION_ID" \
        2>&1)
    
    APP_ID=$(echo "$SPN_CREDENTIALS" | grep -oP '"appId":\s*"\K[^"]+')
fi

if [[ -z "$APP_ID" ]]; then
    echo -e "${RED}❌ Failed to create/find Service Principal${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Service Principal created/found${NC}"
echo "   App ID: $APP_ID"

# Get Object ID
OBJECT_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)
echo "   Object ID: $OBJECT_ID"

# Wait for SPN to propagate
echo ""
echo "Waiting for SPN to propagate..."
sleep 15

# Microsoft Graph API ID
GRAPH_API_ID="00000003-0000-0000-c000-000000000000"

# Required Graph API permissions
declare -A PERMISSIONS=(
    ["Application.ReadWrite.All"]="1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9"
    ["Calendars.Read"]="798ee544-9d2d-430c-a058-570e29e34338"
    ["OnlineMeetings.Read.All"]="6931bccd-447a-43d1-b442-00a195474933"
    ["OnlineMeetings.ReadWrite"]="b8bb2037-6e08-44ac-a4ea-4674e010e2a4"
    ["Group.Read.All"]="5b567255-7703-4780-807c-7be8301ae99b"
    ["User.Read.All"]="df021288-bdef-4463-88db-98f22de89214"
    ["Domain.Read.All"]="dbb9058a-0e50-45e7-ae91-66909b422a6c"
    ["Directory.Read.All"]="7ab1d382-f21e-4acd-a863-ba3e13f7da61"
)

echo ""
echo "Adding Microsoft Graph API permissions to SPN..."

for PERM_NAME in "${!PERMISSIONS[@]}"; do
    PERM_ID="${PERMISSIONS[$PERM_NAME]}"
    echo "  Adding: $PERM_NAME"
    
    az ad app permission add \
        --id "$APP_ID" \
        --api "$GRAPH_API_ID" \
        --api-permissions "$PERM_ID=Role" 2>/dev/null || echo "    (may already exist)"
done

echo -e "${GREEN}✅ API permissions added${NC}"

# Grant admin consent
echo ""
echo "Granting admin consent for API permissions..."
echo -e "${YELLOW}⚠️  This requires Global Administrator or Privileged Role Administrator role${NC}"

az ad app permission admin-consent --id "$APP_ID" 2>&1 || {
    echo -e "${RED}❌ Failed to grant admin consent automatically${NC}"
    echo ""
    echo "Please grant admin consent manually:"
    echo "1. Go to: https://portal.azure.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Permissions/objectId/$OBJECT_ID/appId/$APP_ID"
    echo "2. Click 'Grant admin consent for [Your Tenant]'"
    echo ""
    read -p "Press Enter after granting consent..."
}

echo -e "${GREEN}✅ Admin consent granted${NC}"

# Assign Azure RBAC roles
echo ""
echo "Assigning Azure RBAC roles..."

# Contributor role (should already exist from create-for-rbac)
echo "  ✅ Contributor (already assigned)"

# User Access Administrator (needed for RBAC assignments in Terraform)
echo "  Assigning: User Access Administrator"
az role assignment create \
    --assignee "$APP_ID" \
    --role "User Access Administrator" \
    --scope "/subscriptions/$SUBSCRIPTION_ID" 2>/dev/null || echo "    (may already exist)"

echo -e "${GREEN}✅ Azure RBAC roles assigned${NC}"

# Output credentials
echo ""
echo "================================================"
echo "Service Principal Setup Complete! 🎉"
echo "================================================"
echo ""

if [[ -n "$SPN_CREDENTIALS" ]]; then
    CLIENT_SECRET=$(echo "$SPN_CREDENTIALS" | grep -oP '"password":\s*"\K[^"]+' || echo "$SPN_CREDENTIALS" | grep -oP '"clientSecret":\s*"\K[^"]+')
    
    echo "Save these credentials securely:"
    echo ""
    echo "azure_subscription_id = \"$SUBSCRIPTION_ID\""
    echo "azure_tenant_id       = \"$TENANT_ID\""
    echo "azure_client_id       = \"$APP_ID\""
    echo "azure_client_secret   = \"$CLIENT_SECRET\""
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Save the client_secret now - it won't be shown again!${NC}"
    echo ""
    
    # Optionally write to terraform.tfvars
    read -p "Write these values to iac/azure/terraform.tfvars? (yes/no): " WRITE_TFVARS
    if [[ "$WRITE_TFVARS" == "yes" ]]; then
        cat > ../../iac/azure/terraform.tfvars <<EOF
# Generated by bootstrap script on $(date)
# NEVER commit this file to version control!

environment      = "dev"
azure_region     = "eastus"
region_short     = "eus"

azure_subscription_id = "$SUBSCRIPTION_ID"
azure_tenant_id       = "$TENANT_ID"
azure_client_id       = "$APP_ID"
azure_client_secret   = "$CLIENT_SECRET"

# Test User Configuration
create_test_user       = true
test_user_password     = "$(openssl rand -base64 24 | tr -d '=/+' | head -c 16)ComplexPass123!"
EOF
        echo -e "${GREEN}✅ Credentials written to iac/azure/terraform.tfvars${NC}"
        echo -e "${YELLOW}⚠️  Remember to add terraform.tfvars to .gitignore!${NC}"
    fi
else
    echo "Credentials not available (using existing SPN)"
    echo "Please retrieve credentials from Key Vault or reset them if needed"
fi

echo ""
echo "Next steps:"
echo "1. cd iac/azure"
echo "2. terraform init"
echo "3. terraform plan"
echo "4. terraform apply"
echo ""
