---
schema: steward.skill.v1
id: verify
title: Evidence Gate
version: 1.0.0
description: Runs the real checks a claim depends on, captures their output, and converts "done" into verifiable recorded evidence.
type: skill
risk: low
triggers:
  intents: [is-it-done, prove-it, check-work, verify]
outputs: [evidence-record, verification-report]
profiles: [minimal, builder, full, team]
---

# Evidence Gate

No claim leaves this project without a receipt. "Done" is a set of commands
that ran green, not a feeling.

## Process

1. **Collect the claims** to verify: task "Done when" criteria, REQ items
   touched, and any "working/complete/secure" statement made this session.
2. **For each claim, name the command that proves it.** If no command can
   prove it, the claim is downgraded to "unverified" — explicitly, in
   writing. Claims that cannot ever be verified by a command need a human
   (user acceptance), and say so.
3. **Run the commands for real**, in this project, at this commit:
   typecheck, tests, build, lint, migrations against a real database,
   HTTP checks against a running server, browser flows via `/qa`.
   Skipped ≠ passed. Cache ≠ ran. "It passed yesterday" ≠ evidence.
4. **Capture output verbatim** into `.vibe/evidence/<date>-<slug>.md`:
   command, exit code, date/commit, and the output lines that matter.
   Append an `evidence` record to the ledger with the file reference.
5. **Report honestly**: for every claim — VERIFIED (with evidence path),
   FAILED (with output), or UNVERIFIED (with what is missing). A single
   unverified claim blocks "production ready" and similar wholesale claims.
6. **If anything failed**, stop claiming success and route to `/debug`
   (behavior wrong) or back to `/build` (work missing). Do not re-run
   until green and then forget the failures that got you there.

## Hard rules

- Never report the result of a command you did not run.
- Never restate the user's optimism as evidence ("should work" is a
  hypothesis, not a result).
- Evidence is append-only: superseded evidence is replaced by newer
  evidence, never deleted.

## Output

A verification table: claim → verdict → evidence path. Then the honest
overall state in one sentence.
