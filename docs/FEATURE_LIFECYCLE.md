# Feature Lifecycle

Feature state lives in `.steward/features/<id>/feature.yaml` and is mutated
only through `transitionFeature` in `@steward/core`. Markdown never controls
lifecycle state.

## States

```text
PROPOSED → SPECIFIED → APPROVED → PLANNED → IMPLEMENTING → VERIFYING → COMPLETE
   ↓           ↓            ↓          ↓          ↓
BLOCKED     REJECTED    CANCELLED  CANCELLED  BLOCKED (↩ IMPLEMENTING)
                                  ↓ VERIFYING (rework)
```

Side states: `BLOCKED`, `REJECTED`, `CANCELLED`. `BLOCKED` returns to the
state it came from; `REJECTED`/`CANCELLED` are terminal.

## Rules enforced in code

- Transitions are validated against an explicit transition table; anything
  else throws (`PROPOSED → COMPLETE` is impossible by construction).
- `IMPLEMENTING → VERIFYING` requires the feature to have at least one task
  and **no task left in `IN_PROGRESS`**.
- `VERIFYING → COMPLETE` is only performed by `completeFeature`, which
  evaluates the full Definition-of-Done gate set (see
  [VERIFICATION.md](VERIFICATION.md)). If any required gate is unsatisfied,
  the transition is refused and the feature stays `VERIFYING` with a
  machine-readable `remainingGates` list.
- Every accepted transition appends a `feature.state` evidence event, so the
  full history is auditable.

## Task states

```text
PENDING → READY → IN_PROGRESS → VERIFYING → DONE
              ↘ BLOCKED ↗
```

Tasks may only reach `DONE` after their own verification commands pass
(exit 0), which is recorded as `verification.run` evidence with exit code
and command. `READY` requires all declared task dependencies to be `DONE`.
