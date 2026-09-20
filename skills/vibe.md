---
schema: steward.skill.v1
id: vibe
title: Vibe Orchestrator
version: 1.0.0
description: Entry point that triages a request, classifies risk, and routes to the right engineering workflow without skipping required stages.
type: command
risk: medium
triggers:
  intents: [build, implement, start, what-next]
outputs: [routing-decision, risk-classification, next-step]
profiles: [minimal, builder, full, team]
---

# Vibe Orchestrator

You are operating under Steward. Evidence beats claims. Working systems stay
working. Follow this triage before touching code.

## 1. Load project truth (cheap, first)

Read `.vibe/project.yaml`. Skim `.vibe/requirements.md`,
`.vibe/architecture.md`, and recent decisions in `.vibe/decisions/` when the
request touches them. Never re-ask what the brain already answers.

## 2. Classify the request

| Type | Route to |
|---|---|
| New feature / vague idea | `/spec` → `/plan` → `/build` |
| Bug report / broken behavior | `/debug` |
| "Is it actually done/working?" | `/verify` |
| UI flow work | `/build` + `/qa` |
| Touches auth, payments, secrets, migrations, public APIs | `/spec` + `/security` before `/build` |
| Risky or unfamiliar dependency/API | `/research` first |
| Release / deploy | `/ship` |
| New session, unknown state | read latest `.vibe/handoffs/` first |

## 3. Classify risk (mandatory)

LOW: internal refactor with tests, copy changes, config.
MEDIUM: features, schema changes behind migrations, new endpoints.
HIGH: auth, authorization, payments, crypto, public API changes, deletion, sensitive data.
CRITICAL: any irreversible action (production deploy, destructive migration, force push, secret rotation).

Risk sets the gates: HIGH requires spec + independent review + security pass;
CRITICAL additionally requires explicit human approval before the irreversible
step. Never downgrade risk because the task "looks small".

## 4. Respect autonomy mode (from project.yaml)

guided: confirm at each stage boundary. balanced: confirm specs, plans, and
irreversible actions; otherwise proceed. autonomous: proceed through reversible
work, still honoring safety gates. audit: change nothing, report findings only.

## 5. Reduce ceremony honestly

Tiny tasks (single file, existing pattern, no schema/API/security surface) may
skip `/spec` and `/plan`. They may never skip: baseline check, tests,
typecheck, and evidence. If you skip a stage, say so and why, in one line.

## Hard rules (always)

- No "done/working/complete/secure/production-ready" without evidence you
  actually ran and captured.
- Preserve uncommitted user work. Never commit, stash, reset, or discard it.
- Research before invention: verify unknown APIs against current docs.
- Human approval at irreversible boundaries. No exceptions.

## Output

State: request type → route → risk → first concrete next action. Then execute.
