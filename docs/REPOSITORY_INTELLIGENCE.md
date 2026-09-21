# Repository Intelligence

Phase 3 gives Steward a deterministic model of the real repository. Every
analysis below is graph/keyword math over indexed files — same tree, same
result. No embeddings, no RAG, no model calls.

## The index

`steward intel index` builds `.steward/intel/index.json`
(`steward.intel.v1`): one entry per project source file with a SHA-256
content hash, size, test flag, and the project-relative paths it imports.

- Source files only (common code/config extensions); build/vendor/state
  directories (`node_modules`, `dist`, `.steward`, `.vibe`, …) are excluded.
- Import extraction is language-agnostic and conservative: TS/JS static and
  dynamic imports, `require`, and Python `import`/`from` forms, resolved to
  files that actually exist in the index (`.js` → `.ts` re-resolution
  included).
- `ensureIndex` rebuilds when the git revision changed **or** the on-disk
  file set no longer matches the index — uncommitted work-in-progress files
  are visible immediately, because WIP is exactly what Steward analyzes.

## Dependency map

`buildDependencyMap` turns the index into a directed graph:

- `dependencies[file]` — files it imports
- `dependents[file]` — files that import it (reverse edges)

On top of it:

- `transitiveDependents` — BFS closure of reverse edges
- `associatedTests` — test files that import a file directly or through the
  transitive closure ("which tests exercise this?")

## Change-impact analysis

`impactOfChangedFiles` maps a change set (explicit files or the git working
tree via `git status --porcelain -uall`) to:

- affected files (transitive importers, excluding the changed files)
- impacted tests — the blast radius to run
- notes, e.g. "no tests import the changed files — coverage gap"

```bash
steward intel impact            # working tree
steward intel impact src/x.ts   # explicit files
steward intel deps src/x.ts     # imports / imported-by / tests for one file
```

## Scope-drift detection

`detectScopeDrift` compares the change set with what the plan says should
change (tasks' `expectedFiles`, plus tests that import them, plus
requirement/feature keyword matches). Everything else is recorded as drift
with a reason: `not-expected`, `unrelated-to-requirements`, or `new-test`.
Drift is a finding for `/review`, not an error — but it is never silently
ignored.

## Targeted retrieval

`steward intel retrieve <query>` ranks files deterministically: name hits
(basename weighted) > content hits > dependency closure of the top hits.
The result includes a task context pack when the query is a `TASK-NNN` id.
This is the Phase 5 "smart retrieval" seed: deterministic today, upgradeable
later without changing the contract.

## Steward-owned paths are never analysis input

`.steward/` and `.vibe/` paths are filtered out of every change set before
analysis, so Steward's own state never shows up as "drift."
