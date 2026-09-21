import {
  DEBUG_STAGES,
  DebugSessionConfig,
  type DebugSession,
  type DebugStage,
} from "./schema.js";
import { nextNumberFor, StateError, validateDebugId } from "./ids.js";
import { nowIso, readYaml, writeYaml } from "./store.js";
import { stewardPaths } from "./paths.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import * as fs from "node:fs";

const ACTOR = `steward-core@${VERSION}`;

export function createDebugSession(
  root: string,
  input: { symptom: string; featureId?: string }
): DebugSession {
  if (input.featureId) validateFeatureIdSafe(input.featureId);
  const p = stewardPaths(root);
  const dir = p.debugSessionsDir(input.featureId ?? null);
  const existing = listDebugSessions(root, input.featureId);
  const id = `DEBUG-${nextNumberFor("DEBUG", existing.map((s) => s.id))}`;
  const session: DebugSession = DebugSessionConfig.parse({
    id,
    featureId: input.featureId,
    symptom: input.symptom,
    stage: "REPRODUCE",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  fs.mkdirSync(dir, { recursive: true });
  writeYaml(`${dir}/${id}.yaml`, session);
  new Ledger(brainPaths(root).ledgerJsonl).append("debug.stage", ACTOR, id, {
    featureId: input.featureId ?? null,
    stage: "REPRODUCE",
    symptom: input.symptom.slice(0, 200),
  });
  return session;
}

function validateFeatureIdSafe(id: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
    throw new StateError(`invalid feature id '${id}'`);
  }
}

export function listDebugSessions(root: string, featureId?: string): DebugSession[] {
  const p = stewardPaths(root);
  const dir = p.debugSessionsDir(featureId ?? null);
  if (!fs.existsSync(dir)) return [];
  const out: DebugSession[] = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith(".yaml")) continue;
    const session = readYaml(`${dir}/${entry}`, DebugSessionConfig);
    if (session) out.push(session);
  }
  return out;
}

export function getDebugSession(root: string, id: string, featureId?: string): DebugSession {
  validateDebugId(id);
  const session = listDebugSessions(root, featureId).find((s) => s.id === id);
  if (!session) throw new StateError(`debug session '${id}' not found`);
  return session;
}

/**
 * Advance a debug session along REPRODUCE → … → VERIFY. Stage advancement
 * requires the stage's artifact to be filled in — no BUG → RANDOM EDIT →
 * CLAIM FIXED. Stage order is enforced; skipping is illegal.
 */
export function advanceDebugStage(
  root: string,
  id: string,
  to: DebugStage,
  patch: Partial<Pick<DebugSession, "reproduction" | "hypotheses" | "evidenceNotes" | "rootCause" | "regressionTest" | "resolution">>
): DebugSession {
  const session = getDebugSession(root, id);
  const from = session.stage;
  const fromIdx = DEBUG_STAGES.indexOf(from);
  const toIdx = DEBUG_STAGES.indexOf(to);
  if (toIdx === -1) throw new StateError(`unknown debug stage '${to}'`);
  if (toIdx !== fromIdx + 1) {
    throw new StateError(
      `debug stages must advance one at a time; from '${from}' the next stage is '${DEBUG_STAGES[fromIdx + 1] ?? "(end)"}'`
    );
  }
  const required: Partial<Record<DebugStage, string | string[]>> = {
    REPRODUCE: patch.reproduction ?? session.reproduction,
    HYPOTHESES: patch.hypotheses ?? session.hypotheses,
    EVIDENCE: patch.evidenceNotes ?? session.evidenceNotes,
    ROOT_CAUSE: patch.rootCause ?? session.rootCause,
    REGRESSION_TEST: patch.regressionTest ?? session.regressionTest,
    FIX: patch.resolution ?? session.resolution,
    VERIFY: patch.regressionTest ?? session.regressionTest,
  };
  const artifact = required[to];
  const empty =
    artifact === undefined ||
    (Array.isArray(artifact) ? artifact.length === 0 : artifact.trim().length === 0);
  if (empty) {
    throw new StateError(
      `stage '${to}' requires its artifact (e.g. reproduction text, hypotheses, root cause) — record evidence before advancing`
    );
  }
  Object.assign(session, patch);
  session.stage = to;
  session.updatedAt = nowIso();
  const p = stewardPaths(root);
  writeYaml(`${p.debugSessionsDir(session.featureId ?? null)}/${id}.yaml`, session);
  new Ledger(brainPaths(root).ledgerJsonl).append("debug.stage", ACTOR, id, {
    featureId: session.featureId ?? null,
    from,
    to,
  });
  return session;
}
