# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture & design | Keaton | System design, component boundaries, API contracts, multi-cloud strategy |
| Code review | Keaton | Review PRs, check quality, approve/reject changes |
| Scope & priorities | Keaton | What to build next, trade-offs, technical decisions |
| Node.js/TypeScript backend | McManus | Express routes, webhook handlers, Graph API integration, transcription polling |
| Database & storage | McManus | SQLite schemas, DynamoDB tables, data access patterns |
| Python scripts | McManus | Graph API management scripts, workflow notebooks |
| Management UI | McManus | HTML/JS frontend, admin pages |
| Terraform / IaC | Fenster | AWS Lambda config, Azure Container Apps, networking, IAM roles |
| Docker & containers | Fenster | Dockerfiles, container builds, image management |
| CI/CD pipelines | Fenster | GitHub Actions workflows, deployment automation |
| Cloud configuration | Fenster | AWS settings, Azure settings, environment variables, secrets |
| Teams platform architecture | Kobayashi | Teams app design, manifest strategy, Graph API for Teams, meeting extensibility, Bot Framework architecture |
| Teams app implementation | Verbal | Teams JS SDK, Bot Framework code, Adaptive Cards, Teams manifest, Teams auth/SSO, Graph API calls for Teams |
| Testing (unit/integration) | Hockney | Jest tests, integration tests, edge cases, test coverage |
| Quality assurance | Hockney | Bug verification, regression checks, test strategy |
| End-to-end testing | Redfoot | Full-stack E2E tests, webhook flow tests, pipeline validation, deployment verification, API endpoint tests |
| Documentation | Edie | README files, setup guides, deployment docs, API docs, architecture diagrams, onboarding docs, doc accuracy audits |
| Async issue work (bugs, tests, small features) | @copilot 🤖 | Well-defined tasks matching capability profile |
| Session logging | Scribe | Automatic — never needs routing |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, evaluate @copilot fit, assign `squad:{member}` label | Keaton |
| `squad:keaton` | Architecture decisions, design reviews, complex analysis | Keaton |
| `squad:mcmanus` | Backend implementation, API work, database changes | McManus |
| `squad:fenster` | Infrastructure, deployment, CI/CD, Docker | Fenster |
| `squad:hockney` | Test writing, test fixes, quality analysis | Hockney |
| `squad:kobayashi` | Teams platform architecture, manifest design, Graph API for Teams strategy | Kobayashi |
| `squad:verbal` | Teams app implementation, Bot Framework, Adaptive Cards, Teams SDK | Verbal |
| `squad:redfoot` | End-to-end tests, flow tests, deployment verification | Redfoot |
| `squad:edie` | Documentation, README updates, setup guides, API docs, doc accuracy audits | Edie |
| `squad:copilot` | Assign to @copilot for autonomous work (if enabled) | @copilot 🤖 |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, **Keaton** (Lead) triages it — analyzing content, evaluating @copilot's capability profile, assigning the right `squad:{member}` label, and commenting with triage notes.
2. **@copilot evaluation:** Keaton checks if the issue matches @copilot's capability profile (🟢 good fit / 🟡 needs review / 🔴 not suitable). If it's a good fit, Keaton may route to `squad:copilot` instead of a squad member.
3. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
4. When `squad:copilot` is applied and auto-assign is enabled, `@copilot` is assigned on the issue and picks it up autonomously.
5. Members can reassign by removing their label and adding another member's label.
6. The `squad` label is the "inbox" — untriaged issues waiting for Keaton's review.

### Lead Triage Guidance for @copilot

When triaging, Keaton should ask:

1. **Is this well-defined?** Clear title, reproduction steps or acceptance criteria, bounded scope → likely 🟢
2. **Does it follow existing patterns?** Adding a test, fixing a known bug, updating a dependency → likely 🟢
3. **Does it need design judgment?** Architecture, API design, UX decisions → likely 🔴
4. **Is it security-sensitive?** Auth, encryption, access control → always 🔴
5. **Is it medium complexity with specs?** Feature with clear requirements, refactoring with tests → likely 🟡

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. Keaton handles all `squad` (base label) triage.
8. **@copilot routing** — when evaluating issues, check @copilot's capability profile in `team.md`. Route 🟢 good-fit tasks to `squad:copilot`. Flag 🟡 needs-review tasks for PR review. Keep 🔴 not-suitable tasks with squad members.
