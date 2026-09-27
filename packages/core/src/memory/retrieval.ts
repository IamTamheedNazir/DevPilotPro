import { readMemories } from "./store.js";
import { AUTHORITY_RANK, type MemoryRecordT } from "./schema.js";
import { isGoverning, discriminativeTerms } from "./authority.js";
import { ensureIndex, type RepoIndex } from "../intel/index.js";
import { buildDependencyMap, transitiveDependents, type DependencyMap } from "../intel/graph.js";
import { isStewardOwned } from "../intel/impact.js";

/**
 * Smart retrieval (Phase 5 §10–§11): deterministic ranking of durable memory
 * against a query/task. Ranking combines authority (policy outranks chat),
 * recency of confirmation, and task relevance (scope + keyword overlap with
 * the files the task actually touches). No embeddings — same inputs, same
 * ranking, same order.
 */

export interface RetrievedMemory {
  memory: MemoryRecordT;
  score: number;
  reasons: string[];
}

export interface RetrievalQuery {
  text?: string;
  /** Files the work will touch (project-relative) — drives scope relevance. */
  files?: string[];
  featureId?: string;
  /** Only ACTIVE + CONFLICTED memory by default. */
  includeCandidates?: boolean;
  limit?: number;
}

const STATUS_PENALTY: Record<string, number> = {
  ACTIVE: 0,
  CONFLICTED: -1.5,
  CANDIDATE: -2.5,
  STALE: -4,
  SUPERSEDED: -6,
  REJECTED: -999,
};

export function retrieveMemories(root: string, query: RetrievalQuery): RetrievedMemory[] {
  const memories = readMemories(root).memories;
  const limit = query.limit ?? 12;
  const queryTerms = query.text ? new Set(discriminativeTerms(query.text)) : null;
  const fileSet = new Set((query.files ?? []).map((f) => f.replace(/\\/g, "/")));

  // Expand touched files with their transitive dependents for scope proximity.
  let index: RepoIndex | null = null;
  let map: DependencyMap | null = null;
  if (fileSet.size > 0) {
    try {
      index = ensureIndex(root);
      map = buildDependencyMap(index);
    } catch {
      index = null;
    }
  }
  const proximity = new Map<string, number>();
  for (const f of fileSet) {
    proximity.set(f, 2);
    if (map) {
      for (const d of transitiveDependents(map, f).slice(0, 50)) {
        proximity.set(d, Math.max(proximity.get(d) ?? 0, 1));
      }
    }
  }

  const scored: RetrievedMemory[] = [];
  for (const m of memories) {
    if (!query.includeCandidates && m.status === "CANDIDATE") continue;
    if (m.status === "REJECTED" || m.status === "SUPERSEDED") continue;
    const reasons: string[] = [];
    let score = 0;

    // Authority is the dominant term.
    score += AUTHORITY_RANK[m.authority] / 100;
    reasons.push(`authority ${m.authority}`);

    // Status penalty keeps non-governing memory from outranking governing.
    score += STATUS_PENALTY[m.status] ?? -3;
    if (m.status !== "ACTIVE") reasons.push(`status ${m.status}`);

    // Recency: confirmations age; very old confirmations decay slightly.
    const ageDays = (Date.now() - Date.parse(m.lastConfirmedAt)) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays > 30) {
      score -= Math.min(2, (ageDays - 30) / 90);
      reasons.push(`confirmed ${Math.round(ageDays)}d ago`);
    }

    // Scope relevance: touched files under the memory's scope target.
    let scopeHit = false;
    for (const s of m.scopes) {
      if (s.scope === "project") {
        scopeHit = true;
        continue;
      }
      for (const f of fileSet) {
        if (
          (s.scope === "file" && s.target === f) ||
          (s.scope === "directory" && (f === s.target || f.startsWith(`${s.target}/`))) ||
          (s.scope === "package" && (f === s.target || f.startsWith(`${s.target}/`))) ||
          (s.scope === "feature" && s.target === (query.featureId ?? ""))
        ) {
          scopeHit = true;
          break;
        }
      }
      // Dependency proximity: memory scoped to a file that imports/imports-from touched files.
      if (!scopeHit && index && map && (s.scope === "file" || s.scope === "directory" || s.scope === "package")) {
        for (const f of fileSet) {
          if (proximity.has(s.target) || (s.scope !== "file" && (s.target === "" || f.startsWith(s.target)))) {
            scopeHit = true;
            break;
          }
        }
      }
    }
    if (scopeHit && fileSet.size > 0) {
      score += 2;
      reasons.push("scope matches touched files");
    }

    // Keyword relevance against the query text.
    if (queryTerms && queryTerms.size > 0) {
      const terms = discriminativeTerms(`${m.title} ${m.statement}`);
      const shared = terms.filter((t) => queryTerms.has(t)).length;
      if (shared > 0) {
        score += Math.min(3, shared * 0.75);
        reasons.push(`${shared} keyword match(es)`);
      }
    }

    // Confidence nudges within the same authority band.
    if (m.confidence === "proven") score += 0.5;
    else if (m.confidence === "supported") score += 0.25;

    scored.push({ memory: m, score, reasons });
  }

  return scored
    .sort((a, b) => b.score - a.score || (a.memory.id < b.memory.id ? -1 : 1))
    .slice(0, limit);
}

/**
 * Format retrieved memory for a context pack — bounded, ordered, explicit
 * about authority. CONFLICTED entries are shown with both sides' ids so the
 * agent sees the dispute instead of a fake consensus.
 */
export function formatMemoryBlock(entries: RetrievedMemory[], maxChars = 4000): string {
  if (entries.length === 0) return "";
  const lines: string[] = ["## Project memory (authoritative first)", ""];
  let used = lines.join("\n").length;
  for (const { memory: m, reasons } of entries) {
    const flag =
      m.status === "CONFLICTED"
        ? " [CONFLICTED]"
        : m.status === "STALE"
          ? " [STALE]"
          : m.status === "CANDIDATE"
            ? " [candidate]"
            : "";
    const line = `- [${m.authority}${flag}] ${m.title} (${m.id}) — ${m.statement}${reasons.length ? ` :: ${reasons.slice(0, 2).join(", ")}` : ""}`;
    if (used + line.length > maxChars) {
      lines.push("- … (memory truncated to budget)");
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  lines.push("");
  return lines.join("\n");
}

export function governingMemories(root: string): MemoryRecordT[] {
  return readMemories(root).memories.filter(isGoverning);
}

export { isStewardOwned };
