# Project Guardian and Evidence Freshness

The two Phase 3 systems that make "tests pass" insufficient for completion.
(Phase 4 adds the Security Guardian and Browser QA — see
[SECURITY_GUARDIAN.md](SECURITY_GUARDIAN.md) and [BROWSER_QA.md](BROWSER_QA.md);
`steward guardian-full` combines all of them into one completion decision,
and `steward ship` evaluates the same gates for release readiness.)

## Project Guardian

Tests prove the behavior that was written. The guardian asks the different
question: **was the requirement's surface actually written?** It detects
partially implemented requirements even when the suite is green.

For each accepted requirement, `guardFeature` evaluates deterministic
signals and gaps:

| Signal | Gap when absent |
|---|---|
| a DONE task traces to the requirement | no task / tasks not DONE |
| tasks declare expected files, and they exist | no expected files / files missing |
| an implementation file matches the requirement's keywords (name or ≥2 keyword hits in content) | no implementation surface |
| a test imports the implementation surface | no test association |

Plus a scan of changed and declared files for **stub markers**: `TODO`,
`FIXME`, `not implemented`, `unimplemented`, `throw new Error("not
implemented")`, and friends. A hard stub marker (anything beyond a plain
TODO/FIXME comment) demotes the requirement verdict to PARTIAL.

Verdicts:

- `IMPLEMENTED` — all signals present, no gaps
- `PARTIAL` — some surface exists but with gaps or stubs
- `MISSING` — no implementation signal at all
- feature verdict: `SATISFIED` only when every requirement is IMPLEMENTED

### Where it bites

The guardian runs as a Definition-of-Done gate (`gates.guardian`):
`completeFeature` refuses COMPLETE while any requirement is PARTIAL/MISSING
or a hard stub marker sits in the implementation — **even with every test
passing**. It also emits WARNING findings when spec expected-behavior items
have no matching requirement.

```bash
steward guardian            # all active features
steward guardian <feature>  # one feature
steward guardian <feature> --json
```

## Evidence freshness

Evidence older than the code it describes is stale. When verification runs
or a review verdict is recorded, Steward stamps the event with a
`surfaceHash` — a digest over the feature's freshness surface: its tasks'
expected files plus their transitive dependents, each file hashed by
content.

At gate evaluation the current surface hash is recomputed:

- `FRESH` — hash unchanged; the recorded pass still counts
- `STALE` — relevant code changed since the run; the gate reverts to
  MISSING with detail "evidence is STALE — re-run"
- `NO_SURFACE` — feature declares no expected files; reported, never
  silently passed
- `NO_EVIDENCE` — nothing recorded yet

Unrelated changes (files outside the surface) never invalidate evidence.

```bash
steward freshness <feature>   # per-evidence-kind FRESH/STALE report
```

The recovery path is always a re-run (`steward verify <feature>`), which
re-stamps fresh evidence — never a claim. `steward evidence.invalidated`
ledger events record explicit invalidations.

## Why deterministic

Both systems are pure functions of (state, repository). An agent cannot
argue its way past a guardian FAIL or a STALE verdict; it can only change
the repository or produce fresh evidence.
