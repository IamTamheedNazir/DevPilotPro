---
schema: steward.skill.v1
id: architecture
title: Intent to Accepted Architecture
version: 1.0.0
description: Turns an accepted spec into system boundaries, data ownership, and recorded decisions before implementation begins.
type: skill
risk: medium
triggers:
  intents: [design-system, structure-project, architecture-decision]
outputs: [architecture-doc, adr]
profiles: [builder, full, team]
---

# Intent to Accepted Architecture

Code encodes architecture whether or not anyone chose one. Choose it first,
on paper, cheaply.

## Process

1. Read `.vibe/requirements.md` (accepted REQ IDs only) and `.vibe/product.md`.
   Inspect the existing codebase — architecture extends what exists; it does
   not quietly replace it.
2. Decide and write down, in `.vibe/architecture.md`:
   - **Components** — the 3–8 major pieces and one line each on responsibility.
   - **Boundaries** — what may call what. Out-of-boundary calls are defects.
   - **Data ownership** — which component owns each entity; everyone else
     reads through it. No shared mutable state across boundaries.
   - **Integrations** — external services, with the assumption IDs (ASM-…)
     they depend on. Unverified integration claims stay with `/research`.
   - **Failure posture** — what happens when each dependency is down.
   - **Stack conventions** — where code lives, naming, error handling pattern.
3. Every non-obvious choice becomes a short ADR in `.vibe/decisions/`:

```
# ADR-NNN: <decision>
Status: accepted | superseded-by-ADR-…
Context:  the forces at play (link REQ/ASM ids)
Options:  at least two, with the tradeoff of each
Decision: what we chose and why, in two sentences
Consequences: what this makes easy, hard, or impossible later
```

4. Check the spec against the architecture: requirements that cannot be met
   by the proposed structure go back to `/spec` with a note. Do not implement
   around a contradiction.

## Gates

- Implementation (`/build`) may reference only requirements with accepted IDs
  and an architecture section that covers them.
- Superseding an ADR requires a new ADR; never edit history.
- HIGH/CRITICAL surfaces (auth, payments, secrets, data deletion) must name
  their security posture here — `/security` will hold the implementation to it.

## Output

Updated `.vibe/architecture.md`, new ADRs, and a one-paragraph summary of
decisions made. Then proceed to `/plan`.
