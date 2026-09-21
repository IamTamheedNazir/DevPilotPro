# Browser QA

Phase 4 capability: verify important user-facing behavior in a real browser
and produce evidence the Project Guardian and Definition-of-Done can use.
Steward is not a Playwright wrapper — Playwright is one provider behind a
stable interface, and Guardian never knows it exists.

## Journeys (`steward.qa.v1`)

A journey is a small, versioned, code-free file under
`.steward/qa/journeys/`:

```yaml
schema: steward.qa.v1
id: invite-accept
title: Invitee accepts an organization invitation
featureId: feat-org-invites
requirementIds: [REQ-INVITE-003]
startUrl: /invites/abc123
viewports: [desktop, mobile]
accessibility: true
surfaces: []            # extra invalidation files beyond the import graph
steps:
  - { kind: goto, url: "/invites/abc123" }
  - { kind: expect, selector: "[data-testid=org-name]", text: Acme }
  - { kind: fill, selector: "[data-testid=name]", value: "Dana" }
  - { kind: click, selector: "[data-testid=accept]" }
  - { kind: expect, selector: "[data-testid=success]" }
```

Step kinds: `goto`, `click`, `fill`, `press`, `wait`, `expect`,
`screenshot`, `checkAccessibility`, `saveState`. Journeys may reference a
native project Playwright spec (`playwrightSpec:`) instead of duplicating
it — Steward verifies, it does not re-own tests.

## Results and evidence

Runs persist under `.steward/qa/results/` with per-viewport status and
**sanitized, bounded** evidence: console messages (errors/warnings, capped
and redacted), network failures, axe accessibility violations, and artifact
*references* (screenshots/traces stored under
`.steward/qa/artifacts/<feature>/`, never embedded in state JSON).

Failure classes are honest: `ASSERTION`, `APPLICATION_ERROR`,
`NETWORK_ERROR`, `CONSOLE_ERROR`, `ACCESSIBILITY`, `TIMEOUT`,
`ENVIRONMENT`, `TEST_INFRASTRUCTURE`, `ORIGIN_ESCAPE`, `UNKNOWN`. A missing
browser is `UNAVAILABLE` with a reason — never faked as PASS.

## Target safety

`qaExecutionContext` is built from the project policy (`qa:` block in
`.steward/project.yaml`):

```yaml
qa:
  baseUrl: http://localhost:3000
  allowedHosts: [localhost, 127.0.0.1]     # never broadened implicitly
  trustedExternalOrigins: []               # OAuth/payments hosts, explicit only
  allowedPrivateHosts: []                  # authorized private-network targets
  viewports: { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
  consoleErrors: { fail: true }
  failedRequests: { fail5xx: true, fail4xx: false }
  accessibility: { automated: true }
```

Navigation outside the allowed hosts is blocked and reported as
`ORIGIN_ESCAPE`.

## Provider interface

```ts
interface BrowserQaProvider {
  readonly name: string;
  available(): Promise<boolean>;
  availabilityDetail(): Promise<string>;
  run(journey, context): Promise<QaRunResult>;
}
```

`steward qa capabilities` reports what is actually installed (provider,
browsers, axe integration, baseUrl). Capability gaps are reported as facts,
not worked around.

## Freshness and the DoD gate

Every result carries a `surfaceHash` over the journey's surface: its
declared `surfaces` files plus their import-graph reach (Phase 3
intelligence). Change a relevant file and the journey's last result is
STALE — `steward qa freshness` shows it, and `gates.browserQA` reverts to
FAIL until the journey re-runs and passes.

`gates.browserQA` is required when the feature demands it or UI surfaces
are detected: every declared journey must exist, be CURRENT, and have a
PASSING latest result. All three or the feature is not complete.

## Debug linking

A failed journey can seed a structured `/debug` session with the observed
evidence in the symptom and context (failed viewport, step, console errors,
5xx requests, artifact paths) — `steward debug from-qa <resultId>`. Steward
never auto-modifies code; it hands the investigation a running start.

## CLI

```bash
steward qa capabilities                                   # honest capability report
steward qa journey <id> --feature F --title ... --start /path --step goto:/path --step expect:sel:text
steward qa run <journeyId>                                # one journey
steward qa run --feature F                                # all journeys for a feature
steward qa status <feature>                               # journeys, freshness, blocking
steward freshness <feature>                               # verification/QA/security evidence freshness
steward guardian-full <feature>                           # aggregate: requirements+tests+security+QAsteward ship                                                # release readiness (§52)
```
