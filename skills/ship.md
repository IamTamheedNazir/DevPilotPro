---
schema: steward.skill.v1
id: ship
title: Ship With a Rollback
version: 1.0.0
description: Drives preflight gates, obtains explicit human approval for the irreversible step, deploys with health-check evidence, and records the rollback plan.
type: skill
risk: critical
triggers:
  intents: [deploy, release, ship-it, go-live]
outputs: [release-record, deploy-evidence, rollback-plan]
profiles: [builder, full, team]
---

# Ship With a Rollback

Deployment is the irreversible boundary. Nothing ships without green gates,
a rollback plan, and explicit human approval.

## Process

1. **Preflight (all green, with evidence, no exceptions):**
   - full verify suite from `/verify` on the exact commit being shipped
     (typecheck, tests, build);
   - `/security` review passed for every HIGH/CRITICAL surface in the release;
   - migrations rehearsed on production-like data, with the down-path proven;
   - `.env.example` matches what the target environment actually needs;
   - release notes drafted from merged work (user-visible changes first).
2. **Write the rollback plan** before deploying: the previous known-good
   version, how to restore it (re-deploy, revert commit, migration down),
   data-loss implications of each path, and who executes it.
3. **Human approval.** State exactly what will happen (what deploys where,
   what data is touched) and wait for the user's explicit yes. Autonomous
   mode does NOT override this gate; audit mode never deploys.
4. **Deploy the smallest reversible step**: feature flags over big-bang,
   staged rollout where the platform allows. Execute the deploy command and
   capture its real output — never paraphrase a deploy as successful.
5. **Post-deploy health checks with evidence**: health endpoint response,
   key journeys exercised against production (via `/qa` if UI), error
   rates/logs watched for the agreed soak period, migrations applied
   (verify schema, not logs).
6. **Record the release** in `.vibe/decisions/` or a release log: version,
   commit, evidence links, rollback plan status. Append ledger `evidence`
   and `note` records.
7. **On failure**: execute the rollback plan immediately, capture evidence,
   open a `/debug` task. Communicate state before investigating.

## Hard rules

- No deploy without the preflight evidence in hand, in this session.
- No deploy command invented from memory — use the project's documented
  deploy path (verified by `/docs`), or ask.
- Never mark "deployed" without post-deploy health evidence.

## Output

Release record (version/commit), preflight evidence table, deploy command
output, health-check results, rollback plan location, and current live state.
