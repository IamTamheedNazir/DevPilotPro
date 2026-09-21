# Evidence

Everything Steward claims about a feature must be substantiated by an entry
in the append-only evidence ledger introduced in Phase 1
(`.steward/ledger.jsonl`), extended in Phase 2 with typed workflow events.

## Event kinds

| Kind | Emitted by | Payload includes |
|---|---|---|
| `feature.created` | `createFeature` | featureId, title, request |
| `spec.created` | `createSpec` | featureId, objective |
| `spec.approved` | `approveSpec` | featureId |
| `requirement.created` | `addRequirement` | featureId, requirementId |
| `plan.created` | `createPlan` | featureId, taskIds |
| `task.started` | `startTask` | featureId, taskId |
| `task.status` | `setTaskStatus` | featureId, taskId, status |
| `verification.run` | verification runner | featureId, taskId?, command, category, exitCode, evidenceFile |
| `review.recorded` | `recordReviewVerdict` | featureId, reviewType, verdict |
| `debug.stage` | debug workflow | featureId, session, stage |
| `feature.state` | `transitionFeature` | featureId, from, to |
| `risk.assessed` | risk engine | featureId, risk, signals |
| `baseline.captured` | `captureBaseline` | revision, failing commands |
| `evidence.invalidated` | freshness system | featureId, reason |
| `security.review.recorded` | Security Guardian | featureId, verdict, checks, blockers, surface |
| `security.finding.recorded` / `security.finding.updated` | finding store | findingId, category, severity, ruleId |
| `security.finding.status` | status transitions | findingId, status, actor (agents refused for ACCEPTED_RISK) |
| `security.exception` | accepted risks | exceptionId, findingId, reason, expiry |
| `security.baseline` | baseline capture | fingerprint count |
| `security.threat-model` | threat model generation | featureId, scenario count |
| `qa.journey.created` | `saveJourney` | journeyId, featureId, step count, viewports |
| `qa.journey.recorded` | QA provider runs | journeyId, resultId, status, viewports |

## Surface hashes (Phase 3)

`verification.run`, `review.qa`, and `review.security` events carry a
`surfaceHash` — a content digest of the feature's code surface at record
time. Gate evaluation recomputes the hash; a mismatch means the evidence is
STALE and no longer satisfies its gate. See docs/GUARDIAN.md.

## Shape

Each record: `ts`, `seq`, `kind`, `payload`, plus the Phase 1 hash chain
(`prevHash`/`hash`) so tampering is detectable by `steward doctor`.

Output summaries are **redacted** (common secret patterns: `sk_live_*`,
AKIA keys, `password=`…) and **truncated** before storage. Steward stores
enough to substantiate the claim — never entire command dumps.

## Querying

```bash
steward evidence FEAT-x            # human-readable trail
steward evidence FEAT-x --json     # structured records
```

`evidenceFor(featureId)` returns every record whose payload references the
feature; task-level queries filter by `taskId`.
