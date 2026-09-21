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
2. pull targeted repository context: `steward intel retrieve <task-or-topic>`
3. capture baseline (see VERIFICATION.md) so pre-existing failures are never
   blamed on the new task
4. harness implements
5. `runTaskVerification` executes the task's verification commands,
   persists exit codes as evidence, updates task state

## /verify

Independent re-verification; see [VERIFICATION.md](VERIFICATION.md). Since
Phase 3 the gate set includes the Project Guardian (requirement surfaces
verified against the repository) and evidence-freshness checks (stale
passes no longer count).

## /review

Two layers, both recorded in `review.yaml`:

- **Engine (deterministic, Phase 3):** `steward review diff <feature>`
  inspects the actual change set — scope drift vs the plan, changed
  implementation files no test imports, TODO/FIXME leftovers, unsafe
  shortcuts (`eval`, empty catch, secret logging), copy-paste duplication,
  and planned files missing from disk. Findings are BLOCKER/WARNING/NOTE.
- **Agent (judgment):** the reviewing harness reads the diff for requirement
  alignment and records findings with `steward review add` and verdicts with
  `steward review verdict`.

Any unresolved BLOCKER gates completion.

## /debug

Structured debugging state under the feature's `debug/` directory:
`reproduce → hypotheses → evidence → root_cause → regression_test → fix →
verify`. The state model makes "BUG → RANDOM EDIT → CLAIM FIXED" impossible
to record: each stage must be observed and stored before the next.

Since Phase 3 the workflow is repository-aware: `steward debug context
<id>` attaches deterministic suspect files (retrieval on the symptom), the
tests exercising the current change set, and coverage-gap warnings that
must be resolved by the REGRESSION_TEST stage.
