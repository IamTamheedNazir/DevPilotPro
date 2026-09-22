import * as fs from "node:fs";
import {
  SessionRecord,
  SessionsFile,
  HandoffRecord,
  HandoffsFile,
  SESSION_SCHEMA,
  HANDOFF_SCHEMA,
  type SessionRecordT,
  type HandoffRecordT,
} from "./handoff-schema.js";
import { nowIso, readYaml, writeYaml } from "../state/store.js";
import { StateError } from "../state/ids.js";
import { stewardPaths } from "../state/paths.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { sanitizeAndRedact } from "../security/redact.js";
import { validateMemoryId } from "./store.js";

/**
 * Session + handoff store (Phase 5 §14–§16). Sessions record what happened
 * in one agent sitting; handoffs are the cross-harness contract consumed by
 * the next agent. Cross-harness consumption is data, not magic: every
 * harness's skill instructions point at the same `steward handoff latest`
 * command, so a Codex session picks up exactly where a Claude session
 * stopped. All free text is sanitized/redacted on ingest.
 */

const ACTOR = `steward-core@${VERSION}`;
const SESSION_ID_RE = /^SESS-\d{3}$/;
const HANDOFF_ID_RE = /^HO-\d{3}$/;

export function validateSessionId(id: string): string {
  if (!SESSION_ID_RE.test(id)) throw new StateError(`invalid session id '${id}': must match SESS-NNN`);
  return id;
}

export function validateHandoffId(id: string): string {
  if (!HANDOFF_ID_RE.test(id)) throw new StateError(`invalid handoff id '${id}': must match HO-NNN`);
  return id;
}

// ─── sessions ────────────────────────────────────────────────────────────

function sessionsFileOf(root: string): string {
  return `${stewardPaths(root).dir}/sessions/sessions.yaml`;
}

export function listSessions(root: string): SessionRecordT[] {
  const p = sessionsFileOf(root);
  if (!fs.existsSync(p)) return [];
  return readYaml(p, SessionsFile)?.sessions ?? [];
}

export function getSession(root: string, id: string): SessionRecordT {
  validateSessionId(id);
  const s = listSessions(root).find((x) => x.id === id);
  if (!s) throw new StateError(`session '${id}' not found`);
  return s;
}

export function openSession(
  root: string,
  input: { harness: string; featureId?: string }
): SessionRecordT {
  if (input.featureId) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(input.featureId)) {
      throw new StateError(`invalid feature id '${input.featureId}'`);
    }
  }
  const sessions = listSessions(root);
  const n = sessions.reduce((max, s) => {
    const v = Number.parseInt(s.id.slice("SESS-".length), 10);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0);
  const now = nowIso();
  const session: SessionRecordT = SessionRecord.parse({
    id: `SESS-${String(n + 1).padStart(3, "0")}`,
    featureId: input.featureId,
    harness: input.harness.slice(0, 40),
    status: "OPEN",
    entries: [],
    createdAt: now,
    updatedAt: now,
  });
  sessions.push(session);
  writeYaml(sessionsFileOf(root), { schema: SESSION_SCHEMA, sessions });
  new Ledger(brainPaths(root).ledgerJsonl).append("session.opened", ACTOR, session.id, {
    harness: session.harness,
    featureId: session.featureId ?? null,
  });
  return session;
}

export type SessionEntryKind = SessionRecordT["entries"][number]["kind"];

export function annotateSession(
  root: string,
  id: string,
  entry: { kind: SessionEntryKind; text: string }
): SessionRecordT {
  const sessions = listSessions(root);
  const s = sessions.find((x) => x.id === validateSessionId(id));
  if (!s) throw new StateError(`session '${id}' not found`);
  if (s.status === "CLOSED") throw new StateError(`session '${id}' is CLOSED`);
  s.entries.push({
    at: nowIso(),
    kind: entry.kind,
    text: sanitizeAndRedact(entry.text, 1000),
  });
  if (s.entries.length > 200) s.entries.splice(0, s.entries.length - 200);
  s.updatedAt = nowIso();
  writeYaml(sessionsFileOf(root), { schema: SESSION_SCHEMA, sessions });
  return s;
}

export function closeSession(root: string, id: string): SessionRecordT {
  const sessions = listSessions(root);
  const s = sessions.find((x) => x.id === validateSessionId(id));
  if (!s) throw new StateError(`session '${id}' not found`);
  s.status = "CLOSED";
  s.updatedAt = nowIso();
  writeYaml(sessionsFileOf(root), { schema: SESSION_SCHEMA, sessions });
  return s;
}

// ─── handoffs ────────────────────────────────────────────────────────────

function handoffsFileOf(root: string): string {
  return `${stewardPaths(root).dir}/handoffs/handoffs.yaml`;
}

export function listHandoffs(root: string): HandoffRecordT[] {
  const p = handoffsFileOf(root);
  if (!fs.existsSync(p)) return [];
  return readYaml(p, HandoffsFile)?.handoffs ?? [];
}

export function getHandoff(root: string, id: string): HandoffRecordT {
  validateHandoffId(id);
  const h = listHandoffs(root).find((x) => x.id === id);
  if (!h) throw new StateError(`handoff '${id}' not found`);
  return h;
}

export interface CreateHandoffInput {
  fromSession: string;
  fromHarness: string;
  featureId?: string;
  completed?: string[];
  remaining?: string[];
  warnings?: string[];
  memoryIds?: string[];
  evidenceRefs?: string[];
}

export function createHandoff(root: string, input: CreateHandoffInput): HandoffRecordT {
  const session = getSession(root, input.fromSession);
  if (session.status === "CLOSED") {
    throw new StateError(`session '${session.id}' is already CLOSED`);
  }
  for (const mid of input.memoryIds ?? []) {
    validateMemoryId(mid); // referential integrity: handoffs point at real memory
  }
  const handoffs = listHandoffs(root);
  const n = handoffs.reduce((max, h) => {
    const v = Number.parseInt(h.id.slice("HO-".length), 10);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0);
  const clean = (list?: string[]) => (list ?? []).map((s) => sanitizeAndRedact(s, 500)).slice(0, 50);
  const now = nowIso();
  const handoff: HandoffRecordT = HandoffRecord.parse({
    id: `HO-${String(n + 1).padStart(3, "0")}`,
    featureId: input.featureId ?? session.featureId,
    fromSession: session.id,
    fromHarness: input.fromHarness.slice(0, 40),
    createdAt: now,
    completed: clean(input.completed),
    remaining: clean(input.remaining),
    warnings: clean(input.warnings),
    memoryIds: [...new Set(input.memoryIds ?? [])].slice(0, 50),
    evidenceRefs: clean(input.evidenceRefs),
  });
  handoffs.push(handoff);
  writeYaml(handoffsFileOf(root), { schema: HANDOFF_SCHEMA, handoffs });

  session.status = "HANDED_OFF";
  session.updatedAt = nowIso();
  const sessions = listSessions(root);
  const s = sessions.find((x) => x.id === session.id)!;
  s.status = "HANDED_OFF";
  s.updatedAt = nowIso();
  writeYaml(sessionsFileOf(root), { schema: SESSION_SCHEMA, sessions });

  new Ledger(brainPaths(root).ledgerJsonl).append("handoff.created", ACTOR, handoff.id, {
    featureId: handoff.featureId ?? null,
    fromSession: handoff.fromSession,
    fromHarness: handoff.fromHarness,
    remaining: handoff.remaining.length,
  });
  return handoff;
}

/** The handoff the next agent should consume (most recent, HANDED_OFF origin). */
export function latestHandoff(root: string, featureId?: string): HandoffRecordT | null {
  const all = listHandoffs(root).filter((h) => !featureId || h.featureId === featureId);
  return all.length > 0 ? all[all.length - 1] : null;
}

/**
 * Render the handoff brief the incoming agent reads first. Deterministic
 * markdown; every claim is traceable to evidence refs or memory ids.
 */
export function handoffMarkdown(root: string, handoff: HandoffRecordT): string {
  void root;
  const lines = [
    `# Handoff ${handoff.id}`,
    "",
    `From: ${handoff.fromHarness} (session ${handoff.fromSession}) at ${handoff.createdAt}`,
    handoff.featureId ? `Feature: ${handoff.featureId}` : "",
    "",
    "## Completed (with evidence)",
    "",
    ...(handoff.completed.length ? handoff.completed.map((c) => `- ${c}`) : ["- (nothing recorded)"]),
    "",
    "## Remaining work",
    "",
    ...(handoff.remaining.length ? handoff.remaining.map((r) => `- ${r}`) : ["- (nothing recorded)"]),
    "",
    "## Warnings for the next agent",
    "",
    ...(handoff.warnings.length ? handoff.warnings.map((w) => `- ${w}`) : ["- (none)"]),
    "",
    ...(handoff.memoryIds.length
      ? ["## Memory to load first", "", ...handoff.memoryIds.map((m) => `- ${m}`), ""]
      : []),
    ...(handoff.evidenceRefs.length
      ? ["## Evidence", "", ...handoff.evidenceRefs.map((e) => `- ${e}`), ""]
      : []),
  ];
  return lines.filter((l) => l !== "").join("\n");
}
