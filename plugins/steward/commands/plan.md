---
description: "Decomposes an accepted spec into small, independently verifiable tasks with dependencies, expected tests, and completion criteria."
---

Read and follow the Steward skill 'plan' (v1.0.0, "Spec to Verifiable Plan").


# Spec to Verifiable Plan

Convert the accepted specification into tasks small enough to finish and
verify in one sitting, ordered so nothing is built before its dependencies.

## Task template (every task, no exceptions)

```markdown
# TASK-<NNN>: <imperative title>
Objective:        what exists after this task that does not exist now
Requirements:     REQ-…-NNN ids satisfied (may be partial: which parts)
Depends on:       TASK-… ids (or none)
Files touched:    expected files/modules
Steps:            3–7 concrete steps
Expected tests:   what tests prove it (unit/integration/E2E)
Verify commands:  exact commands that must pass (typecheck, tests, build)
Risks:            what could break; risk level LOW/MEDIUM/HIGH
Done when:        observable, checkable completion criteria
```

## Rules

- A task should be finishable in roughly one focused session. If bigger,
  split it.
- Every task lists verify commands you will actually run. If none can be run,
  the task is not ready.
- Order by dependency, then by risk (riskiest early while there is time to
  react).
- Flag tasks that touch HIGH/CRITICAL surfaces (auth, payments, migrations,
  public APIs) — they inherit the extra gates from `/vibe`.
- Reuse before inventing: check `.vibe/` and the codebase for existing
  implementations of the same concern; if one exists, the task is to extend
  it, not duplicate it.

## Persist

Write tasks to `.vibe/tasks/TASK-<NNN>-<slug>.md`. Mark the current milestone
in the file header. When a task completes, record its evidence location in the
task file (see `/build` and `/verify`).

## Output

A numbered execution order with the risk level per task and the first task
ready to start. Then start `/build` on TASK-001 unless the user says otherwise.

---

Apply this process exactly. Do not claim completion without the evidence this skill requires.
Lifecycle state is deterministic: inspect with `steward status`, prove completion with `steward verify <feature>` — prose cannot change lifecycle state; only executed, recorded evidence can.


Skill arguments: $ARGUMENTS
