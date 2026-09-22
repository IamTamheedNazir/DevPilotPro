# Engineering Memory

Phase 5 gives Steward durable engineering memory: decisions, conventions,
project facts, root causes, and lessons that survive across sessions **and
across harnesses** — a Codex session inherits what a Claude session learned.

The goal is not generic memory. It is:

> Help the next agent avoid repeating project mistakes.

Conversation history is never project truth. Memory lives in the project
(`.steward/memory/memories.yaml`), is human-readable, diffable, and
secret-redacted on ingest.

## The core rule: authority precedence

A lower-authority memory can never override a higher-authority one:

```
PROJECT_POLICY        (700)  — ADR / project policy
ACCEPTED_REQUIREMENT  (600)  — accepted requirement or spec
VERIFIED_EVIDENCE     (500)  — recorded, fresh evidence
ACCEPTED_CONVENTION   (400)  — accepted learned convention
LEARNED_CANDIDATE     (300)  — observed pattern, not yet accepted
AGENT_OBSERVATION     (200)  — one agent's note
CONVERSATION          (100)  — chat context
```

Enforced in deterministic code (`authority.ts`), not prompt text:

- **No memory without provenance.** Every record carries why Steward believes
  it (actor, harness, deterministic basis facts, optional evidence ref).
- **Agents cannot write truth.** Writing at or above `VERIFIED_EVIDENCE`
  requires human or evidence-derived provenance (`assertWritableAuthority`).
- **Acceptance is explicit and bounded.** Accepting a candidate raises it to
  `ACCEPTED_CONVENTION` at most — never `PROJECT_POLICY`.
- **Conflicts surface, never hide.** Contradicting records are marked
  `CONFLICTED`; queries show both sides instead of a fake consensus.

## Memory kinds and lifecycle

Kinds: `decision`, `convention`, `project-fact`, `root-cause`, `lesson`,
`workflow`, `warning`, `environment`, `preference`, `historical`.

Lifecycle (deterministic transitions, illegal moves throw):

```
CANDIDATE ──accept──▶ ACTIVE ──stale──▶ STALE
    │                    │                 │
    │                    ├─conflict─▶ CONFLICTED
    │                    └─supersede─▶ SUPERSEDED
    └─reject──────────▶ REJECTED ◀── any state can be rejected
```

## Learned conventions

`steward memory learn` scans the repository (via the Phase 3 content-hashed
index) for repeated patterns and records them as **CANDIDATE** memory —
never project truth:

- test framework per package (vitest/jest)
- test colocation (next to implementation vs. dedicated `tests/` dirs)
- data access through repository modules rather than direct storage clients
- validation library (zod/yup/io-ts), including honest "mixed — no
  project-wide convention" results

Contradiction handling is the important part: if `packages/api` uses Vitest
and `packages/mobile` uses Jest, the engine records **package-scoped**
conventions — never a fake universal "project uses vitest". A project-scope
candidate that contradicts an existing convention is itself marked
`CONFLICTED`, so a disputed rule cannot silently read as truth.

Candidates become binding only when a human accepts them:

```bash
steward memory accept MEM-CONV-001
```

## Memory freshness

Memory can lie after the project moves on. Every memory may declare
`supportFiles`; a content digest of those files is recorded at confirmation.
`steward memory freshness` (and every Guardian aggregate) re-checks the
digests:

- support files changed → memory is marked `STALE` (shown with a flag, ranked
  down, excluded from binding convention enforcement)
- support files reverted → the memory is restored to `ACTIVE`
- `steward memory confirm <id>` re-records the digest after a legitimate
  evolution of the supporting code

## Smart retrieval

`retrieveMemories` ranks memory deterministically against a task or question
— no embeddings, same inputs → same order:

1. **Authority** is the dominant term (policy outranks chat).
2. **Status penalty** keeps non-governing memory from outranking governing.
3. **Scope relevance**: touched files under the memory's scope target,
   expanded with the dependency graph's transitive dependents.
4. **Keyword overlap** with the query/task text.
5. **Recency**: confirmations decay after 30 days.

`formatMemoryBlock` renders the result into context packs within a budget,
labeling every line with its authority and status flags.

## Context Pack V2

Task and feature packs (Phase 2) now carry three V2 sections so any harness
starts from the same truth:

- **Project memory** — authority-ranked, budgeted to ~3000 chars
- **Latest handoff** — remaining work and warnings from the last agent
- **Accepted conventions** — the binding rules for this work

## Sessions and handoffs

A **session** (`SESS-NNN`) records what one agent did in one sitting under
one harness. A **handoff** (`HO-NNN`) is the cross-harness contract:

- `completed` — the outgoing agent's claims, with evidence refs
- `remaining` — the incoming agent's job
- `warnings` — traps: hidden coupling, flaky tests, secrets to never log
- `memoryIds` — durable truth to load first (validated to exist)
- `evidenceRefs` — ledger/evidence receipts backing the claims

Cross-harness consumption is data, not magic: every harness's skill
instructions point at the same `steward handoff latest`, so a Codex session
picks up exactly where a Claude session stopped. Sessions are idempotent
about state (`OPEN → HANDED_OFF / CLOSED`); closed sessions reject
annotations.

## `steward brief` and `steward ask`

- **`steward brief [--feature id]`** — the deterministic session-start
  briefing: active features, working-tree ownership note, the last handoff
  (rendered), governing memory, candidates awaiting acceptance, stale and
  conflicted memory, and evidence freshness for active features.
- **`steward ask "<question>"`** — deterministic Q&A over project truth.
  Answers cite authority (`[PROJECT_POLICY] …`) and provenance ("why:").
  If project truth is silent — or the question touches no recorded memory —
  Steward returns `noProjectTruth` (exit code 3) instead of inventing an
  answer.

## Guardian + ship-check integration

- **Guardian** (`§19`): `completeFeature` / `guardianAggregate` check changed
  files against **accepted** conventions and add violations as completion
  blockers. Statements with no deterministic check are still surfaced in
  briefs/ask — they just cannot block (honest limitation, never a fake pass).
  Stale memory is excluded from enforcement.
- **Ship-check**: a project-wide conventions check reports features that
  violate accepted conventions (WARN, non-blocking at release level).
- **Root causes** (`§9`): a debug session that reached VERIFY becomes
  `root-cause` memory at `VERIFIED_EVIDENCE` authority —
  `steward memory lesson record --debug DEBUG-001 --root-cause "…"`.
  `steward memory lesson pending` lists sessions whose lessons were never
  recorded.

## Security posture

- All free text is sanitized and secret-redacted on ingest (memory must never
  become a secret exfiltration or prompt-injection path) — covered by evals.
- Ids are validated before use as path/key material (`MEM-<AREA>-NNN`,
  `SESS-NNN`, `HO-NNN`).
- Every memory/handoff write lands in the hash-chained evidence ledger
  (`memory.recorded`, `memory.status`, `session.*`, `handoff.created`).
- State files are schema-versioned (`steward.memory.v1`,
  `steward.session.v1`, `steward.handoff.v1`).

## E2E evals

`packages/core/test/phase5-eval.test.ts` proves the properties end to end:

- candidates never govern; acceptance is explicit and authority-bounded
- conflicting frameworks produce scoped/honest candidates, not a universal rule
- support-file change stales memory; a reverted edit restores it
- **claude → codex handoff**: the next agent consumes the handoff, memory,
  and conventions through `brief` / context packs / `ask` — and an
  unrecorded question returns `noProjectTruth` instead of a guess
- Guardian blocks work violating accepted conventions
- secrets and injection framing never persist in memory
- id hygiene and session lifecycle enforcement
