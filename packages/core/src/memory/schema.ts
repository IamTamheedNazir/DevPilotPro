import { z } from "zod";

/**
 * Engineering memory schemas — versioned steward.memory.v1.
 *
 * Durable memory is project truth, not conversation history. Every record
 * carries explicit provenance (why does Steward believe this?) and an
 * authority level (how hard may it push against other claims?). Memory is
 * human-readable YAML under .steward/memory/, diffable and portable.
 */

export const MEMORY_SCHEMA = "steward.memory.v1";

export const MEMORY_KINDS = [
  "decision",
  "convention",
  "project-fact",
  "root-cause",
  "lesson",
  "workflow",
  "warning",
  "environment",
  "preference",
  "historical",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_AUTHORITIES = [
  "PROJECT_POLICY", // ADR / project policy — highest
  "ACCEPTED_REQUIREMENT", // accepted requirement or spec
  "VERIFIED_EVIDENCE", // recorded, fresh evidence
  "ACCEPTED_CONVENTION", // accepted learned convention
  "LEARNED_CANDIDATE", // observed pattern, not yet accepted
  "AGENT_OBSERVATION", // one agent's note
  "CONVERSATION", // chat context — lowest
] as const;
export type MemoryAuthority = (typeof MEMORY_AUTHORITIES)[number];

/** Numeric precedence: higher wins. Precedence is deterministic code. */
export const AUTHORITY_RANK: Readonly<Record<MemoryAuthority, number>> = {
  PROJECT_POLICY: 700,
  ACCEPTED_REQUIREMENT: 600,
  VERIFIED_EVIDENCE: 500,
  ACCEPTED_CONVENTION: 400,
  LEARNED_CANDIDATE: 300,
  AGENT_OBSERVATION: 200,
  CONVERSATION: 100,
};

export const MEMORY_SCOPES = [
  "project",
  "package",
  "directory",
  "file",
  "feature",
] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_STATUSES = [
  "CANDIDATE",
  "ACTIVE",
  "CONFLICTED",
  "SUPERSEDED",
  "STALE",
  "REJECTED",
] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MEMORY_PROVENANCE_KINDS = [
  "agent",
  "human",
  "guardian",
  "security",
  "qa",
  "debug",
  "convention-engine",
  "review",
] as const;
export type MemoryProvenanceKind = (typeof MEMORY_PROVENANCE_KINDS)[number];

export const MemoryProvenance = z.object({
  kind: z.enum(MEMORY_PROVENANCE_KINDS),
  /** Harness/actor that supplied it, e.g. claude, codex, cursor, human. */
  actor: z.string().min(1).max(80).default("unknown"),
  /** Deterministic facts that caused Steward to believe this. */
  basis: z.array(z.string().max(300)).default([]),
  /** Ledger or evidence reference, when memory derives from recorded runs. */
  evidenceRef: z.string().max(400).optional(),
  at: z.string().min(1),
});
export type MemoryProvenanceT = z.infer<typeof MemoryProvenance>;

export const MemoryScopeRef = z.object({
  scope: z.enum(MEMORY_SCOPES),
  /** package name / directory prefix / file path / feature id (scope-qualified). */
  target: z.string().max(300).default(""),
});
export type MemoryScopeRefT = z.infer<typeof MemoryScopeRef>;

export const MemoryRecord = z.object({
  schema: z.literal(MEMORY_SCHEMA).default(MEMORY_SCHEMA),
  id: z.string().min(1).max(64),
  kind: z.enum(MEMORY_KINDS),
  title: z.string().min(1).max(200),
  /** Sanitized, bounded statement of the memory. */
  statement: z.string().min(1).max(2000),
  authority: z.enum(MEMORY_AUTHORITIES),
  confidence: z.enum(["proven", "supported", "inferred"]).default("inferred"),
  status: z.enum(MEMORY_STATUSES).default("CANDIDATE"),
  scopes: z.array(MemoryScopeRef).min(1),
  provenance: MemoryProvenance,
  /** Memory ids this one supersedes / was superseded by. */
  supersedes: z.array(z.string()).default([]),
  supersededBy: z.array(z.string()).default([]),
  /** Files whose change can invalidate this memory (freshness support). */
  supportFiles: z.array(z.string()).max(200).default([]),
  /** Related feature/requirement/debug ids (traceability). */
  related: z.array(z.string().max(64)).default([]),
  createdAt: z.string().min(1),
  lastConfirmedAt: z.string().min(1),
  expiresAt: z.string().optional(),
});
export type MemoryRecordT = z.infer<typeof MemoryRecord>;

export const MemoriesFile = z.object({
  schema: z.literal(MEMORY_SCHEMA).default(MEMORY_SCHEMA),
  version: z.number().int().nonnegative().default(1),
  memories: z.array(MemoryRecord).default([]),
});
export type MemoriesFileT = z.infer<typeof MemoriesFile>;
