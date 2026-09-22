# Steward

**The engineering operating system for AI coding agents. Evidence over claims.**

Steward turns any coding agent — Claude Code, Codex, Cursor, OpenCode, Gemini
CLI, Windsurf, Cline, Roo Code, Copilot, Aider — into an engineer that works
like one: specs before code, plans before implementation, and **evidence
before any claim of "done"**.

It is not a prompt collection and not a wrapper around one model. It is a
vendor-neutral harness:

- **14 canonical skills** (`steward.skill.v1`) covering the full lifecycle:
  triage → spec → architecture → plan → build → test → debug → verify →
  security → QA → review → docs → ship.
- **A project brain** (`.vibe/`) that survives sessions: requirements with
  stable IDs, architecture, ADRs, tasks, research notes, learned instincts.
- **A hash-chained evidence ledger** — completion claims get receipts, and
  history rewriting is detectable.
- **A manifest-driven installer** that compiles skills into each harness's
  native format, never overwrites user files, and uninstalls exactly what it
  installed.
- **Risk-classified gates** — auth/payments/deploy work requires security
  review and explicit human approval at irreversible boundaries. No autonomy
  mode overrides that.

## Why

Ask an agent to "build me a SaaS app" and hours later you get inconsistent
architecture, hallucinated APIs, missing tests, undocumented env vars, and a
confident "production ready!" with nothing behind it. Steward makes the
important engineering work **non-skippable**: agents cannot claim completion
without running the commands that prove it.

## Install

```bash
npm install -g devpilot   # historical package name; the binary is `steward`
```

or run from a checkout:

```bash
bun packages/cli/src/index.ts --help
```

## Quick start

```bash
cd your-project

# 1. Create the project brain
steward init

# 2. Compile skills into your harnesses (auto-detects which you use)
steward install            # or: steward install -t claude cursor

# 3. Check project health
steward doctor

# 4. Open your coding agent and run /vibe
#    It triages the request, classifies risk, and routes through the
#    lifecycle — refusing to skip the gates.
```

## Cross-agent memory (Phase 5)

Steward remembers decisions, conventions, and root causes across sessions
**and across harnesses** — a Codex session inherits what a Claude session
learned:

```bash
steward session open --harness claude --feature FEAT-001
# ... work happens; decisions/lessons get recorded ...
steward handoff create --from-session SESS-001 --harness claude \
  --completed "invite model + endpoints" --remaining "acceptance email flow" \
  --warnings "never log the invitation token" --memory MEM-DEC-001

# The next agent (any harness) starts here:
steward brief
steward handoff latest
steward ask "are invitations soft deleted?"

# Learned conventions are candidates until a human accepts them:
steward memory learn
steward memory accept MEM-CONV-001   # becomes binding for Guardian
```

See [docs/ENGINEERING_MEMORY.md](docs/ENGINEERING_MEMORY.md) for the
authority model, freshness, and retrieval.

## Commands

| Command | What it does |
|---|---|
| `steward init` | Create the `.vibe/` project brain (never overwrites existing truth) |
| `steward install` | Compile skills into harness artifacts (targets: `all` or adapter ids) |
| `steward doctor` | Evidence-based health report: brain, skills, manifest, drift |
| `steward status` | Brain, install, and drift status |
| `steward adapters` | List supported harnesses, capabilities, detection, confidence |
| `steward skills` | List canonical skills for a profile (`minimal\|builder\|full\|team`) |
| `steward validate` | Validate skill files against the canonical schema |
| `steward update` | Regenerate managed artifacts after upgrading or changing profile |
| `steward repair` | Restore missing/drifted managed files (idempotent) |
| `steward uninstall` | Remove Steward artifacts; brain and user edits are preserved |
| `steward memory` | Durable engineering memory: add/list/show/accept/reject/confirm/freshness/learn/lesson |
| `steward session` | Agent work sessions: open, note, close, list (cross-harness) |
| `steward handoff` | Cross-agent work handoffs: create, latest, show |
| `steward brief` | Session-start briefing: handoff, governing memory, candidates, active features |
| `steward ask` | Ask project truth a question; answers cite authority, never guess |

## Profiles

| Profile | Skills | For |
|---|---|---|
| `minimal` | vibe, spec, build, verify | Quick starts; the non-skippable core |
| `builder` | + plan, architecture, review, test, debug | Everyday feature work |
| `full` | + security, qa, docs | Solo builders shipping real products |
| `team` | everything, including `ship` | Teams with release processes |

## The skills

| Skill | Risk | One line |
|---|---|---|
| `/vibe` | medium | Triage, risk classification, routing — the entry point |
| `/spec` | medium | Vague intent → executable spec with stable REQ IDs |
| `/architecture` | medium | Boundaries, data ownership, ADRs before code |
| `/plan` | low | Spec → small tasks with verify commands, dependency-ordered |
| `/build` | medium | One task, green baseline, tests, captured evidence |
| `/test` | low | Tests that prove behavior, not coverage theater |
| `/debug` | medium | Reproduce → root cause → fix → regression proof |
| `/verify` | low | The evidence gate: claims become receipts |
| `/security` | high | Authz, secrets, injection, data-sensitivity review |
| `/qa` | low | Browser journeys, console, network, responsive states |
| `/review` | low | Hostile-but-fair second-engineer review |
| `/docs` | low | Docs are tested: every documented command runs |
| `/ship` | critical | Preflight gates, rollback plan, human approval, health evidence |

## Supported harnesses

| Harness | Artifacts | Confidence |
|---|---|---|
| Claude Code | commands + native skills | verified |
| OpenCode | commands + AGENTS.md block | verified |
| Gemini CLI | TOML commands + GEMINI.md block | verified |
| Cursor | agent-requested rules | partial |
| OpenAI Codex CLI | AGENTS.md index block | partial |
| Windsurf | `.windsurf/rules/` files | verified |
| Cline / Roo Code | rules files | partial / verified |
| GitHub Copilot | copilot-instructions.md index block | verified |
| Aider | CONVENTIONS.md index block | verified |

Confidence is evidence-backed and documented in
[docs/SUPPORT_MATRIX.md](docs/SUPPORT_MATRIX.md) — including what we have
not verified yet. Design notes: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
How the project brain works: [docs/PROJECT_BRAIN.md](docs/PROJECT_BRAIN.md).
How durable engineering memory works — decisions, learned conventions,
`steward brief` / `steward ask`, and cross-agent handoffs:
[docs/ENGINEERING_MEMORY.md](docs/ENGINEERING_MEMORY.md).
Prior art and what we took from it:
[docs/reference-analysis.md](docs/reference-analysis.md).

## Development

```bash
bun install
bun tsc -b --noEmit   # typecheck
bun vitest run        # 217 tests across core + adapters
bun packages/cli/src/index.ts --help
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding skills, adapters, and
commands.

## Status

Phase 5 — engineering memory, learned conventions, smart retrieval, and
cross-agent handoffs — is implemented and passing (217 tests, Node 18/20/22
CI). Phases 1–4 (skills/adapters/installer, workflow engine, repository
intelligence + Guardian, Security Guardian + browser QA) remain green.
Next: Phase 6 — multi-agent orchestration, MCP, and deeper cross-harness
intelligence.

## License

MIT
