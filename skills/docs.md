---
schema: steward.skill.v1
id: docs
title: Documentation That Runs
version: 1.0.0
description: Updates README, env docs, and run instructions, verifying every command by executing it — docs are tested like code.
type: skill
risk: low
triggers:
  intents: [write-docs, update-readme, document]
outputs: [documentation, verified-commands]
profiles: [builder, full, team]
---

# Documentation That Runs

A README that lies is worse than no README. Every documented command must
have been run, from a clean state, by someone.

## Process

1. **Update in this order** (each depends on the previous being true):
   - `.env.example` — every environment variable the code reads, with a
     safe placeholder and one line on where the value comes from. Compare
     against actual `process.env`/config reads in the diff.
   - **Run instructions** — install, configure, run, test. Then run them
     yourself in a fresh checkout/clone or clean directory and fix what
     breaks. Copy the real output.
   - **README** — what it is, the 60-second quickstart, architecture
     summary matching `.vibe/architecture.md`, test/verify commands,
     known limitations. No claims the `/verify` gate would reject.
   - **API/usage docs** — generated from the code where possible;
     handwritten sections re-checked against signatures.
2. **Every command in docs is verified**: run it, capture output, fix doc
   or code, rerun. A command that only works with undocumented setup is a
   bug — fix the setup or document it.
3. **Record evidence** per `/verify`: doc-verification is evidence like any
   other (command + exit code + date).
4. **Keep the brain honest**: docs contradicting `.vibe/product.md` or
   accepted ADRs mean one of them is stale — fix the stale one, note the
   supersession, never delete history.

## Hard rules

- Never document a flag/variable/command you have not exercised.
- No aspirational features in the README; unshipped work belongs in a
  roadmap section marked as such.
- Keep docs in the repo next to the code they describe.

## Output

Changed docs, the verification transcript for each documented command, and
any code fixes docs-verification forced.
