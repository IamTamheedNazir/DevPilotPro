# Security Guardian

Phase 4 capability: determine whether an engineering change introduces
meaningful security risk, whether the required security verification
actually happened, and refuse false completion when it did not.

It is not a vulnerability dashboard, a pentest product, or a wrapper around
a scanner. The core capability is **relevance + evidence**: which security
checks does THIS change demand, what ran, what is still missing.

## The finding model (`steward.security.v1`)

Third-party scanner output is never stored raw. Everything is normalized
into `SecurityFinding` first (`packages/core/src/security/schema.ts`):

- `category` — secret, dependency, authorization, injection, xss, csrf,
  ssrf, file-upload, path-traversal, crypto, agent-execution, …
- `severity` — CRITICAL / HIGH / MEDIUM / LOW / INFO
- `confidence` — `proven` (a secret is present; a manifest pins a vulnerable
  version), `supported` (multiple independent signals agree), `inferred`
  (heuristic; the required confirmation is always named in `basis`)
- `source` — steward, osv, semgrep, project-tool, manual, other
- `basis[]` — the deterministic facts that caused Steward to believe this.
  Every finding answers "why does Steward believe this?"
- `dependencyReachable` — for dependency findings: PROVEN affected version,
  recorded (never assumed) reachability
- `status` — OPEN / RESOLVED / ACCEPTED_RISK / FALSE_POSITIVE
- `introducedBy` — CURRENT_CHANGE / PRE_EXISTING / UNKNOWN (baseline
  comparison; pre-existing findings are marked, never silently excused)

Secrets, credentials, and terminal escapes are redacted by the shared
redaction layer (`security/redact.ts`) before anything is persisted. A
finding may describe a secret; it never contains one.

## Change-aware classification (`§5`)

`classifySecuritySurface` asks what the change actually touches — changed
files (paths + content), the dependency graph, requirement text, and
project policy — and maps them to security areas (authentication,
authorization, tenant-isolation, payments, secret-handling, …) with
provenance for every area. From the areas it derives the required checks:

| Signal | Required check |
|---|---|
| always (policy-enabled) | `secretScan` (changed content, optionally staged/history) |
| manifest/dependency surface touched | `dependencyScan` (OSV if available) |
| auth/authz/tenant areas | `authorizationReview` |
| tenancy enabled + tenant/data surfaces | `tenantIsolation` |
| feature risk HIGH/CRITICAL | `threatModel` |

A copy-only change gets no heavy checks. Risk stays proportional.

## Review pipeline (`runSecurityReview`)

```
load feature → classify surface → secret scan → dependency scan (if relevant)
→ static scan (if semgrep configured/available) → authorization analysis
→ tenant-isolation check → normalize findings → persist review (verdict +
surfaceHash) → ledger record security.review.recorded
```

- Findings upsert by signature — re-running never duplicates.
- Authorization analysis combines identifiers, route/data-access shape, and
  write-verb structure. **Comments are stripped before analysis**: a comment
  claiming a permission check exists is not a permission check. Findings are
  labeled honestly (`inferred`) and always name the required confirmation
  (an authorization test or explicit human review).
- Verdict is `fail` when policy-blocked findings are open, any check FAILED,
  or required evidence is missing (e.g. an authorization-area change with no
  passing authorization-named test or recorded evidence).

## Policy (`.steward/project.yaml` `security:` block)

```yaml
security:
  block: { critical: true, high: true, medium: false }  # what blocks completion
  dependencyScan: { enabled: true }
  secretScan: { enabled: true, includeStaged: false, includeHistory: false }
  tenancy: { enabled: false, tenantKeys: [] }           # e.g. [organizationId]
  semgrepConfig: optional-path-or-ruleset
  requireReviewFor: []                                  # extra area triggers
```

`includeHistory` is only ever explicit — Steward never scans git history
unbidden. Accepted risks require a written reason and create an exception
(with optional expiry; expired exceptions reactivate their finding). Agents
cannot accept risk on a project's behalf — `setFindingStatus` refuses
agent actors for ACCEPTED_RISK.

## Where it bites

`gates.securityReview` in the Definition-of-Done (`verification/gates.ts`)
is required when the feature demands it, risk is HIGH/CRITICAL, or
unresolved blocker findings exist. It fails on open blockers, is MISSING
without recorded (fresh) review evidence, and PASSes only on current
evidence. Security evidence carries a `surfaceHash` — code changing after
a passing review makes the evidence STALE and the gate reverts.

## CLI

```bash
steward security review <feature>        # run the pipeline; verdict is the gate
steward security findings [feature]      # list; --set-status RESOLVED|ACCEPTED_RISK|...
steward security baseline                # capture pre-existing fingerprint baseline
steward security exceptions              # list accepted-risk exceptions
steward security threat-model <feature>  # generate/inspect the scenario model
steward security capabilities            # which scanners are actually available
```

State lives under `.steward/security/` (`reviews/`, `findings/`,
`exceptions.yaml`, `baseline.yaml`, threat models) — human-readable,
diffable, secret-free.
