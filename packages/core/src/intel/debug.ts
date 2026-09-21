import { listFeatures } from "../state/features.js";
import { validateDebugId, StateError } from "../state/ids.js";
import { getDebugSession, advanceDebugStage, listDebugSessions } from "../state/debug.js";
import { retrieveContext, impactOfChangedFiles, workingTreeChanges, isStewardOwned } from "./impact.js";
import { ensureIndex } from "./index.js";
import { buildDependencyMap } from "./graph.js";

/**
 * Repository-aware /debug: gives the debugging workflow real repository
 * signals — suspect files for the symptom, tests that exercise them, and
 * the change-impact of the current working tree. State discipline (the
 * DEBUG-NNN stage machine) stays in state/debug.ts; this adds the repo.
 */

export interface DebugContext {
  sessionId: string;
  stage: string;
  symptom: string;
  suspectFiles: Array<{ path: string; score: number; reason: string }>;
  impactedTests: string[];
  workingTreeChanges: string[];
  notes: string[];
  markdown: string;
}

export function debugContext(root: string, sessionId: string): DebugContext {
  validateDebugId(sessionId);
  const session = getDebugSession(root, sessionId);
  const index = ensureIndex(root);
  const map = buildDependencyMap(index);

  const retrieval = retrieveContext(root, session.symptom, 10);
  const suspectFiles = retrieval.files;

  const changes = workingTreeChanges(root).filter((c) => !isStewardOwned(c));
  const impact = changes.length > 0 ? impactOfChangedFiles(root, changes, index, map) : null;
  const impactedTests = impact?.impactedTests ?? [];

  const notes: string[] = [...retrieval.files.length ? [] : ["no files matched the symptom text — widen the symptom description"]];
  if (changes.length > 0 && impactedTests.length === 0) {
    notes.push("current working-tree changes have no test coverage — the regression test stage must add one");
  }
  if (session.stage === "REPRODUCE") {
    notes.push("reproduce the failure and record the exact command + output before hypothesizing");
  }

  const lines = [
    `# Debug context: ${session.id} (${session.stage})`,
    "",
    `Symptom: ${session.symptom}`,
    "",
    "## Suspect files (deterministic retrieval on symptom)",
    "",
    ...suspectFiles.map((f) => `- ${f.path} (score ${f.score} — ${f.reason})`),
    "",
    "## Tests exercising the current change set",
    "",
    ...(impactedTests.length ? impactedTests.map((t) => `- ${t}`) : ["- (none)"]),
    "",
    ...(notes.length ? ["## Notes", "", ...notes.map((n) => `- ${n}`)] : []),
  ];

  return {
    sessionId: session.id,
    stage: session.stage,
    symptom: session.symptom,
    suspectFiles,
    impactedTests,
    workingTreeChanges: changes,
    notes,
    markdown: lines.join("\n"),
  };
}

/** Convenience wrapper for the CLI: context before advancing a stage. */
export function debugContextForAdvance(root: string, sessionId: string, to: string): DebugContext {
  const ctx = debugContext(root, sessionId);
  // Guard: the stage machine still owns legality; this is context only.
  void to;
  return ctx;
}

export { advanceDebugStage, getDebugSession };

export function debugSessionOrThrow(root: string, sessionId: string) {
  try {
    return getDebugSession(root, sessionId);
  } catch {
    throw new StateError(`debug session '${sessionId}' not found`);
  }
}

export function featuresWithDebugSessions(root: string): string[] {
  const out: string[] = [];
  for (const f of listFeatures(root)) {
    try {
      const sessions = listDebugSessions(root, f.id);
      if (sessions.length > 0) out.push(f.id);
    } catch {
      /* feature without debug dir */
    }
  }
  return out;
}
