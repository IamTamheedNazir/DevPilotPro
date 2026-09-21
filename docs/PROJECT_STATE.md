# Project State

Steward's source of truth is a project-owned directory: `.steward/`. It is
human-readable, diffable, versionable where safe, and contains no secrets.

## Layout

```text
.steward/
├── project.yaml        # project config: name, verification commands, gates policy
├── ledger.jsonl        # append-only evidence ledger (Phase 1 format, extended)
├── features/
│   └── <feature-id>/
│       ├── feature.yaml        # id, title, state, risk, required gates
│       ├── spec.md             # generated + human-edited spec
│       ├── requirements.yaml   # REQ-<AREA>-NNN list
│       ├── plan.yaml           # task order + tasks
│       ├── reviews/            # recorded review verdicts
│       └── debug/              # debug session artifacts
└── sessions/           # per-agent-session records (context packs used, etc.)
```

## Invariants

1. **Deterministic.** Every mutation goes through `@steward/core` functions
   that validate inputs (zod) and drive the state machine (see
   [FEATURE_LIFECYCLE.md](FEATURE_LIFECYCLE.md)). Markdown files are
   projections of state, never the controller.
2. **Traceable.** Tasks reference requirement IDs; evidence events reference
   feature/task/requirement IDs. `steward evidence <feature>` answers "what
   happened" without conversational memory.
3. **Diffable.** YAML + markdown only; one file per entity; stable IDs
   (`FEAT-<slug>`, `REQ-<AREA>-NNN`, `TASK-NNN`).
4. **Project-owned.** Nothing in `.steward/` leaves the project. Steward
   never claims ownership of files it did not create (see
   [VERIFICATION.md](VERIFICATION.md) for baseline/git-safety rules).
5. **Schema-versioned.** `project.yaml` carries `schema: steward.state.v1`.
   Phase 2 writes v1; future versions must provide migration, never silent
   reinterpretation.

## Who writes what

| Actor | Writes |
|---|---|
| `steward init` | creates `.steward/`, detects verification commands |
| workflow functions (`createFeature`, `addRequirement`, …) | features/* |
| verification runner | ledger events + evidence files under the feature dir |
| humans | freely edit spec.md / requirements acceptance text — IDs and states remain machine-controlled |
