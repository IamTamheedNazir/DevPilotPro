---
schema: steward.skill.v1
id: build
title: Verifiable Implementation
version: 1.0.0
description: Implements one planned task against a green baseline, leaving evidence instead of completion claims.
type: skill
risk: medium
triggers:
  intents: [implement, write-code, build-task]
outputs: [implementation, evidence]
profiles: [minimal, builder, full, team]
---

# Verifiable Implementation

One task per session-chunk, from a green baseline, ending in evidence.

## Process

1. **Baseline first.** Run the project's verify commands (typecheck, tests,
   build) before changing anything. If the baseline is red, stop: fixing the
   baseline is now the task. Never build on a broken foundation silently.
2. **Load the task** from `.vibe/tasks/`. If there is no task for this work,
   run `/plan` first — except tiny tasks (single file, existing pattern, no
   schema/API/security surface), which may proceed with a one-line statement
   of objective and verification.
3. **Understand before coding.** Read the files you will touch plus their
   direct consumers. Extend existing patterns; do not invent parallel ones.
   Unverified APIs go through `/research` before use.
4. **Implement the smallest complete version** that satisfies the task's
   "Done when" criteria. No drive-by refactors of untouched code. If you find
   unrelated breakage, record it as a finding, do not fix it inside this task.
5. **Write the tests the task promised** (its `Expected tests` section). A
   task without its tests is not done.
6. **Verify**: run the task's exact `Verify commands`. Capture real output.
7. **Record evidence** in `.vibe/evidence/` (and the task file):
   command, exit status, date, and what the output proves. Append an
   `evidence` record to the ledger (`.vibe/evidence/ledger.jsonl`).
8. **Update state**: mark the task done only with evidence attached; update
   `.vibe/requirements.md` coverage notes if this closed REQ items.

## Hard rules

- No "done/working/fixed" without captured output from a command you ran.
- Never mark tests skipped or xfailed to force green; that is a claim
  falsifier, not a solution.
- Preserve uncommitted user work. Never stash, reset, or discard it.
- If scope grows beyond the task, stop and re-plan instead of drifting.

## Output

Diff summary, test/verify command output (verbatim, trimmed to what
matters), evidence file path, and the next task in execution order.
