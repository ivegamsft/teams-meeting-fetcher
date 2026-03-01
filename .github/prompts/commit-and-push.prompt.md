# Commit & Push — Safe Check-in Assistant

## Purpose

Help you commit and push changes safely by auditing for secrets, validating `.gitignore`, and breaking large changesets into logical commits following the Teams Meeting Fetcher project standards.

## ⚠️ CRITICAL RULES

### Secrets & Credentials

- **NEVER** commit credentials, API keys, client secrets, passwords, connection strings, private keys, or tokens
- **NEVER** commit hardcoded deployment-specific identifiers:
  - Tenant IDs (UUID format, e.g., `<TENANT_UUID>`)
  - App IDs (UUID format, e.g., `<APP_UUID>`)
  - Resource names (Event Hub: `tmf-ehns-*`, `tmf-eh-*`)
  - Email addresses or user identifiers (e.g., `user@<YOUR_TENANT_DOMAIN>`, `<TEST_USER_ALIAS>@<YOUR_TENANT_DOMAIN>`)
- **ALWAYS** use placeholders instead: `<YOUR_TENANT_ID>`, `<YOUR_GRAPH_APP_ID>`, `<EVENT_HUB_NAMESPACE>`, `user1@<YOUR_TENANT_DOMAIN>`
- **NEVER** log secrets or credentials to `.squad/` files — these are committed and searchable

### Gitignore & Sensitive Files

- **NEVER** commit: `.env`, `.env.local`, `.env.*.azure`, `*.tfvars` (only `*.tfvars.example` allowed)
- **NEVER** commit: `*.pem`, `*.key`, `*secret*`, `*credentials*`, `*api_key*`, `*access_token*`
- **NEVER** commit: `node_modules/`, `.terraform/`, `__pycache__/`, `.venv/`, `coverage/`, `.aws/`, `.azure/`
- **VERIFY** `.gitignore` is up-to-date before staging files

### Commit Message Standards

- **NO emojis in commit messages** (Windows PowerShell has encoding issues with emoji)
- Use **conventional commits** format:
  - `feat(scope):` New features
  - `fix(scope):` Bug fixes
  - `docs(scope):` Documentation updates (e.g., `docs(sanitize):` for placeholder updates)
  - `chore(scope):` Build updates, configs, dependencies (e.g., `chore(squad):` for squad memory, `chore(github):` for GitHub configs)
  - `test(scope):` Test additions/changes
  - `infra(scope):` Infrastructure/deployment changes (always use `iac/` root, never `iac/aws/` or `iac/azure/`)
  - `refactor(scope):` Code refactoring without feature/fix changes
- Scope should be: `squad`, `github`, `graph`, `lambda`, `azure`, `aws`, `teams`, `sanitize`, etc.
- Examples:
  - `docs(sanitize): replace deployment-specific identifiers with placeholders`
  - `chore(squad): update agent charter and memory`
  - `infra(terraform): update Event Hub configuration`
  - `fix(lambda): handle missing event properties`

### PowerShell Terminal Execution

- **NEVER** pipe PowerShell output in terminal commands: NO `| Out-Null`, `2>&1 | Out-Null`, `| Out-String`
- Piping causes parsing issues — use direct commands only
- Exception: Piping is OK in multi-line `.ps1` scripts, just NOT in single terminal commands
- Use backticks (`` ` ``) for line continuation, not backslashes
- Quote variables properly: `"$variable"` not `$variable`

### Project-Specific Validations

- AWS profile for this project: `tmf-dev` (us-east-1)
- **NEVER** deploy from `iac/aws/` or `iac/azure/` subfolders — ALWAYS use `iac/` root
- Before ANY Azure operations: verify tenant ID with `az account show --query "tenantId"`
  - Expected: `<YOUR_TENANT_ID>` (read from .env `GRAPH_TENANT_ID`)
  - STOP if tenant doesn't match — ask user to log into correct tenant

## Instructions

### Step 1: Pre-flight Checks

1. Run `git status` and `git diff --stat` to see what has changed
2. Verify `.gitignore` covers all sensitive patterns (see "Gitignore & Sensitive Files" above)
3. Check that no new file types or directories that look sensitive are being committed
4. If anything questionable is staged, **STOP and warn before continuing**

### Step 2: Secret Scanning (Enhanced)

Scan all staged/changed files for patterns:

```
git diff --cached --name-only
git diff --name-only
```

Search for and flag:

- **Credentials**: API keys, tokens, passwords, connection strings, client secrets
- **AWS identifiers**: Access keys (`AKIA...`), secret keys, hardcoded AWS resource ARNs/names
- **Azure identifiers**: Client secrets, hardcoded tenant IDs (UUIDs), app IDs, subscription IDs, resource names
- **Deployment-specific values**:
  - Event Hub names/namespaces (e.g., `tmf-ehns-*`, `tmf-eh-*`)
  - Email addresses/domains (e.g., `<YOUR_TENANT_DOMAIN>`, `<TEST_USER_ALIAS>@<YOUR_TENANT_DOMAIN>`)
  - Group/subscription IDs (UUIDs that aren't in comments explaining what to replace)
- **URLs with embedded auth**: hardcoded webhooks, connection strings with credentials
- **Private keys or certificates**: `.pem`, `.key`, PEM content, base64-encoded secrets

If suspicious patterns found: **LIST the file, line number(s), and content snippet**, then ask me to confirm remediation before proceeding.

### Step 3: Break Down Large Changesets

If **8+ files** changed, or changes span multiple concerns:

1. **Group changes by logical area**:
   - **docs**: `*.md`, `docs/`, `specs/` — documentation updates
   - **squad**: `.squad/agents/`, `.squad/decisions.md` — memory and logs
   - **github**: `.github/prompts/`, `.github/copilot-instructions.md` — GitHub guidance
   - **app**: `apps/`, `lambda/`, handler code — application logic
   - **infra**: `iac/` — infrastructure/Terraform **ONLY FROM ROOT**
   - **test**: `test/`, `*.test.js` — test code
   - **config**: `.vscode/`, `jest.config.js`, `package.json` — build/tool configuration
   - **scripts**: `scripts/` — automation scripts

2. **Propose a commit plan**:

   ```
   [Group 1] docs/guides: {count} files → "docs(sanitize): replace deployment identifiers with placeholders"
   [Group 2] .github configs: {count} files → "chore(github): update prompts and instructions"
   [Group 3] .squad memory: {count} files → "chore(squad): update agent charters and decisions"
   ```

3. **Ask for approval** before executing commits

### Step 4: Execute — Stage, Commit, Verify, Push

For each logical group:

1. **Stage files**: `git add <file1> <file2> ... <fileN>`
2. **Verify staged**: `git diff --cached --name-only` (show exactly what's staged)
3. **Commit**: `git commit -m "TYPE(scope): description"` (no emojis)
4. **Repeat** for next group

After all commits:

1. Review: `git log --oneline -10` to show all new commits
2. Verify clean working tree: `git status --short`
3. Push: `git push` (to origin `main` or current branch)
4. If push fails (behind remote), suggest `git pull --rebase && git push`

### Step 5: Post-Push

- Confirm success with final `git status` and `git log --oneline -5`
- Note any untracked files that weren't committed (for user awareness)
- Point out significant changes or decisions recorded in commit messages

## Guidelines

- **Always show staged files** before committing — use `git diff --cached --name-only`
- **One logical concern per commit** — don't mix docs, code, and infra in one commit
- **Commit messages are narrative** — they explain WHY and WHAT, not HOW
- **Squad files are append-only** — never edit historical entries, only add new ones
- **Deployment-specific values use placeholders** — this keeps the repository reusable for new environments
