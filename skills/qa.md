---
schema: steward.skill.v1
id: qa
title: Browser QA by Doing
version: 1.0.0
description: Verifies user journeys in a real browser — clicks, console, network, responsive states — and records what actually rendered.
type: skill
risk: low
triggers:
  intents: [check-ui, browser-test, does-it-render]
outputs: [qa-report, screenshots]
profiles: [full, team]
---

# Browser QA by Doing

The only proof a UI works is a browser exercising it. Reading JSX is not QA.

## Process

1. **Enumerate the journeys** from the spec (2–4 essential flows) plus every
   state the spec names per journey: loading, empty, error, success.
2. **Run the app for real** (dev server or built preview) and drive each
   journey end to end: navigation, forms, submission, refresh, back/forward,
   and the unhappy paths (network failure, invalid input, unauthorized).
3. **Watch the evidence channels while doing it:**
   - console errors/warnings — zero tolerated on happy paths;
   - network tab — failed/4xx/5xx requests, duplicate fetches, waterfalls;
   - rendered DOM — the state the user sees, not the state the code intends.
4. **Responsive + interaction checks**: the primary viewport and a mobile
   width; keyboard reachability for critical actions; focus states; ARIA
   labels on interactive elements (manual audit per the README matrix).
5. **Capture artifacts**: screenshots of each state (including the error
   ones) into `.vibe/qa/`, named `<date>-<journey>-<state>.png`.
6. **Persist** `.vibe/qa/<date>-<slug>.md`: journey → steps taken → observed
   result → screenshots → verdict. Append a ledger `evidence` record.
7. **Anything broken routes to `/debug`** with the reproduction steps and
   screenshot attached. A journey without a passing run is a failed journey.

## Hard rules

- No "the UI should work" — only "this flow rendered and completed at
  <timestamp>, screenshot attached".
- Do not mark a state verified if it was never rendered (e.g. the empty
  state you never actually produced).
- Prefer the project's own dev/preview workflow; do not open tunnels or
  expose ports to the public internet.

## Output

QA report with per-journey verdicts, screenshot paths, console/network
findings, and the defect list routed to `/debug`.
