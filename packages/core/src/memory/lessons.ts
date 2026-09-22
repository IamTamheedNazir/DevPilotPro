import { addMemory, readMemories } from "./store.js";
import type { MemoryRecordT } from "./schema.js";
import { createDebugSession, listDebugSessions } from "../state/debug.js";
import { validateFeatureId } from "../state/ids.js";
import { sanitizeAndRedact } from "../security/redact.js";

/**
 * Root-cause memory integration (Phase 5 §9): when a debug session reaches
 * VERIFY with a recorded root cause, that cause becomes durable lesson
 * memory — the next agent must not rediscover the same bug from zero.
 */

export interface RootCauseMemoryInput {
  sessionId: string;
  rootCause: string;
  resolution?: string;
  affectedFiles?: string[];
}

export function recordRootCauseMemory(
  root: string,
  input: RootCauseMemoryInput
): MemoryRecordT {
  const sessions = listDebugSessions(root);
  const session = sessions.find((s) => s.id === input.sessionId);
  if (!session) {
    throw new Error(`debug session '${input.sessionId}' not found`);
  }
  const statement = [
    `Root cause (${session.id}): ${input.rootCause}`,
    input.resolution ? `Resolution: ${input.resolution}` : "",
    `Symptom was: ${session.symptom}`,
  ]
    .filter(Boolean)
    .join(" ");
  return addMemory(root, {
    area: "RC",
    kind: "root-cause",
    title: `Root cause from ${session.id}`.slice(0, 200),
    statement,
    authority: "VERIFIED_EVIDENCE",
    confidence: "proven",
    status: "ACTIVE",
    scopes: [{ scope: session.featureId ? "feature" : "project", target: session.featureId ?? "" }],
    provenance: {
      kind: "debug",
      actor: "debug-session",
      basis: [
        `debug session ${session.id} reached VERIFY with recorded root cause`,
        ...(session.regressionTest ? [`regression test: ${session.regressionTest}`] : []),
      ],
    },
    supportFiles: (input.affectedFiles ?? []).slice(0, 50),
    related: [session.id, ...(session.featureId ? [session.featureId] : [])],
  });
}

/** Lessons from completed debug sessions that never got memory recorded. */
export function pendingRootCauses(root: string): string[] {
  const sessions = listDebugSessions(root);
  const memories = readMemories(root).memories;
  return sessions
    .filter((s) => s.stage === "VERIFY" && s.rootCause && !memories.some((m) => m.related.includes(s.id)))
    .map((s) => s.id);
}

/** QA lesson: persist a verified QA outcome as lesson memory. */
export function recordQaLesson(
  root: string,
  input: { title: string; statement: string; featureId?: string; basis?: string[] }
): MemoryRecordT {
  if (input.featureId) validateFeatureId(input.featureId);
  return addMemory(root, {
    area: "LESSON",
    kind: "lesson",
    title: sanitizeAndRedact(input.title, 200),
    statement: sanitizeAndRedact(input.statement, 2000),
    authority: "VERIFIED_EVIDENCE",
    confidence: "supported",
    status: "ACTIVE",
    scopes: [{ scope: input.featureId ? "feature" : "project", target: input.featureId ?? "" }],
    provenance: { kind: "qa", actor: "qa", basis: input.basis ?? ["recorded QA outcome"] },
    related: input.featureId ? [input.featureId] : [],
  });
}

// Convenience re-exports so consumers can seed debug sessions directly.
export { createDebugSession };
