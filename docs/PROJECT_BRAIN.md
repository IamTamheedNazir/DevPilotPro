# The Project Brain (`.vibe/`)

The brain is the project's durable truth — the part that survives sessions,
context resets, and agent swaps. Coding agents are stateless; the brain is
the state. Everything in it is plain files: diffable, reviewable, owned by
the user.

```
.vibe/
├── project.yaml          identity, stack, autonomy mode, install profile
├── product.md            what this is, for whom, core jobs
├── requirements.md       accepted REQ-<AREA>-NNN items (append-only history)
├── architecture.md       components, boundaries, data ownership
├── decisions/            ADRs (never edited; superseded by new ADRs)
├── tasks/                TASK-NNN files with verify commands and evidence links
├── research/             dated notes with FACT/INFERENCE/ASSUMPTION/UNVERIFIED labels
├── memory/
│   └── learned.yaml      candidate instincts: CANDIDATE → ACCEPTED/REJECTED/EXPIRED
├── evidence/             per-check evidence files + ledger.jsonl
├── qa/                   browser QA reports and screenshots
├── security/             security review records
├── reviews/              independent review reports
├── handoffs/             cross-agent session handoffs
├── sessions/             scratch notes; anything durable gets promoted up
├── skills/               installed canonical skills (managed)
└── install/
    ├── manifest.json     every managed file with its content hash
    └── backups/          pre-overwrite copies from installer updates
```

## Governance rules

- **Append-only truth.** `requirements.md`, `decisions/`, and the evidence
  ledger are never rewritten. Superseded entries are marked, not deleted.
- **Promotion over accumulation.** Session scratch (`sessions/`) that turns
  out to matter gets promoted into requirements, ADRs, or learned instincts.
- **Evidence is a file + a ledger row.** A claim is proven by a file under
  `evidence/` (command, exit code, date, output) plus an appended,
  hash-chained ledger record.
- **The brain is user property.** Uninstalling Steward preserves it. Agents
  edit it through the skills' documented process, never ad hoc.

## Learned instincts (`memory/learned.yaml`)

Candidate schema:

```yaml
learned:
  - id: INST-001
    status: CANDIDATE        # CANDIDATE | ACCEPTED | REJECTED | EXPIRED
    statement: "Convex migrations must be rehearsed before deploy in this repo."
    source: evidence/2026-09-20-migration-drift.md
    promoted: null           # date when ACCEPTED
    expires: null            # date after which it must be re-validated
```

Instincts are hypotheses the project has paid to learn. They are accepted
deliberately (usually by the user), expire, and are checked against current
reality before reuse.

## Ledger (`evidence/ledger.jsonl`)

Append-only JSONL. Each record commits to the SHA-256 of its predecessor
(`prev`) plus its own content hash, so silent history rewrites are
detectable via `verify()`. Event kinds: `brain.init`, `skills.install`,
`skills.uninstall`, `evidence`, `decision`, `note`.
