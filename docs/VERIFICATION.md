# Verification

Verification is the difference between "the agent said it works" and "we
watched it work." Steward only accepts the second.

## Command discovery

Steward detects verification commands conservatively from `package.json`
(scripts: `test`, `typecheck`, `lint`, `build`), `pyproject.toml`,
`Cargo.toml`, `Makefile`, and CI configuration. It **never invents**
commands. Projects override per command in `.steward/project.yaml`:

```yaml
verification:
  test: "npm test"
  typecheck: "npx tsc -b --noEmit"
  lint: null      # null = not applicable, gate is skipped
  build: "npm run build"
```

## Result model

Every execution is observed and stored (`VerificationResult`):

```text
command, startedAt, completedAt, exitCode, success,
category (test|typecheck|lint|build|custom),
stdoutSummary, stderrSummary   # redacted + truncated
```

A model message saying "tests passed" is not evidence. An observed exit 0
with stored summaries is.

## Gates

`evaluateGates` computes required vs satisfied gates for a feature:

| Gate | Required when |
|---|---|
| accepted requirements exist | always |
| all tasks resolved | always |
| implementation evidence exists | always |
| test / typecheck / lint / build pass | command configured (not `null`) |
| browser QA review | feature surfaces UI (`ui: true` or detected) |
| security review | feature risk ≥ HIGH, or touches auth/payments/secrets |
| no unresolved blockers | always |
| no unresolved blockers in debug | debug session open |

Irrelevant gates are never required — a docs-only change does not demand
browser QA.

## Baseline: pre-existing vs regression

Before Steward directs changes, `captureBaseline` records:

- git revision and `git status --porcelain` (existing user changes are
  noted and **never claimed** by Steward)
- which configured verification commands currently fail

If a verification command failed in the baseline, the identical later
failure is classified `pre_existing`, not a regression. A command that
passed in the baseline and fails later is a `regression` and blocks
completion.

## Git safety

Steward records the dirty-file set before any workflow runs and never
executes destructive git commands (`reset`, `clean`, `checkout --`) to make
verification easier. User changes survive every workflow untouched; this is
asserted in the git-safety test suite.
