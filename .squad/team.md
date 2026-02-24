# Team Roster

> Teams Meeting Fetcher — Microsoft Graph webhook processing, transcription polling, and multi-cloud deployment (AWS Lambda + Azure Container Apps).

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. Does not generate domain artifacts. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Keaton | Lead | `.squad/agents/keaton/charter.md` | ✅ Active |
| McManus | Backend Dev | `.squad/agents/mcmanus/charter.md` | ✅ Active |
| Fenster | DevOps/Infra | `.squad/agents/fenster/charter.md` | ✅ Active |
| Hockney | Tester | `.squad/agents/hockney/charter.md` | ✅ Active |
| Kobayashi | Teams Architect | `.squad/agents/kobayashi/charter.md` | ✅ Active |
| Verbal | Teams Developer | `.squad/agents/verbal/charter.md` | ✅ Active |
| Redfoot | E2E Tester | `.squad/agents/redfoot/charter.md` | ✅ Active |
| Edie | Documentation Specialist | `.squad/agents/edie/charter.md` | ✅ Active |
| Scribe | Session Logger | `.squad/agents/scribe/charter.md` | 📋 Silent |
| Ralph | Work Monitor | — | 🔄 Monitor |

## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

## Project Context

- **Owner:** ivegamsft
- **Stack:** Node.js/TypeScript (Express), Python, Terraform, AWS Lambda, Azure Container Apps, Microsoft Graph API, SQLite, DynamoDB, Docker, Jest, GitHub Actions
- **Description:** Webhook-driven service that fetches Microsoft Teams meeting transcriptions via Graph API, with multi-cloud infrastructure and a management UI.
- **Created:** 2026-02-24
