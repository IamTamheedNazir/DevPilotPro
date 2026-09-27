import { readMemories, transitionMemory, type MemoryLifecycleAction } from "./store.js";
import { AUTHORITY_RANK, type MemoryAuthority, type MemoryRecordT, type MemoryStatus } from "./schema.js";
import { StateError } from "../state/ids.js";

/**
 * Authority and precedence rules (Phase 5 core rule).
 *
 * Precedence:
 *   PROJECT_POLICY > ACCEPTED_REQUIREMENT > VERIFIED_EVIDENCE >
 *   ACCEPTED_CONVENTION > LEARNED_CANDIDATE > AGENT_OBSERVATION >
 *   CONVERSATION
 *
 * A lower-authority memory can never override a higher-authority one. When
 * two records of comparable authority disagree, neither is silently applied:
 * the higher one wins for queries, and the conflict is surfaced, never hidden.
 */

export interface PrecedenceDecision {
  winner: MemoryRecordT | null;
  loser: MemoryRecordT | null;
  /** Why the winner won (authority ranks, statuses). */
  reason: string;
  /** True when the loser was demoted to CONFLICTED by this resolution. */
  conflicted: boolean;
}

export function authorityRank(a: MemoryAuthority): number {
  return AUTHORITY_RANK[a];
}

/** Only these statuses count as governing project truth. */
export function isGoverning(m: MemoryRecordT): boolean {
  return m.status === "ACTIVE" || m.status === "CONFLICTED";
}

/**
 * Resolve which memory governs between two candidates. Deterministic:
 *  1. governing status beats non-governing (STALE/SUPERSEDED/REJECTED/CANDIDATE
 *     only govern when nothing better exists — candidates never override ACTIVE)
 *  2. higher authority rank wins
 *  3. equal authority: more recently confirmed wins (fresher observation)
 */
export function resolvePrecedence(a: MemoryRecordT, b: MemoryRecordT): PrecedenceDecision {
  const aGov = isGoverning(a);
  const bGov = isGoverning(b);
  if (aGov !== bGov) {
    const winner = aGov ? a : b;
    const loser = aGov ? b : a;
    return {
      winner,
      loser,
      reason: `${winner.id} governs (${winner.status}); ${loser.id} is ${loser.status}`,
      conflicted: false,
    };
  }
  const ra = authorityRank(a.authority);
  const rb = authorityRank(b.authority);
  if (ra !== rb) {
    const winner = ra > rb ? a : b;
    const loser = ra > rb ? b : a;
    return {
      winner,
      loser,
      reason: `${winner.id} wins on authority (${winner.authority} > ${loser.authority})`,
      conflicted: ra <= AUTHORITY_RANK.LEARNED_CANDIDATE || rb <= AUTHORITY_RANK.LEARNED_CANDIDATE,
    };
  }
  const winner = a.lastConfirmedAt >= b.lastConfirmedAt ? a : b;
  const loser = winner === a ? b : a;
  return {
    winner,
    loser,
    reason: `equal authority ${a.authority}; ${winner.id} confirmed more recently (${winner.lastConfirmedAt})`,
    conflicted: false,
  };
}

/**
 * Find memories that contradict a proposed statement. Contradiction is
 * detected deterministically: same kind + overlapping scope + opposing
 * polarity on shared discriminative keywords.
 */
export function findContradictions(
  root: string,
  proposal: {
    kind: MemoryRecordT["kind"];
    scopes: MemoryRecordT["scopes"];
    statement: string;
    excludeId?: string;
  }
): MemoryRecordT[] {
  const memories = readMemories(root).memories;
  const proposalTerms = discriminativeTerms(proposal.statement);
  if (proposalTerms.length === 0) return [];
  const contradictions: MemoryRecordT[] = [];
  for (const m of memories) {
    if (m.id === proposal.excludeId) continue;
    if (m.status === "REJECTED" || m.status === "SUPERSEDED" || m.status === "STALE") continue;
    if (m.kind !== proposal.kind) continue;
    if (!scopesOverlap(m.scopes, proposal.scopes)) continue;
    const mTerms = discriminativeTerms(m.statement);
    if (mTerms.length === 0) continue;
    if (termsOppose(proposalTerms, mTerms)) contradictions.push(m);
  }
  return contradictions;
}

function scopesOverlap(
  a: MemoryRecordT["scopes"],
  b: MemoryRecordT["scopes"]
): boolean {
  for (const sa of a) {
    for (const sb of b) {
      if (sa.scope !== sb.scope) continue;
      if (sa.scope === "project") return true; // project-scope always overlaps
      if (sa.target === sb.target) return true;
      // directory/file containment
      if (
        (sa.scope === "directory" || sa.scope === "file") &&
        (sb.scope === "directory" || sb.scope === "file")
      ) {
        if (sa.target.startsWith(`${sb.target}/`) || sb.target.startsWith(`${sa.target}/`) || sa.target === sb.target) {
          return true;
        }
      }
    }
  }
  return false;
}

const NEGATIONS = new Set(["no", "not", "never", "without", "avoid", "dont", "dont", "forbid", "forbidden", "disallow"]);
const ASSERTIONS = new Set(["always", "must", "use", "uses", "require", "requires", "all", "every"]);

/**
 * Two statements oppose when their shared keywords carry opposite polarity:
 * one asserts ("always X", "use X") and the other negates ("never X", "no X").
 */
export function termsOppose(a: string[], b: string[]): boolean {
  const aNeg = new Set<string>();
  const aPos = new Set<string>();
  for (const t of a) {
    if (NEGATIONS.has(t)) aNeg.add(t);
    else if (ASSERTIONS.has(t)) aPos.add(t);
  }
  const shared = a.filter((t) => b.includes(t) && !NEGATIONS.has(t) && !ASSERTIONS.has(t));
  if (shared.length === 0) return false;
  const aNegates = a.some((t) => NEGATIONS.has(t));
  const bNegates = b.some((t) => NEGATIONS.has(t));
  const aAsserts = a.some((t) => ASSERTIONS.has(t));
  const bAsserts = b.some((t) => ASSERTIONS.has(t));
  void aNeg; void aPos;
  return shared.length >= 1 && aNegates !== bNegates && (aAsserts || bAsserts || aNegates || bNegates);
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "when", "then",
  "are", "was", "were", "has", "have", "had", "any", "all", "can", "will",
]);

/** Content words of a statement, for contradiction/overlap math. */
export function discriminativeTerms(statement: string): string[] {
  return [...new Set(
    statement
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  )];
}

/**
 * Demote every contradicting memory to CONFLICTED — never delete, never
 * auto-resolve. Contradictions are project-visible state.
 */
export function markContradicted(root: string, ids: string[], by: string): void {
  for (const id of ids) {
    transitionMemory(root, id, "conflict", { by });
  }
}

/**
 * Authority check used by writers: an actor cannot promote a learned
 * candidate above ACCEPTED_CONVENTION by writing it directly. Project policy
 * and evidence-derived memory enter through explicit, evidenced channels.
 */
export function assertWritableAuthority(
  authority: MemoryAuthority,
  provenanceKind: MemoryRecordT["provenance"]["kind"],
  actor: string
): void {
  if (authorityRank(authority) >= AUTHORITY_RANK.VERIFIED_EVIDENCE) {
    if (provenanceKind !== "human" && provenanceKind !== "guardian" && provenanceKind !== "security" && provenanceKind !== "qa" && provenanceKind !== "review") {
      throw new StateError(
        `actor '${actor}' cannot write ${authority} memory; authority at or above VERIFIED_EVIDENCE requires human or evidence-derived provenance`
      );
    }
  }
}

export type { MemoryStatus, MemoryLifecycleAction };
