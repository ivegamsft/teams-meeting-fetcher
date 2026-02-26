# Clean Up Docs — Consolidate & Organize Documentation

## Purpose

Audit all Markdown files in the project, consolidate duplicates, standardize locations, remove stale content, and ensure a clean documentation structure.

## Instructions

### Step 1: Inventory All Markdown Files

Find every `.md` file in the project:

```bash
find . -name "*.md" -not -path "./node_modules/*" -not -path "./.venv/*" -not -path "./.git/*"
```

(On Windows: use `Get-ChildItem -Recurse -Filter *.md -Exclude node_modules,.venv,.git`)

Categorize each file:

- **Root docs**: `README.md`, `CONFIGURATION.md`, `DEPLOYMENT.md`
- **Specs**: `specs/` directory
- **Guides/how-to**: `docs/` directory
- **App READMEs**: `apps/*/README.md`, `teams-app/README.md`
- **Infra READMEs**: `iac/*/README.md`
- **Test docs**: `test/TEST_PLAN.md`, `test/README.md`
- **Script docs**: `scripts/README.md`
- **Prompt/agent files**: `.github/prompts/`, `.github/agents/`

### Step 2: Detect Duplicates & Overlaps

Compare files for overlapping content. Common candidates:

- `DEPLOYMENT.md` (root) vs `iac/aws/README.md` vs `iac/azure/README.md`
- `CONFIGURATION.md` vs `specs/setup-guide.md`
- `docs/WEBHOOK_TESTING.md` vs `specs/docs/webhook-specification.md`
- Multiple `README.md` files that repeat architecture info
- `specs/system-specification.md` vs `docs/TEAMS_BOT_SPEC.md`

For each overlap, propose:

1. Which file should be the **canonical** source
2. What content (if any) should be merged
3. Which file(s) should be deleted or replaced with a short pointer

### Step 3: Propose Target Structure

Suggest a clean documentation layout:

```
README.md                          # Project overview, quick start
CONFIGURATION.md                   # Env vars and secrets setup
docs/
  architecture.md                  # System design & architecture
  deployment-aws.md                # AWS deployment guide
  deployment-azure.md              # Azure deployment guide
  teams-bot.md                     # Teams bot specification
  teams-admin-policies.md          # Teams admin policy setup
  webhook-testing.md               # Webhook testing guide
  transcript-processing.md         # Transcript processing docs
  api-reference.md                 # API reference
specs/
  system-specification.md          # Full system spec
  infrastructure-aws-spec.md      # AWS infra spec
  infrastructure-azure-spec.md    # Azure infra spec
test/
  TEST_PLAN.md                     # Test strategy
apps/*/README.md                   # App-specific READMEs (keep lean)
iac/*/README.md                    # Infra-specific READMEs (keep lean)
scripts/README.md                  # Script usage guide
```

### Step 4: Execute (with approval)

For each proposed change, present it to me and wait for approval:

1. **Merge**: Combine content from source files into the canonical file
2. **Move**: Relocate files to proper directories
3. **Delete**: Remove truly redundant files
4. **Update links**: Fix any cross-references between docs
5. **Add pointers**: In sub-READMEs, add "See [main doc](../../docs/X.md) for details"

### Step 5: Final Audit

After changes:

1. List all remaining `.md` files with their purpose
2. Check for broken internal links (`[text](path)` where path doesn't exist)
3. Ensure `README.md` links to all major docs
4. Report what was deleted, merged, moved, and created

### Rules

- **Never delete** without showing me what will be removed.
- **Preserve** all unique content — merge, don't discard.
- Keep sub-directory READMEs short (purpose + "see main docs for more").
- Don't touch `.github/prompts/` or `.github/agents/` — those are operational.
- Don't modify `specs/` content unless clearly duplicated elsewhere.
- Use relative links between documents.
