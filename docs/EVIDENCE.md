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
