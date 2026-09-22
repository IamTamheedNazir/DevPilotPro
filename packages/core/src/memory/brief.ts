import { readMemories, getMemory, transitionMemory } from "./store.js";
import { retrieveMemories, formatMemoryBlock } from "./retrieval.js";
import { latestHandoff, handoffMarkdown } from "./handoff-store.js";
import { listFeatures } from "../state/features.js";
import { listRequirements } from "../state/requirements.js";
import { listTasks } from "../state/tasks.js";
import type { MemoryRecordT } from "./schema.js";
import { workingTreeChanges, isStewardOwned } from "../intel/impact.js";
import { sanitizeAndRedact } from "../security/redact.js";
import { checkFreshness } from "../intel/freshness.js";

/**
 * `steward brief` (§17) — the deterministic briefing any agent (or human)
 * reads at session start: who worked here last, what state the project is
 * in, which memory governs, and what the next agent must do.
 *
 * `steward ask` (§18) — deterministic question answering over project truth:
 * decisions, facts, conventions, blockers. It answers from memory with
 * authority labels and never invents an answer when project truth is silent.
 */

export interface Brief {
  markdown: string;
  memoryCount: number;
  governingCount: number;
  handoffId: string | null;
}

export function briefProject(root: string, featureId?: string): Brief {
  const features = listFeatures(root);
  const active = features.filter((f) => ["PLANNED", "IMPLEMENTING", "VERIFYING", "BLOCKED"].includes(f.state));
  const handoff = latestHandoff(root, featureId);
  const memory = readMemories(root).memories;
  const governing = memory.filter((m) => m.status === "ACTIVE" || m.status === "CONFLICTED");
  const candidates = memory.filter((m) => m.status === "CANDIDATE");
  const stale = memory.filter((m) => m.status === "STALE");
  const conflicted = memory.filter((m) => m.status === "CONFLICTED");
  const changed = workingTreeChanges(root).filter((c) => !isStewardOwned(c));

  const lines: string[] = [
    "# Steward brief",
    "",
    `Features: ${features.length} total, ${active.length} active (${active.map((f) => `${f.id}:${f.state}`).join(", ") || "none"})`,
    `Working tree: ${changed.length === 0 ? "clean" : `${changed.length} changed file(s) — not yours to discard`}`,
    "",
    "## Last handoff",
    "",
  ];
  if (handoff) {
    lines.push(...handoffMarkdown(root, handoff).split("\n"));
  } else {
    lines.push("(no handoff recorded — this may be the first session)");
  }
  lines.push("", "## Memory that governs this project", "");
  if (governing.length === 0) {
    lines.push("(no governing memory yet — run 'steward memory learn' after patterns exist)");
  } else {
    for (const m of governing.slice(0, 15)) {
      const flag = m.status === "CONFLICTED" ? " [CONFLICTED]" : "";
      lines.push(`- [${m.authority}${flag}] ${m.title} (${m.id}) — ${m.statement}`);
    }
  }
  if (candidates.length > 0) {
    lines.push("", `### Learned candidates awaiting acceptance (${candidates.length})`, "");
    for (const m of candidates.slice(0, 8)) {
      lines.push(`- ${m.title} (${m.id}) — ${m.statement}`);
    }
    lines.push("", "Candidates become project truth only when accepted: `steward memory accept <id>`.");
  }
  if (stale.length > 0) {
    lines.push("", `### Stale memory (${stale.length}) — re-confirm or reject`, "");
    for (const m of stale.slice(0, 8)) lines.push(`- ${m.title} (${m.id})`);
  }
  if (conflicted.length > 0) {
    lines.push("", `### Conflicted memory (${conflicted.length}) — resolve explicitly`, "");
    for (const m of conflicted.slice(0, 8)) lines.push(`- ${m.title} (${m.id})`);
  }
  // Evidence freshness snapshot per active feature.
  if (active.length > 0) {
    lines.push("", "## Evidence freshness (active features)", "");
    for (const f of active.slice(0, 10)) {
      const fresh = checkFreshness(root, f.id, "verification.run");
      lines.push(`- ${f.id}: verification evidence ${fresh.freshness}`);
    }
  }
  return {
    markdown: lines.join("\n"),
    memoryCount: memory.length,
    governingCount: governing.length,
    handoffId: handoff?.id ?? null,
  };
}

export interface AskAnswer {
  answer: string;
  memories: MemoryRecordT[];
  /** True when project truth had nothing to say (agent must not guess). */
  noProjectTruth: boolean;
}

const QUESTION_STOP = new Set([
  "what", "which", "who", "how", "why", "when", "where", "is", "are", "does",
  "do", "did", "the", "a", "an", "of", "to", "in", "on", "for", "with", "and",
  "or", "should", "can", "we", "i", "my", "our", "this", "that", "it", "there",
]);

/**
 * `steward ask <question>`: rank memory against the question, answer with
 * the highest-authority governing statements, and label everything with its
 * authority. A question the project has no truth about returns
 * noProjectTruth instead of a plausible fabrication.
 */
export function askProject(root: string, question: string, opts: { files?: string[]; featureId?: string } = {}): AskAnswer {
  const q = sanitizeAndRedact(question, 500);
  const terms = [...new Set(
    q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !QUESTION_STOP.has(w))
  )];
  const retrieved = retrieveMemories(root, {
    text: terms.join(" "),
    files: opts.files,
    featureId: opts.featureId,
    limit: 8,
    includeCandidates: false,
  });
  const governing = retrieved.filter(
    (r) => r.memory.status === "ACTIVE" || r.memory.status === "CONFLICTED"
  );
  // No governing memory at all, or nothing the question actually touches —
  // both mean project truth is silent. Answering anyway would be invention.
  const anyKeywordMatch = governing.some(
    (r) => r.reasons.some((reason) => reason.includes("keyword match"))
  );
  if (governing.length === 0 || (terms.length > 0 && !anyKeywordMatch)) {
    return {
      answer:
        "No project truth answers this question yet. Do not guess: record the decision with 'steward memory add' once it is made, so the next agent inherits it.",
      memories: [],
      noProjectTruth: true,
    };
  }
  const lines: string[] = [];
  for (const { memory: m } of governing.slice(0, 5)) {
    const flag = m.status === "CONFLICTED" ? " [CONFLICTED — resolve before relying on this]" : "";
    lines.push(`- [${m.authority}${flag}] ${m.statement} (${m.id})`);
    if (m.provenance.basis.length > 0) {
      lines.push(`  - why: ${m.provenance.basis.slice(0, 2).join("; ")}`);
    }
  }
  lines.push("", formatMemoryBlock(governing.slice(0, 5), 2500));
  return { answer: lines.join("\n").trim(), memories: governing.map((r) => r.memory), noProjectTruth: false };
}

// Re-exports for CLI wiring (memory lifecycle entry points).
export { transitionMemory, getMemory, listRequirements, listTasks };
