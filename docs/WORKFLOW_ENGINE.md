# Workflow Engine

Steward's workflows are deterministic functions over project state — not
prompts. The coding harness (Claude, Codex, Cursor, …) remains replaceable;
Steward is the engineering control plane around it.

## Architecture

```text
Claude/Codex/Cursor/…      ← the harness writes code
        ↓
Canonical Steward Workflow ← /vibe /spec /plan /build /verify /review /debug
        ↓
Steward CLI / @steward/core ← deterministic functions, validated inputs
        ↓
.steward/ state + evidence  ← the only source of truth
```

## /vibe — next-activity router

Inspects state and decides the next activity. Deliberately small:

| Observation | Next workflow |
|---|---|
| no feature for the request | `spec` |
| spec exists, not approved | `spec` (review + approve) |
| spec approved, no plan | `plan` |
| plan exists, unresolved tasks | `build` (next ready task) |
| all tasks resolved, feature not COMPLETE | `verify` |
| verification passes all gates | `complete` |
| verification fails | `debug` on the failing gate |

## /spec

`createSpec` generates a structured spec (objective, personas, expected
behavior, constraints, assumptions, out-of-scope, acceptance criteria,
risks, open questions) and derives stable requirement IDs (`REQ-<AREA>-NNN`)
from the feature area. `approveSpec` requires an explicit human decision and
drives `PROPOSED → SPECIFIED → APPROVED` atomically.

## /plan

`createPlan` validates every task's requirement references against real
requirement IDs, orders tasks by dependencies, and drives `APPROVED →
PLANNED`. Task states (`PENDING → READY → IN_PROGRESS → VERIFYING → DONE`,
plus `BLOCKED`) are enforced by `setTaskStatus`.

## /build

Orchestration only — the harness writes code:

1. load accepted spec + next ready task + its requirements (context pack)
2. capture baseline (see VERIFICATION.md) so pre-existing failures are never
   blamed on the new task
3. harness implements
4. `runTaskVerification` executes the task's verification commands,
   persists exit codes as evidence, updates task state

## /verify

Independent re-verification; see [VERIFICATION.md](VERIFICATION.md).

## /review

`recordReviewVerdict` records BLOCKER/WARNING/NOTE findings against a
feature. Any unresolved BLOCKER gate blocks completion.

## /debug

Structured debugging state under the feature's `debug/` directory:
`reproduce → hypotheses → evidence → root_cause → regression_test → fix →
verify`. The state model makes "BUG → RANDOM EDIT → CLAIM FIXED" impossible
to record: each stage must be observed and stored before the next.
