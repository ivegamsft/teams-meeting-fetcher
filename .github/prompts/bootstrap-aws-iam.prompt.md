# Bootstrap AWS IAM for Local Development

**Purpose**: Create AWS IAM users and roles for local development and CI/CD deployments.

**When to use**: Initial AWS account setup, new developer onboarding, or IAM credential rotation.

**Prerequisites**:

- AWS account with IAM permissions
- AWS CLI installed (`aws --version`)
- aws-vault or similar credential manager (recommended)
- AWS MFA device configured (for account root)

---

## Step 1: Verify AWS Account Access

```bash
# Confirm you're logged in to the correct AWS account
aws sts get-caller-identity

# Output should show:
# {
#   "UserId": "...",
#   "Account": "123456789012",
#   "Arn": "arn:aws:iam::123456789012:user/your-name"
# }

# Save your Account ID for later
export AWS_ACCOUNT_ID="123456789012"
```

---

## Step 2: Create IAM User for Local Development

```bash
# Create IAM user for local development
aws iam create-user --user-name teams-meeting-fetcher-dev

# Verify user created
aws iam get-user --user-name teams-meeting-fetcher-dev

# Add user tags for organization
aws iam tag-user \
  --user-name teams-meeting-fetcher-dev \
  --tags Key=Environment,Value=dev Key=Project,Value=teams-meeting-fetcher Key=Team,Value=platform
```

---

## Step 3: Create Developer Policy

```bash
# Create inline policy for developer access
# This grants permissions needed to deploy and manage the application

aws iam put-user-policy --user-name teams-meeting-fetcher-dev \
  --policy-name "teams-meeting-fetcher-dev-policy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "lambda:*",
          "apigateway:*",
          "s3:*",
          "dynamodb:*",
          "sns:*",
          "cloudwatch:*",
          "logs:*",
          "iam:PassRole",
          "iam:GetRole",
          "iam:CreateRole",
          "iam:UpdateAssumeRolePolicy",
          "iam:PutRolePolicy",
          "iam:GetRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:ListRolePolicies"
        ],
        "Resource": "*",
        "Condition": {
          "StringLike": {
            "aws:RequestedRegion": "us-east-1"
          }
        }
      },
      {
        "Effect": "Allow",
        "Action": "iam:PassRole",
        "Resource": "arn:aws:iam::${aws:username}/*",
        "Condition": {
          "StringEquals": {
            "iam:PassedToService": [
              "lambda.amazonaws.com",
              "apigateway.amazonaws.com"
            ]
          }
        }
      }
    ]
  }'

# Attach AdministratorAccess temporarily for initial setup (not recommended for production)
# aws iam attach-user-policy \
#   --user-name teams-meeting-fetcher-dev \
#   --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

---

## Step 4: Create Access Key for Developer

```bash
# Create access key for developer (used for local development and CI/CD)
aws iam create-access-key --user-name teams-meeting-fetcher-dev

# Output will show:
# {
#   "AccessKey": {
#     "UserName": "teams-meeting-fetcher-dev",
#     "AccessKeyId": "AKIA...",
#     "SecretAccessKey": "...",
#     "Status": "Active",
#     "CreateDate": "..."
#   }
# }

# ⚠️ Save AccessKeyId and SecretAccessKey immediately
# SecretAccessKey shown only once

export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
```

---

## Step 5: Configure AWS Profile Locally

```bash
# Configure AWS profile for tmf-dev
aws configure --profile tmf-dev

# When prompted:
# AWS Access Key ID: <PASTE_ACCESS_KEY_ID>
# AWS Secret Access Key: <PASTE_SECRET_ACCESS_KEY>
# Default region name: us-east-1
# Default output format: json

# Verify profile configured
aws configure list --profile tmf-dev

# Test credentials
aws sts get-caller-identity --profile tmf-dev
```

---

## Step 6: Store Credentials in Environment File

```bash
# Update .env.local with AWS credentials
cat >> .env.local << 'EOF'

# AWS Configuration
AWS_PROFILE=tmf-dev
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<ACCESS_KEY_FROM_STEP_4>
AWS_SECRET_ACCESS_KEY=<SECRET_KEY_FROM_STEP_4>
AWS_ACCOUNT_ID=<YOUR_ACCOUNT_ID>
EOF

# Verify credentials are set
grep AWS .env.local | head -5
```

**Important**: Never commit `.env.local` to git.

---

## Step 7: Create IAM Role for Lambda Execution

```bash
# Create assume role policy document for Lambda
cat > /tmp/lambda-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create Lambda execution role
aws iam create-role \
  --role-name teams-meeting-fetcher-lambda-role \
  --assume-role-policy-document file:///tmp/lambda-trust-policy.json

# Attach basic Lambda execution policy
aws iam attach-role-policy \
  --role-name teams-meeting-fetcher-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# Attach DynamoDB policy (if using DynamoDB)
aws iam attach-role-policy \
  --role-name teams-meeting-fetcher-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

# Attach SNS policy (if using SNS)
aws iam attach-role-policy \
  --role-name teams-meeting-fetcher-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSNSFullAccess

# Get role ARN for Terraform
aws iam get-role --role-name teams-meeting-fetcher-lambda-role --query "Role.Arn"
```

---

## Step 8: Create S3 Bucket for Lambda Deployments

```bash
# Create S3 bucket for storing Lambda deployment packages
aws s3 mb s3://teams-meeting-fetcher-deployments-${AWS_ACCOUNT_ID} \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket teams-meeting-fetcher-deployments-${AWS_ACCOUNT_ID} \
  --versioning-configuration Status=Enabled

# Block public access
aws s3api put-public-access-block \
  --bucket teams-meeting-fetcher-deployments-${AWS_ACCOUNT_ID} \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Add lifecycle rule to delete old versions (keep 5 versions)
aws s3api put-bucket-lifecycle-configuration \
  --bucket teams-meeting-fetcher-deployments-${AWS_ACCOUNT_ID} \
  --lifecycle-configuration 'Rules=[{Id=DeleteOldVersions,Status=Enabled,NoncurrentVersionExpiration={NoncurrentDays=30}}]'

# Verify bucket created
aws s3 ls | grep teams-meeting-fetcher-deployments
```

---

## Step 9: Create DynamoDB Table for State (if needed)

```bash
# Create DynamoDB table for Terraform remote state lock
aws dynamodb create-table \
  --table-name teams-meeting-fetcher-terraform-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Verify table created
aws dynamodb describe-table \
  --table-name teams-meeting-fetcher-terraform-lock
```

---

## Step 10: Create CloudWatch Log Group

```bash
# Create log group for Lambda logs
aws logs create-log-group \
  --log-group-name /aws/lambda/teams-meeting-fetcher

# Set retention to 30 days
aws logs put-retention-policy \
  --log-group-name /aws/lambda/teams-meeting-fetcher \
  --retention-in-days 30

# Verify log group created
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/teams-meeting-fetcher
```

---

## Step 11: Set Up MFA (Multi-Factor Authentication)

```bash
# Register virtual MFA device for added security
aws iam enable-mfa-device \
  --user-name teams-meeting-fetcher-dev \
  --serial-number arn:aws:iam::${AWS_ACCOUNT_ID}:mfa/teams-meeting-fetcher-dev

# When prompted, enter two consecutive codes from your MFA device

# Verify MFA enabled
aws iam list-mfa-devices --user-name teams-meeting-fetcher-dev
```

---

## Step 12: Use aws-vault for Credential Management (Recommended)

```bash
# Install aws-vault (macOS: brew install aws-vault)
aws-vault --version

# Add credentials to aws-vault (encrypted storage)
aws-vault add tmf-dev
# When prompted, enter Access Key ID and Secret Access Key

# Use aws-vault to run commands
aws-vault exec tmf-dev -- aws s3 ls

# Or set AWS_VAULT environment variable
export AWS_VAULT=tmf-dev

# List stored profiles
aws-vault list
```

---

## Step 13: Test Terraform with AWS Credentials

```bash
# Navigate to AWS IaC directory
cd iac/aws

# Initialize Terraform
terraform init

# Validate configuration
terraform validate

# Plan deployment
terraform plan -out=tfplan

# Verify no errors
echo "Terraform plan successful ✓"

# Back to root
cd ../..
```

---

## Step 14: Create GitHub Secrets for CI/CD

```bash
# Set AWS credentials as GitHub secrets (already covered in bootstrap-gh-workflow-creds.prompt.md)
gh secret set AWS_ACCESS_KEY_ID --body "<ACCESS_KEY_ID>"
gh secret set AWS_SECRET_ACCESS_KEY --body "<SECRET_ACCESS_KEY>"

# Verify secrets set
gh secret list | grep AWS
```

---

## Step 15: Set Up Credential Rotation

```bash
# Create calendar reminder for credential rotation (every 90 days)

# Steps for rotation:
# 1. Create new access key:
aws iam create-access-key --user-name teams-meeting-fetcher-dev

# 2. Update local configuration:
aws configure --profile tmf-dev  # Update with new credentials

# 3. Update GitHub secrets:
gh secret set AWS_ACCESS_KEY_ID --body "<NEW_KEY>"
gh secret set AWS_SECRET_ACCESS_KEY --body "<NEW_SECRET>"

# 4. Verify new credentials work:
aws sts get-caller-identity --profile tmf-dev

# 5. Delete old access key:
aws iam delete-access-key \
  --user-name teams-meeting-fetcher-dev \
  --access-key-id <OLD_KEY_ID>

# 6. Verify old key deleted
aws iam list-access-keys --user-name teams-meeting-fetcher-dev
```

---

## AWS Resource Summary

After completing all steps, you'll have created:

| Resource             | Name                                 | Purpose                               |
| -------------------- | ------------------------------------ | ------------------------------------- |
| IAM User             | teams-meeting-fetcher-dev            | Local development access              |
| IAM Policy           | teams-meeting-fetcher-dev-policy     | Lambda, S3, DynamoDB, SNS permissions |
| IAM Role             | teams-meeting-fetcher-lambda-role    | Lambda execution role                 |
| S3 Bucket            | teams-meeting-fetcher-deployments-\* | Lambda deployment packages            |
| DynamoDB Table       | teams-meeting-fetcher-terraform-lock | Terraform state lock                  |
| CloudWatch Log Group | /aws/lambda/teams-meeting-fetcher    | Lambda logs                           |

---

## Environment Variables

Update `.env.local` with:

```bash
AWS_PROFILE=tmf-dev
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

---

## Troubleshooting

### "Access Denied" when running terraform

```bash
# Verify IAM user has required permissions
aws iam list-attached-user-policies \
  --user-name teams-meeting-fetcher-dev

# Verify policy document allows the required actions
aws iam get-user-policy \
  --user-name teams-meeting-fetcher-dev \
  --policy-name teams-meeting-fetcher-dev-policy
```

### "No credentials could be found"

```bash
# Verify AWS CLI is configured
aws configure --profile tmf-dev list

# Verify credentials in ~/.aws/credentials
cat ~/.aws/credentials | grep -A 2 tmf-dev

# Verify environment variables
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY

# Set profile explicitly
export AWS_PROFILE=tmf-dev
aws sts get-caller-identity
```

### "MFA required" error

```bash
# Use aws-vault to handle MFA automatically
aws-vault exec tmf-dev -- aws s3 ls

# Or provide MFA token manually
aws sts get-session-token \
  --serial-number arn:aws:iam::${AWS_ACCOUNT_ID}:mfa/teams-meeting-fetcher-dev \
  --token-code <6-DIGIT-CODE>
```

### "S3 bucket already exists"

```bash
# Bucket name must be globally unique
# Use different bucket name with timestamp or account ID
aws s3 mb s3://teams-meeting-fetcher-deployments-${AWS_ACCOUNT_ID}-$(date +%s)
```

### "Cannot attach policy to role"

```bash
# Verify role exists
aws iam get-role --role-name teams-meeting-fetcher-lambda-role

# Verify policy ARN is correct
aws iam list-policies | grep Lambda

# Use correct policy ARN format
aws iam attach-role-policy \
  --role-name teams-meeting-fetcher-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
```

---

## Verification Checklist

- [ ] AWS account access verified
- [ ] IAM user `teams-meeting-fetcher-dev` created
- [ ] Developer policy attached
- [ ] Access key created and saved securely
- [ ] AWS profile `tmf-dev` configured locally
- [ ] Credentials testing passes (sts get-caller-identity)
- [ ] Lambda execution role created
- [ ] S3 deployment bucket created
- [ ] DynamoDB state lock table created
- [ ] CloudWatch log group created
- [ ] MFA enabled (recommended)
- [ ] aws-vault installed and configured (recommended)
- [ ] Terraform validation passes
- [ ] GitHub secrets configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
- [ ] Credential rotation schedule documented

---

## Next Steps

1. **Deploy Infrastructure**: Run `cd iac/aws && terraform apply`
2. **Deploy Infrastructure and Lambda**: Run deployment workflow or `terraform apply` from `iac/` directory
3. **Configure Monitoring**: Set up CloudWatch alarms and dashboards
4. **Set Up Backups**: Enable S3 versioning and snapshot Lambda code
5. **Document Access**: Create runbook for new developer onboarding
6. **Schedule Rotation**: Set calendar reminder for 90-day credential rotation
