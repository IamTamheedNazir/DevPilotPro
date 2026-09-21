# Steward Architecture

Steward is an engineering operating system for AI coding agents: one
canonical, vendor-neutral skill library compiled into per-harness artifacts,
a project brain for durable truth, and an evidence ledger that makes
completion claims checkable.

## Package layout

```
packages/
├── core/       @steward/core    — domain model, no harness knowledge
└── adapters/   @steward/adapters — compile canonical skills per harness
                 cli/  @steward/cli     — user-facing commands (thin)
skills/          canonical skill library (steward.skill.v1 documents)
docs/            architecture, support matrix, brain spec, reference analysis
```

## Layering (dependency direction: cli → adapters → core)

**`@steward/core`** owns everything harness-agnostic:

- `schema/skill.ts` — zod-validated `steward.skill.v1` frontmatter (id,
  semver, risk, triggers, profiles) and the canonical skill parser.
- `schema/project.ts` — `steward.project.v1` brain config (profile,
  autonomy mode, stack, conventions).
- `schema/ledger.ts` — hash-chained, append-only evidence ledger with
  `verify()`.
- `brain/` — the `.vibe/` project brain: paths, init scaffold, read/write.
- `install/` — plan classification (`classifyFile`: managed vs foreign,
  file vs block), the apply engine (backups, manifest, blocked actions),
  managed blocks (marker-delimited regions inside user-owned docs), and
  stale-file pruning.
- `doctor/` — evidence-based health checks.
- `skills/registry.ts` — locates the canonical `skills/` directory and
  filters by profile.

**Phase 2 — the workflow engine** (same package, still vendor-neutral):

- `state/` — the `.steward/` project state model: schema-versioned
  (`steward.state.v1`), zod-validated stores for features, specs,
  requirements, tasks, reviews, and debug sessions; deterministic feature
  state machine (see docs/FEATURE_LIFECYCLE.md).
- `risk.ts` — deterministic risk classification from textual signals
  (auth, payments, migrations, secrets, …); policy, never vibes.
- `verification/` — conservative command discovery, the observed
  `VerificationResult` model (redaction + truncation), the
  Definition-of-Done gate engine, and `runVerification`/`completeFeature`
  (see docs/VERIFICATION.md).
- `baseline.ts` — revision + dirty-file capture; pre-existing-failure vs
  regression classification.
- `context.ts` — deterministic context packs (task → requirements →
  verification expectations) for feeding a coding harness minimal context.

**Phase 3 — repository intelligence + guardian** (same package, still
deterministic):

- `intel/` — the repository model: content-hashed file index
  (`.steward/intel/index.json`, `steward.intel.v1`), import-derived
  dependency graph, change-impact analysis, scope-drift detection,
  keyword-based targeted retrieval, evidence freshness (surface hashing +
  staleness), the engine-level diff reviewer, and repository-aware debug
  context (see docs/REPOSITORY_INTELLIGENCE.md).
- `guardian.ts` — requirement-level implementation analysis: verifies each
  accepted requirement's implementation surface exists, is test-associated,
  and carries no stub markers — even when all tests pass
  (see docs/GUARDIAN.md). Enforced as a Definition-of-Done gate.

**`@steward/adapters`** implements `HarnessAdapter` per harness:
`detect(root)`, `artifacts(skill)`, `indexBlock(skills)`. Each adapter
records its verified formats and confidence level in its header comment
(see docs/SUPPORT_MATRIX.md). Adding a harness is one file + one registry
line. Phase 2 adapters additionally point agents at the deterministic
workflow commands (`steward vibe|spec|plan|build|verify|evidence`) instead
of duplicating any state logic in harness-specific instructions.

**`@steward/adapters`** implements `HarnessAdapter` per harness:
`detect(root)`, `artifacts(skill)`, `indexBlock(skills)`. Each adapter
records its verified formats and confidence level in its header comment
(see docs/SUPPORT_MATRIX.md). Adding a harness is one file + one registry
line.

**`@steward/cli`** maps commands onto the layers: `init`, `install`,
`doctor`, `status`, `adapters`, `skills`, `validate`, `update`, `repair`,
`uninstall`. It contains no domain logic.

## Key invariants

1. **Vendor neutrality.** `InstallTarget` at the core layer is an open
   string; adapter ids live in the adapters package. No Claude-specific
   concept appears in the core domain model.
2. **Ownership by provenance, not path.** A file is Steward's if and only
   if it carries Steward's generated marker. Foreign files are never
   overwritten implicitly — the installer blocks them and reports.
3. **Managed blocks.** Host docs (AGENTS.md, GEMINI.md, …) gain a
   marker-delimited managed region; user content is preserved on install,
   update, and uninstall.
4. **Manifest + hashes.** Every applied write is recorded in
   `.vibe/install/manifest.json` with the content hash; `status` detects
   drift, `repair` restores, `uninstall` removes exactly what Steward owns
   (modified files are kept and reported).
5. **Idempotence.** Installing twice is a no-op; re-running after drift
   converges to the canonical state.
6. **Context economy.** Generated artifacts are thin pointers; skill bodies
   load on demand from `.vibe/skills/<id>.md`.
7. **Evidence over claims.** The ledger is append-only and hash-chained;
   every skill's gates end in commands that were actually run.

## The lifecycle the skills encode

`/vibe` triages and classifies risk, then routes:

```
spec → architecture → plan → build ⇄ test/debug → verify → review/security
                                                        ↘ qa ↘ docs ↘ ship
```

Risk classes (LOW/MEDIUM/HIGH/CRITICAL) determine gates; CRITICAL
(deployments, destructive migrations) always requires explicit human
approval, in every autonomy mode except `audit` (which changes nothing).

## Testing strategy

- Unit: schema validation, ledger chaining/tamper detection, plan
  classification, managed blocks, feature state machine, requirements,
  task dependencies, gates, redaction, path traversal, context packs
  (packages/core/test).
- Integration: the install engine and the verification engine against temp
  directories — apply, skip, backup, blocked foreign files, uninstall
  preservation, pruning, command execution, baseline, git safety
  (packages/core/test).
- End-to-end: the Phase 2 fixture evaluation — init → spec → approve →
  plan → task lifecycle → verification → evidence → COMPLETE, plus the
  negative evals proving false completion is impossible (tests fail → NOT
  COMPLETE; missing evidence → NOT COMPLETE; missing review → NOT
  COMPLETE) and the Phase 3 evals (partial implementation with passing
  tests → NOT COMPLETE; relevant code change after a pass → evidence STALE,
  gates revert to MISSING) (packages/core/test/e2e.test.ts, verify.test.ts,
  guardian.test.ts, freshness.test.ts, intel.test.ts, review-engine.test.ts).
- Adapter contract: artifact shapes, shared block ids, detection signals,
  confidence honesty, workflow-command pointers (packages/adapters/test).
- Smoke: CLI end-to-end in a temp project (init → install → doctor →
  status → uninstall) — run manually per CONTRIBUTING.md; CI wiring is
  the next milestone.
