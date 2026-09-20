---
schema: steward.skill.v1
id: spec
title: Intent to Specification
version: 1.0.0
description: Converts a vague request into a concise, executable specification with stable requirement IDs before any implementation starts.
type: skill
risk: medium
triggers:
  intents: [new-feature, vague-request, scope]
outputs: [requirements, assumptions, open-questions]
profiles: [minimal, builder, full, team]
---

# Intent to Specification

Never start implementation from a vague request. Convert intent into an
executable specification the user can approve, edit, or reject.

## Process

1. Read the project brain (`.vibe/`) for context: product, requirements,
   architecture, prior decisions. Do not re-ask answered questions.
2. Inspect the existing codebase enough to know what already exists (avoid
   speccing duplicates; detect conflicts with accepted architecture).
3. Produce the spec in this exact shape, keeping it short enough to read in
   two minutes:

```
# Spec: <name>

Objective:      one sentence — what and why
Users:          who uses this and what they get
Journeys:       2–4 essential user flows, end to end
MVP scope:      what is in (bulleted, testable statements)
Non-goals:      what is explicitly out
Data model:     entities and relations implied
Integrations:   external services/APIs required
Security:       authz, validation, data-sensitivity implications
UX states:      loading, empty, error, success — per journey
Deployment:     where this runs, what changes operationally
Assumptions:    ASM-001 … each with impact (high/med/low) and status
Open questions: only ones that materially change implementation
Requirements:   REQ-<AREA>-NNN, one testable statement per ID
```

4. Label every unverified claim as an assumption (ASM-###). High-impact
   assumptions become research tasks (see `/research`) — they may not silently
   become implementation.

## Question discipline

Ask at most 5 questions and only ones that materially change what gets built.
Never conduct an endless interview; propose defaults and let the user correct.

## Persisting

- Accepted spec → append requirements with IDs to `.vibe/requirements.md`
  (mark changed ones as superseded; never delete history).
- Update `.vibe/product.md` if the product story changed.

## Gates

- Implementation may not start until the user approves the spec (balanced/guided)
  or the autonomy mode explicitly authorizes proceeding.
- Requirements must be testable statements. "Fast", "nice", "robust" are not
  requirements.
