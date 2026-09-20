---
schema: steward.skill.v1
id: debug
title: Root Cause Before Remedy
version: 1.0.0
description: Reproduces failures, isolates the true cause, and fixes it with regression-proof evidence instead of patching symptoms.
type: skill
risk: medium
triggers:
  intents: [bug, broken, error, not-working, fix]
outputs: [root-cause-analysis, fix, regression-test]
profiles: [builder, full, team]
---

# Root Cause Before Remedy

A fix without a reproduced failure is a guess that happened to compile.

## Process

1. **Reproduce deterministically.** Capture the exact command, input, and
   full error output. If you cannot reproduce it, say so and gather
   information (logs, environment, versions) instead of editing code.
2. **Read the actual error.** Trace it to the failing line before forming
   any hypothesis. No fix may precede a stated cause.
3. **Isolate**: binary-search the surface — revert partial state, add
   assertions, log the seam, test components in isolation — until the
   smallest failing case is known.
4. **State the root cause** in one sentence with the evidence that proves
   it. Distinguish: bug in code, wrong assumption, environment drift,
   dependency behavior, or spec conflict. Wrong assumptions route to
   `/research`; spec conflicts route back to `/spec`.
5. **Fix the cause, not the symptom.** The fix is the smallest change that
   removes the cause. Check sibling code for the same defect class.
6. **Prove it**: add the regression test that fails on the old code and
   passes on the new (see `/test`). Run the full verify suite — a fix that
   breaks neighbors is not a fix.
7. **Record** root cause, fix, and evidence in the task/decision notes and
   append an `evidence` ledger record.

## Hard rules

- No shotgun edits (multiple unrelated changes hoping one lands).
- No catch-and-ignore to silence an error; suppression needs a comment
  stating exactly what is suppressed and why it is safe.
- Two independent failed fix attempts on the same symptom require stopping
  and re-deriving the cause from scratch — including questioning the spec.

## Output

Reproduction evidence → root cause (one sentence, proven) → the fix →
regression test result → full suite result. Then update `/verify` state.
