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
  classification, managed blocks (packages/core/test).
- Integration: the install engine against temp directories — apply, skip,
  backup, blocked foreign files, uninstall preservation, pruning
  (packages/core/test/engine.test.ts).
- Adapter contract: artifact shapes, shared block ids, detection signals,
  confidence honesty (packages/adapters/test).
- Smoke: CLI end-to-end in a temp project (init → install → doctor →
  status → uninstall) — run manually per CONTRIBUTING.md; CI wiring is
  the next milestone.
