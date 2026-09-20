---
schema: steward.skill.v1
id: research
title: Research Before Invention
version: 1.0.0
description: Verifies framework APIs, SDK behavior, and external dependencies against authoritative sources instead of inventing them.
type: skill
risk: low
triggers:
  intents: [how-does-x-work, verify-api, check-version]
outputs: [research-note, labeled-facts]
profiles: [builder, full, team]
---

# Research Before Invention

Never invent an API because it "sounds correct". Verify against authoritative
sources whenever tooling allows; otherwise label the uncertainty explicitly.

## When this skill is mandatory

- Using a library/framework API you have not verified in this project's exact
  version.
- Integrating an external API (auth, payments, email, storage).
- Security-relevant behavior (token lifetimes, CORS, password hashing).
- Any assumption in `.vibe/` marked `RESEARCH REQUIRED`.

## Source hierarchy (best first)

1. Official documentation for the exact major version in use
2. Official repositories/changelogs
3. Specifications (RFCs, OpenAPI, JSON Schema)
4. Trusted secondary sources (clearly dated)

Check the version actually installed (package.json / lockfile) — docs for a
different major version are not evidence for this project.

## Confidence labels (mandatory on every claim)

- FACT — verified against a cited source this session
- INFERENCE — derived from facts; show the derivation
- ASSUMPTION — unverified; needs research
- UNVERIFIED — could not confirm; state what would confirm it

## Output

One research note per topic in `.vibe/research/YYYY-MM-DD-<topic>.md`:

```markdown
# <topic>
Component affected: <module/feature>
Retrieved: <date>   Source: <url>   Version: <x.y.z>
## Findings
- [FACT] … (source line/quote)
- [ASSUMPTION] … impact=high → blocks <requirement ID>
## Conclusions for this project
```

Update the related ASM-### entries in the spec. High-impact assumptions that
stay unverified block production-readiness claims (see `/verify`).

## Rules

- Respect site rules and access controls. Prefer official APIs/docs. No
  anti-bot circumvention.
- One page may answer one question; stop when you can act, not when you have
  read everything.
