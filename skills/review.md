---
schema: steward.skill.v1
id: review
title: Independent Review
version: 1.0.0
description: Reviews a change as a hostile-but-fair second engineer — correctness, contract fit, security surface, and tests — with blocking verdicts.
type: skill
risk: low
triggers:
  intents: [review, code-review, look-over]
outputs: [review-report]
profiles: [builder, full, team]
---

# Independent Review

Review the diff as written, not the intention behind it. Required for
HIGH-risk work (see `/vibe`); cheap and worthwhile for everything else.

## Process

1. **Read the diff first** (`git diff` / staged changes), then the task and
   spec it claims to satisfy. Never review without both.
2. **Check, in order of severity:**
   - **Correctness**: logic errors, unhandled error paths, race conditions,
     off-by-one, null/empty handling, migration safety and reversibility.
   - **Contract fit**: does it implement the accepted REQ IDs and respect
     `.vibe/architecture.md` boundaries? Out-of-boundary calls and
     duplicated concerns are findings, not style opinions.
   - **Security surface**: run the `/security` checklist on touched files
     even if the skill itself was not invoked.
   - **Tests**: do the new tests actually pin the behavior? Would they fail
     if the logic were wrong? Is anything load-bearing untested?
   - **Maintainability**: naming, dead code, comments that lie, magic
     values, copy-paste divergence.
3. **Verify claims made in the diff** (commit message, comments, task
   status) against actual output via `/verify` when anything asserts
   "working" or "fixed".
4. **Verdict per finding**: BLOCKING (defect or contract violation),
   SUGGESTION (worth doing), or NOTE (taste, no action needed). Every
   blocking finding gets file:line and a concrete fix direction.
5. **Persist** the review to `.vibe/reviews/` (create if absent) or the
   task file, with date and diff scope. Blocking findings route back to
   `/build`; none may be silently dropped.

## Hard rules

- The author of a change may not mark their own HIGH-risk work reviewed.
- Do not approve on the promise of future fixes; re-review after fixes.
- Preserve the author's uncommitted work while reviewing; comment, never mutate.

## Output

Review report: verdict (approve / approve-with-suggestions / changes-required),
findings table with file:line, and the exact verify commands the author must
show green before merge.
