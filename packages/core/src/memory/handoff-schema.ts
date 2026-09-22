import { z } from "zod";

/**
 * Session + handoff schemas — versioned steward.session.v1 and
 * steward.handoff.v1. A session records what one agent did in one sitting;
 * a handoff is the contract the NEXT agent (any harness) consumes. Both are
 * project state, never conversational memory.
 */

export const SESSION_SCHEMA = "steward.session.v1";
export const HANDOFF_SCHEMA = "steward.handoff.v1";

export const SessionEntry = z.object({
  at: z.string().min(1),
  kind: z.enum(["note", "decision", "artifact", "evidence"]),
  text: z.string().max(1000),
});
export type SessionEntryT = z.infer<typeof SessionEntry>;

export const SessionRecord = z.object({
  schema: z.literal(SESSION_SCHEMA).default(SESSION_SCHEMA),
  id: z.string().min(1).max(64),
  featureId: z.string().optional(),
  /** Which harness the session ran under (claude, codex, cursor, …). */
  harness: z.string().min(1).max(40).default("unknown"),
  status: z.enum(["OPEN", "HANDED_OFF", "CLOSED"]).default("OPEN"),
  entries: z.array(SessionEntry).max(200).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type SessionRecordT = z.infer<typeof SessionRecord>;

export const SessionsFile = z.object({
  schema: z.literal(SESSION_SCHEMA).default(SESSION_SCHEMA),
  sessions: z.array(SessionRecord).default([]),
});
export type SessionsFileT = z.infer<typeof SessionsFile>;

export const HandoffRecord = z.object({
  schema: z.literal(HANDOFF_SCHEMA).default(HANDOFF_SCHEMA),
  id: z.string().min(1).max(64),
  featureId: z.string().optional(),
  fromSession: z.string().min(1),
  fromHarness: z.string().min(1).max(40).default("unknown"),
  createdAt: z.string().min(1),
  /** What was just completed — the outgoing agent's claim, with evidence refs. */
  completed: z.array(z.string().max(500)).default([]),
  /** What remains — the incoming agent's job. */
  remaining: z.array(z.string().max(500)).default([]),
  /** Traps for the next agent: wrong turns, hidden coupling, flaky tests. */
  warnings: z.array(z.string().max(500)).default([]),
  /** Memory ids the next agent must load first. */
  memoryIds: z.array(z.string().max(64)).default([]),
  /** Evidence/ledger references backing the completed items. */
  evidenceRefs: z.array(z.string().max(400)).default([]),
});
export type HandoffRecordT = z.infer<typeof HandoffRecord>;

export const HandoffsFile = z.object({
  schema: z.literal(HANDOFF_SCHEMA).default(HANDOFF_SCHEMA),
  handoffs: z.array(HandoffRecord).default([]),
});
export type HandoffsFileT = z.infer<typeof HandoffsFile>;
