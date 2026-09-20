---
schema: steward.skill.v1
id: test
title: Tests That Prove Behavior
version: 1.0.0
description: Designs and runs the test layer for a feature — unit, integration, and end-to-end — with honest, non-tautological assertions.
type: skill
risk: low
triggers:
  intents: [add-tests, test-plan, coverage]
outputs: [test-suite, test-report]
profiles: [builder, full, team]
---

# Tests That Prove Behavior

A test that cannot fail is decoration. Tests exist to catch regressions, not
to raise coverage numbers.

## Process

1. **Test what the requirement demands**, not what the code does. Derive
   cases from REQ IDs and the task's acceptance criteria: for each behavior,
   at least one proof it works and one proof it fails cleanly.
2. **Layer honestly:**
   - **Unit** — pure logic, edge cases, error paths. Fast, many.
   - **Integration** — real database/API/framework seams, migrations, auth
     flows. Fewer, slower, mandatory for anything with state.
   - **End-to-end** — the user journeys from the spec, run against a real
     build (`/qa` covers browser verification).
3. **Assert observably**: returned values, rendered output, HTTP status,
   rows in the database, files written. Never assert implementation details
   that survive any refactor.
4. **Error and boundary states are first-class**: empty input, oversized
   input, unauthorized access, network failure, concurrent writes. The
   spec's UX states (loading, empty, error) each get a test.
5. **Run the suite** and capture the output as evidence (see `/verify`).
   Flaky tests are failures: quarantine them explicitly with a linked task,
   never by deleting the assertion.

## Hard rules

- No test that mocks the thing it is supposed to test.
- No unreachable code paths in tests; if a branch cannot be triggered, the
  design is wrong — raise it, do not fake it.
- Coverage numbers are diagnostics, not goals. Report them with the command
  that produced them, never as a substitute for behavioral proof.

## Output

Test files added/changed, the run command with its real output, and any
gaps you could not cover (each with the reason and a linked task).
