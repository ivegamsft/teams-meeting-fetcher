# Security Recommendations for Teams Meeting Fetcher

This document provides actionable security recommendations based on the secret scanning performed on 2026-02-19.

---

## ✅ Current Security Posture: EXCELLENT

The repository already implements security best practices:
- No hardcoded secrets in codebase
- All sensitive data externalized to environment variables
- Comprehensive `.gitignore` configuration
- Clean git history with no exposed credentials
- Proper use of Azure Key Vault and AWS Secrets Manager

---

## 🔒 Enhanced Security Recommendations

### 1. Pre-commit Secret Scanning (Recommended)

Add automated secret scanning to prevent accidental commits.

#### Option A: detect-secrets (Python-based)

```bash
# Install
pip install detect-secrets

# Initialize baseline
detect-secrets scan > .secrets.baseline

# Add to .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

#### Option B: git-secrets (AWS tool)

```bash
# Install (macOS)
brew install git-secrets

# Install (Linux)
git clone https://github.com/awslabs/git-secrets
cd git-secrets
make install

# Configure for repository
cd /path/to/teams-meeting-fetche
git secrets --install
git secrets --register-aws
git secrets --add 'password.*=.*'
git secrets --add 'secret.*=.*'
git secrets --add 'api[_-]?key.*=.*'
```

#### Option C: Gitleaks (Go-based, fast)

```bash
# Install (macOS)
brew install gitleaks

# Install (Linux)
wget https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz
tar -xzf gitleaks_*.tar.gz
sudo mv gitleaks /usr/local/bin/

# Scan repository
gitleaks detect --source . --verbose

# Add to .github/workflows/security.yml for CI/CD
name: Secret Scan
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
```

---

### 2. GitHub Secret Scanning (Enable if not already enabled)

GitHub provides free secret scanning for public repositories and paid plans.

#### Enable Advanced Security:
1. Go to repository Settings → Code security and analysis
2. Enable "Secret scanning"
3. Enable "Push protection" (prevents commits with secrets)

#### Custom Patterns:
Add custom patterns for project-specific secrets:
- Navigate to Settings → Code security → Secret scanning → Custom patterns
- Add patterns for `WEBHOOK_AUTH_SECRET`, `GRAPH_CLIENT_SECRET`, etc.

---

### 3. Secret Rotation Procedures

#### Azure AD Application Secrets

**Rotation Schedule**: Every 90 days or before expiration

```bash
# Check current secret expiration
az ad app credential list --id $GRAPH_CLIENT_ID

# Generate new secret
az ad app credential reset --id $GRAPH_CLIENT_ID \
  --display-name "client-secret-$(date +%Y%m%d)" \
  --years 1

# Update Azure Key Vault
az keyvault secret set \
  --vault-name tmf-keyvault-prod \
  --name graph-client-secret \
  --value "<NEW_SECRET_VALUE>"

# Update Lambda environment variables
aws lambda update-function-configuration \
  --function-name tmf-meeting-bot \
  --environment Variables={GRAPH_CLIENT_SECRET=<NEW_VALUE>}

# Test endpoint
curl -X POST https://your-endpoint/api/webhook -H "Authorization: Bearer test"
```

#### Webhook Auth Secret

**Rotation Schedule**: Quarterly (every 90 days)

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -hex 32)

# Update Azure Key Vault
az keyvault secret set \
  --vault-name tmf-keyvault-prod \
  --name webhook-auth-secret \
  --value "$NEW_SECRET"

# Update Lambda
aws lambda update-function-configuration \
  --function-name tmf-meeting-bot \
  --environment Variables={WEBHOOK_AUTH_SECRET=$NEW_SECRET}

# Update Graph API subscription
python scripts/graph/update-webhook-subscription.py \
  --client-state "$NEW_SECRET"
```

#### AWS API Gateway Keys

**Rotation Schedule**: Every 90 days

```bash
# Create new API key
aws apigateway create-api-key \
  --name "tmf-api-key-$(date +%Y%m%d)" \
  --enabled

# Associate with usage plan
aws apigateway create-usage-plan-key \
  --usage-plan-id <PLAN_ID> \
  --key-id <NEW_KEY_ID> \
  --key-type API_KEY

# Update clients
# Update AWS_API_KEY in .env files

# Revoke old key (after verification)
aws apigateway delete-api-key --api-key <OLD_KEY_ID>
```

---

### 4. Environment Variable Validation

Add validation to ensure all required secrets are present at startup.

#### JavaScript/Node.js (Lambda)

```javascript
// Add to lambda/meeting-bot/index.js
function validateEnvironment() {
  const required = [
    'GRAPH_TENANT_ID',
    'GRAPH_CLIENT_ID',
    'GRAPH_CLIENT_SECRET',
    'WEBHOOK_AUTH_SECRET',
    'BOT_APP_ID'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate secret lengths
  if (process.env.GRAPH_CLIENT_SECRET.length < 32) {
    throw new Error('GRAPH_CLIENT_SECRET appears to be invalid (too short)');
  }
  
  if (process.env.WEBHOOK_AUTH_SECRET.length < 32) {
    throw new Error('WEBHOOK_AUTH_SECRET must be at least 32 characters');
  }
}

// Call at startup
validateEnvironment();
```

#### Python (Renewal Function)

```python
# Add to lambda/renewal-function.py
import os
import sys

def validate_environment():
    required = [
        'GRAPH_TENANT_ID',
        'GRAPH_CLIENT_ID',
        'GRAPH_CLIENT_SECRET',
        'BOT_APP_ID'
    ]
    
    missing = [key for key in required if not os.getenv(key)]
    
    if missing:
        raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
    
    # Validate secret lengths
    client_secret = os.getenv('GRAPH_CLIENT_SECRET')
    if len(client_secret) < 32:
        raise ValueError('GRAPH_CLIENT_SECRET appears to be invalid (too short)')

# Call at module load
validate_environment()
```

---

### 5. Secrets Audit Logging

Track when secrets are accessed or updated.

#### AWS CloudWatch Logs

```terraform
# Add to iac/aws/modules/meeting-bot/main.tf
resource "aws_cloudwatch_log_group" "secrets_audit" {
  name              = "/aws/lambda/${var.function_name}/secrets-audit"
  retention_in_days = 90
  
  tags = {
    Purpose = "Security Audit"
  }
}

# Add to Lambda environment
resource "aws_lambda_function" "meeting_bot" {
  environment {
    variables = {
      ENABLE_SECRETS_AUDIT = "true"
      SECRETS_LOG_GROUP    = aws_cloudwatch_log_group.secrets_audit.name
    }
  }
}
```

#### Azure Key Vault Diagnostic Settings

```bash
# Enable Key Vault logging
az monitor diagnostic-settings create \
  --name keyvault-audit \
  --resource $KEY_VAULT_ID \
  --logs '[{"category": "AuditEvent", "enabled": true}]' \
  --workspace $LOG_ANALYTICS_WORKSPACE_ID
```

---

### 6. Least Privilege Access

Ensure IAM policies and RBAC roles follow least privilege principle.

#### AWS IAM Policy (Refined)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:tmf/prod/*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalAccount": "${AWS_ACCOUNT_ID}"
        }
      }
    }
  ]
}
```

#### Azure Key Vault Access Policy

```bash
# Grant only Get permission, not List or Set
az keyvault set-policy \
  --name tmf-keyvault-prod \
  --object-id $LAMBDA_MANAGED_IDENTITY_ID \
  --secret-permissions get
```

---

### 7. Secret Scanning in CI/CD

Add automated security checks to GitHub Actions workflows.

#### Create `.github/workflows/security-scan.yml`:

```yaml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
      
      - name: Run Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Run detect-secrets
        run: |
          pip install detect-secrets
          detect-secrets scan --baseline .secrets.baseline
      
      - name: Dependency vulnerability scan
        run: |
          npm audit --production
          pip check

  code-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run CodeQL
        uses: github/codeql-action/init@v2
        with:
          languages: javascript, python
      
      - uses: github/codeql-action/analyze@v2
```

---

### 8. Developer Education Checklist

Ensure all team members follow security best practices:

- [ ] Never commit `.env` or `.env.local` files
- [ ] Always use `.env.example` as template
- [ ] Use placeholder values like `<REPLACE_ME>` in templates
- [ ] Review changes before committing (check `git diff`)
- [ ] Use `git secrets --scan` before pushing
- [ ] Store secrets in Azure Key Vault or AWS Secrets Manager
- [ ] Rotate secrets quarterly or before expiration
- [ ] Use managed identities when possible (avoid long-lived secrets)
- [ ] Enable 2FA on GitHub, Azure, and AWS accounts
- [ ] Report any suspected secret exposure immediately

---

### 9. Incident Response Plan

If a secret is accidentally committed:

#### Immediate Actions (< 1 hour)

1. **Rotate the exposed secret immediately**
   ```bash
   # Azure AD app secret
   az ad app credential reset --id $CLIENT_ID
   
   # AWS API key
   aws apigateway delete-api-key --api-key $EXPOSED_KEY_ID
   ```

2. **Update all deployments with new secret**
   ```bash
   # Update Azure Key Vault
   az keyvault secret set --vault-name tmf-kv --name secret-name --value NEW_VALUE
   
   # Update Lambda
   aws lambda update-function-configuration --function-name tmf-bot \
     --environment Variables={SECRET_NAME=NEW_VALUE}
   ```

3. **Verify services are functioning**
   ```bash
   # Test webhook endpoint
   curl -X POST https://your-endpoint/webhook -H "Authorization: Bearer NEW_SECRET"
   ```

#### Short-term Actions (< 24 hours)

4. **Remove secret from git history**
   ```bash
   # Use BFG Repo-Cleaner
   bfg --replace-text secrets.txt repo.git
   git push --force
   
   # Or use git-filter-repo
   git filter-repo --path-match .env --invert-paths
   ```

5. **Notify stakeholders**
   - Security team
   - DevOps team
   - Management (if production credentials)

6. **Review access logs**
   ```bash
   # Azure Key Vault
   az monitor activity-log list --resource-id $KEY_VAULT_ID
   
   # AWS CloudTrail
   aws cloudtrail lookup-events --lookup-attributes AttributeKey=ResourceName,AttributeValue=tmf-secret
   ```

#### Long-term Actions (< 1 week)

7. **Perform post-incident review**
   - How did the secret get committed?
   - What controls failed?
   - What can we improve?

8. **Implement preventive measures**
   - Add pre-commit hooks
   - Enable GitHub push protection
   - Add CI/CD secret scanning

9. **Update documentation**
   - Document the incident
   - Update security procedures
   - Train team on lessons learned

---

### 10. Monitoring and Alerting

Set up alerts for suspicious secret access patterns.

#### AWS CloudWatch Alarms

```bash
# Alert on unusual Lambda invocation patterns
aws cloudwatch put-metric-alarm \
  --alarm-name tmf-unusual-lambda-invocations \
  --alarm-description "Alert on unusual Lambda activity" \
  --metric-name Invocations \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 1000 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=tmf-meeting-bot
```

#### Azure Monitor Alerts

```bash
# Alert on Key Vault access anomalies
az monitor metrics alert create \
  --name keyvault-access-alert \
  --resource-group tmf-rg \
  --scopes $KEY_VAULT_ID \
  --condition "count ServiceApiHit > 1000" \
  --window-size 5m \
  --evaluation-frequency 1m
```

---

## Quick Reference

### Before Every Commit
```bash
# Check for secrets
git diff | grep -iE "(password|secret|api[_-]?key|token)" || echo "No secrets detected"

# Scan with git-secrets (if installed)
git secrets --scan

# Review changes
git status
git diff
```

### Before Every Deployment
```bash
# Verify environment variables
grep -E "^[A-Z_]+=" .env.example | cut -d= -f1 | while read var; do
  [ -z "${!var}" ] && echo "Missing: $var"
done

# Test secret access
aws secretsmanager get-secret-value --secret-id tmf/prod/graph-client-secret
az keyvault secret show --vault-name tmf-kv --name graph-client-secret
```

### Monthly Security Review
```bash
# Scan repository
gitleaks detect --source . --verbose

# Check secret expiration
az ad app credential list --id $GRAPH_CLIENT_ID --query "[].endDateTime"

# Review access logs
az monitor activity-log list --resource-group tmf-rg --start-time $(date -d '30 days ago' -Iseconds)
```

---

## Next Steps

1. ✅ Secret scan completed - no issues found
2. [ ] Choose and implement pre-commit hook (detect-secrets or git-secrets)
3. [ ] Enable GitHub Advanced Security (if available)
4. [ ] Document secret rotation procedures for your team
5. [ ] Add environment variable validation to Lambda functions
6. [ ] Set up CloudWatch/Azure Monitor alerts
7. [ ] Create secret rotation calendar (quarterly reminders)
8. [ ] Add secret scanning to CI/CD pipeline
9. [ ] Conduct security awareness training for team

---

## Additional Resources

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [Azure Key Vault Best Practices](https://docs.microsoft.com/en-us/azure/key-vault/general/best-practices)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [NIST SP 800-57: Key Management](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)

---

**Last Updated**: 2026-02-19  
**Next Review**: 2026-05-19 (quarterly)
