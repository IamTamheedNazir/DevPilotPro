---
schema: steward.skill.v1
id: security
title: Security Review
version: 1.0.0
description: Reviews auth, authorization, secrets, injection, and data-sensitivity surfaces of a change before it can ship.
type: skill
risk: high
triggers:
  intents: [security-check, auth-review, is-it-safe]
outputs: [security-review]
profiles: [full, team]
---

# Security Review

Required before `/ship` for any HIGH/CRITICAL surface (per `/vibe` risk
classification): auth, authorization, payments, crypto, secrets, public
APIs, deletion, sensitive data.

## Process

1. **Scope the surface**: list the authz boundaries, inputs, secrets, and
   data touched by this change (from the spec's Security section and the
   actual diff — not from memory).
2. **Walk the checklist per finding area, with file:line evidence:**
   - **Authorization**: every privileged action checked server-side against
     the actor's rights. Object-level access control (ownership) on every
     record access. No trust in client-supplied role/tenant/id fields.
   - **Authentication**: session/token issuance, expiry, revocation,
     refresh handling. Password hashing with a vetted KDF; no home-made crypto.
   - **Input handling**: validation at the trust boundary, parameterized
     queries, output encoding, safe file handling, SSRF-safe fetching.
   - **Secrets**: none in code, logs, error messages, or client bundles.
     Rotation story exists. `.env` documented in `.env.example`, never committed.
   - **Data**: sensitive fields minimized and encrypted where required;
     deletion actually deletes; PII not leaked into logs or analytics.
   - **Rate/abuse**: expensive or public endpoints bounded (rate limit,
     quotas, size caps).
3. **Classify each finding**: blocker (exploitable, must fix before ship),
   hardening (fix soon), accepted-risk (documented with reason and owner).
4. **Verify, don't assume**: run the auth tests; attempt the forbidden
   action as a different tenant/user and capture the denial; grep for
   secret patterns; confirm headers/CORS config in the running app.
5. **Persist** the review in `.vibe/security/<date>-<slug>.md` with
   verdicts and evidence; append a ledger `evidence` record.

## Hard rules

- "It looks safe" is not a verdict. Every pass has a check with evidence.
- Blockers cannot be waved through by the authoring agent; they need the
  named fix or explicit human acceptance.
- Do not run live exploits against systems you do not own.

## Output

Findings table (area → status → evidence → disposition), the fix list for
blockers (routed to `/build`/`/debug`), and the recorded review file.
