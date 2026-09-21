import { createDebugSession } from "./state/debug.js";
import { getFinding, validateFindingId } from "./security/store.js";
import { listResults } from "./qa/store.js";
import { StateError } from "./state/ids.js";
import { ensureIndex } from "./intel/index.js";
import { buildDependencyMap, associatedTests } from "./intel/graph.js";
import { sanitizeText } from "./security/redact.js";

/**
 * §47/§48: a failed QA journey or an open security finding can seed a
 * structured /debug investigation. Steward creates the session with the
 * observed evidence in the symptom/context — it never auto-modifies code.
 */

export interface DebugLinkResult {
  sessionId: string;
  featureId?: string;
  summary: string;
}

export function debugFromQa(root: string, resultId: string): DebugLinkResult {
  const results = listResults(root);
  const result = results.find((r) => r.id === resultId || r.journeyId === resultId);
  if (!result) {
    throw new StateError(`QA result '${resultId}' not found`);
  }
  if (result.status === "PASS") {
    throw new StateError(`QA result '${resultId}' passed — nothing to debug`);
  }
  const failedVp = result.viewports.find((v) => v.status === "FAIL");
  const symptomParts = [
    `QA journey ${result.journeyId} failed (${failedVp?.failureClass ?? result.status}).`,
    failedVp ? `Viewport: ${failedVp.viewport}. Step: ${failedVp.failedStepIndex ?? "?"}. Message: ${failedVp.message}` : result.summary,
  ];
  for (const c of (failedVp?.console ?? []).filter((x) => x.type === "error").slice(0, 3)) {
    symptomParts.push(`Console: ${c.text}`);
  }
  for (const n of (failedVp?.network ?? []).filter((x) => x.status >= 500).slice(0, 3)) {
    symptomParts.push(`Network: ${n.method} ${n.url} → ${n.status}`);
  }
  const session = createDebugSession(root, {
    symptom: sanitizeText(symptomParts.join(" | "), 2000),
    featureId: result.featureId,
  });
  return {
    sessionId: session.id,
    featureId: result.featureId,
    summary: `debug session ${session.id} seeded from QA result ${result.id}; screenshots/traces referenced under .steward/qa/artifacts/${result.featureId}/ (investigate; Steward will not modify code automatically)`,
  };
}

export function debugFromSecurity(root: string, findingId: string): DebugLinkResult {
  validateFindingId(findingId);
  const finding = getFinding(root, findingId);
  const session = createDebugSession(root, {
    symptom: sanitizeText(
      `Security finding ${finding.id} (${finding.severity} ${finding.category}): ${finding.title} — file ${finding.file || "?"}${finding.line ? `:${finding.line}` : ""}. Basis: ${finding.basis.join("; ")}`,
      2000
    ),
    featureId: finding.featureId,
  });
  // Add repository signals: tests associated with the finding's file.
  const notes: string[] = [];
  if (finding.file) {
    try {
      const index = ensureIndex(root);
      const map = buildDependencyMap(index);
      const tests = associatedTests(index, map, finding.file);
      if (tests.length > 0) notes.push(`associated tests: ${tests.join(", ")}`);
      else notes.push(`no test imports ${finding.file} — coverage gap for this finding`);
    } catch {
      notes.push("repository index unavailable; run 'steward intel index'");
    }
  }
  return {
    sessionId: session.id,
    featureId: finding.featureId,
    summary: `debug session ${session.id} seeded from security finding ${finding.id}. ${notes.join("; ")}`,
  };
}
