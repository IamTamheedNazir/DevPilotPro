# Harness Support Matrix

Steward compiles one canonical skill library into per-harness artifacts.
Every adapter declares its capabilities with an **evidence-backed
confidence** level:

| Confidence | Meaning |
|---|---|
| `verified` | Format confirmed against official documentation at authoring time (date noted in the adapter source) |
| `partial` | Confirmed for part of the surface claimed here; the rest is conservative |
| `unverified` | Widely documented but not yet confirmed against official docs; treat as best-effort |

**Rule:** an adapter's confidence may only rise after someone checks the
official docs *this session* and records the date in the adapter's header
comment and below. Claims without evidence are the exact failure mode
Steward exists to prevent — our own docs follow our own rules.

## Supported harnesses (10)

| Adapter | Artifacts | Memory doc | Per-skill commands | Confidence | Verified against |
|---|---|---|---|---|---|
| Claude Code (`claude`) | `.claude/commands/<id>.md`, `.claude/skills/<id>/SKILL.md` | — (native skills provide progressive disclosure) | yes | `verified` | code.claude.com skills + slash-commands docs, 2026-09-20 |
| OpenAI Codex CLI (`codex`) | managed index block | `AGENTS.md` | no (user-scope prompts deprecated upstream) | `partial` | AGENTS.md convention, 2026-09-20 |
| Cursor (`cursor`) | `.cursor/rules/steward-<id>.mdc` | — | no (agent-requested rules) | `partial` | cursor.com/docs/rules, 2026-09-20 |
| OpenCode (`opencode`) | `.opencode/commands/<id>.md` + AGENTS.md block | `AGENTS.md` | yes | `verified` | opencode.ai/docs/commands, 2026-09-20 |
| Gemini CLI (`gemini`) | `.gemini/commands/<id>.toml` + GEMINI.md block | `GEMINI.md` | yes | `verified` | Gemini CLI custom-commands docs, 2026-09-20 |
| Windsurf (`windsurf`) | `.windsurf/rules/steward-<id>.md` (`trigger: manual`) | — | rules only | `unverified` | not yet checked |
| Cline (`cline`) | `.clinerules/steward-<id>.md` | — | rules only | `unverified` | not yet checked |
| Roo Code (`roo`) | `.roo/rules/steward-<id>.md` | — | rules only | `unverified` | not yet checked |
| GitHub Copilot (`copilot`) | managed index block | `.github/copilot-instructions.md` | no | `unverified` | not yet checked |
| Aider (`aider`) | managed index block | `CONVENTIONS.md` (via `--read`) | no | `unverified` | not yet checked |

## Design invariants (all adapters)

1. **No foreign-file overwrites.** Files without Steward's provenance marker
   are never overwritten implicitly; the install blocks them and reports.
2. **Managed blocks are additive.** Host docs (AGENTS.md, GEMINI.md,
   copilot-instructions.md, CONVENTIONS.md) keep all user content; Steward
   owns only the marker-delimited block, and uninstall strips exactly that.
3. **Context economy.** Standing context cost is one index row per skill;
   skill bodies load on demand from `.vibe/skills/<id>.md`.
4. **Core stays vendor-neutral.** `@steward/core` has no harness imports;
   adapter ids are open strings at the core layer (`InstallTarget`).

## Roadmap (not yet adapters)

The following are named in the product scope but have no adapter yet:
GitHub Copilot CLI (distinct from IDE Copilot), Continue, Qwen Code,
Kimi Code, Antigravity. Adding one is a single file implementing
`detect`/`artifacts`/`indexBlock` plus a registry entry — see
CONTRIBUTING.md. Do not add an adapter without recording its real
confidence level.

## Verification history

| Date | Harness | Action |
|---|---|---|
| 2026-09-20 | claude | Verified skills + commands formats |
| 2026-09-20 | opencode | Verified commands + AGENTS.md |
| 2026-09-20 | gemini | Verified TOML commands + GEMINI.md |
| 2026-09-20 | cursor | Verified .mdc rules; slash-commands not verifiable |
| 2026-09-20 | codex | AGENTS.md confirmed; user prompts deprecated upstream |
| — | windsurf, cline, roo, copilot, aider | Not yet verified; marked `unverified` |
