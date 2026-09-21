import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { getFeature, requiredGatesFor, refreshRisk } from "../state/features.js";
import { listRequirements } from "../state/requirements.js";
import { listTasks } from "../state/tasks.js";
import { openBlockers, readReview } from "../state/review.js";
import { listJourneys, journeyFreshness, latestResult } from "../qa/store.js";
import { readFindings, exceptedFindingIds } from "../security/store.js";
import { readSecurityPolicy } from "../security/policy.js";
import { resolveCommands } from "./commands.js";
import { checkFreshness } from "../intel/freshness.js";
import { guardFeature } from "../guardian.js";
import type { ResultCategory } from "./result.js";

/**
 * Definition-of-Done engine. A feature becomes COMPLETE only when every
 * REQUIRED gate has passing, observed evidence — never because an agent
 * claims the work is done.
 */

export type GateStatus = "PASS" | "FAIL" | "MISSING" | "NOT_REQUIRED";

export interface GateReport {
  id: string;
  title: string;
  status: GateStatus;
  detail: string;
  evidence?: string[];
}

export interface VerificationVerdict {
  verdict: "COMPLETE_ELIGIBLE" | "NOT_COMPLETE";
  remainingGates: string[];
}

export interface VerificationEvaluation {
  featureId: string;
  gates: GateReport[];
  verdict: VerificationVerdict;
}

interface EvidenceRecord {
  kind: string;
  payload: Record<string, unknown>;
}

function evidenceFor(root: string): EvidenceRecord[] {
  return new Ledger(brainPaths(root).ledgerJsonl)
    .records()
    .map((r) => ({ kind: r.kind, payload: (r.payload ?? {}) as Record<string, unknown> }));
}

export function evaluateGates(root: string, featureId: string): VerificationEvaluation {
  // Deterministic risk/gate refresh before evaluation; use the REFRESHED
  // feature so requiredGates reflect the current artifacts.
  refreshRisk(root, featureId);
  const feature = getFeature(root, featureId);
  const risk = feature.risk;

  const requirements = listRequirements(root, featureId);
  const tasks = listTasks(root, featureId);
  const evidence = evidenceFor(root);
  const gates: GateReport[] = [];

  const accepted = requirements.filter((r) => r.status === "accepted");

  // 1. accepted requirements exist
  gates.push(
    accepted.length > 0
      ? { id: "requirements.accepted", title: "Accepted requirements exist", status: "PASS", detail: `${accepted.length} accepted` }
      : { id: "requirements.accepted", title: "Accepted requirements exist", status: "MISSING", detail: "no accepted requirements" }
  );

  // 2. every accepted requirement is implemented by a DONE task
  const implementedReqIds = new Set(
    tasks.filter((t) => t.status === "DONE").flatMap((t) => t.requirements)
  );
  const uncovered = accepted.filter((r) => !implementedReqIds.has(r.id));
  gates.push(
    accepted.length > 0 && uncovered.length === 0
      ? { id: "requirements.implemented", title: "All accepted requirements implemented", status: "PASS", detail: `${accepted.length}/${accepted.length} covered by DONE tasks` }
      : {
          id: "requirements.implemented",
          title: "All accepted requirements implemented",
          status: "FAIL",
          detail: uncovered.length > 0
            ? `not implemented: ${uncovered.map((r) => r.id).join(", ")}`
            : "no accepted requirements",
        }
  );

  // 3. all tasks resolved
  const unresolved = tasks.filter((t) => t.status !== "DONE");
  gates.push(
    tasks.length > 0 && unresolved.length === 0
      ? { id: "tasks.resolved", title: "All tasks resolved", status: "PASS", detail: `${tasks.length}/${tasks.length} DONE` }
      : {
          id: "tasks.resolved",
          title: "All tasks resolved",
          status: "FAIL",
          detail: unresolved.length === 0
            ? "no tasks planned"
            : `unresolved: ${unresolved.map((t) => `${t.id}(${t.status})`).join(", ")}`,
        }
  );

  // 4. verification commands (per category), executed and passing
  const { commands } = resolveCommands(root);
  const featureVerification = evidence.filter(
    (e) => e.kind === "verification.run" && e.payload["featureId"] === featureId
  );
  for (const category of ["test", "typecheck", "lint", "build"] as ResultCategory[]) {
    const command = commands.find((c) => c.category === category);
    const relevant = featureVerification.filter((e) => e.payload["category"] === category);
    const gateId = `verification.${category}`;
    const title = `Verification: ${category}`;
    if (!command) {
      gates.push({ id: gateId, title, status: "NOT_REQUIRED", detail: "no command configured/discovered for this category" });
      continue;
    }
    const latest = relevant[relevant.length - 1];
    if (!latest) {
      gates.push({ id: gateId, title, status: "MISSING", detail: `${command.command} has never been executed` });
      continue;
    }
    if (latest.payload["success"] !== true) {
      gates.push({
        id: gateId,
        title,
        status: "FAIL",
        detail: `${command.command} failed (exit ${latest.payload["exitCode"]})`,
        evidence: typeof latest.payload["evidenceFile"] === "string" ? [latest.payload["evidenceFile"]] : undefined,
      });
      continue;
    }
    // Evidence freshness: passing evidence for verification.* is checked
    // against the CURRENT code surface. If the relevant code changed after
    // the run, the old pass no longer counts.
    const freshness = checkFreshness(root, featureId, "verification.run");
    if (freshness.freshness === "STALE") {
      gates.push({
        id: gateId,
        title,
        status: "MISSING",
        detail: `evidence is STALE — ${freshness.detail}`,
        evidence: typeof latest.payload["evidenceFile"] === "string" ? [latest.payload["evidenceFile"]] : undefined,
      });
      continue;
    }
    gates.push({
      id: gateId,
      title,
      status: "PASS",
      detail: `exit 0 via ${command.command} (fresh)` ,
      evidence: typeof latest.payload["evidenceFile"] === "string" ? [latest.payload["evidenceFile"]] : undefined,
    });
  }

  // 5. browser QA - required iff UI signals or journeys declared
  const featureVerificationQa = featureVerification.filter((e) => e.payload["kind"] === "qa" || e.kind === "review.qa");
  const qaRequired = feature.requiredGates.includes("browserQA") || listJourneys(root, featureId).length > 0;
  if (!qaRequired) {
    gates.push({ id: "gates.browserQA", title: "Browser QA", status: "NOT_REQUIRED", detail: "no UI surfaces detected and no journeys declared" });
  } else {
    const journeys = listJourneys(root, featureId);
    if (journeys.length === 0) {
      // No journeys yet: fall back to ledger QA verdicts (Phase 3 behavior).
      const qaPassed = evidence.some(
        (e) => e.kind === "review.qa" && e.payload["featureId"] === featureId && e.payload["verdict"] === "pass"
      );
      const qaFreshness = qaPassed ? checkFreshness(root, featureId, "review.qa") : null;
      gates.push(
        qaPassed && qaFreshness?.freshness !== "STALE"
          ? { id: "gates.browserQA", title: "Browser QA", status: "PASS", detail: "QA evidence recorded" }
          : {
              id: "gates.browserQA",
              title: "Browser QA",
              status: "MISSING",
              detail: qaFreshness?.freshness === "STALE" ? `QA evidence is STALE - ${qaFreshness.detail}` : "UI surfaces detected; browser QA evidence required",
            }
      );
    } else {
      // Journey-aware QA gate: every journey must exist, be CURRENT, and its
      // latest result must PASS (43/44/45).
      const reports = journeys.map((j) => journeyFreshness(root, j));
      const latest = new Map(journeys.map((j) => [j.id, latestResult(root, j.id)]));
      const problems: string[] = [];
      for (const j of journeys) {
        const fr = reports.find((r) => r.journeyId === j.id)!;
        const res = latest.get(j.id);
        if (fr.freshness === "STALE") problems.push(`${j.id}: STALE - ${fr.detail}`);
        else if (fr.freshness === "NO_RESULT") problems.push(`${j.id}: has never run`);
        else if (fr.freshness === "UNAVAILABLE") problems.push(`${j.id}: provider UNAVAILABLE - ${res?.unavailableReason ?? "unknown"}`);
        else if (!res || res.status !== "PASS") problems.push(`${j.id}: last run did not PASS`);
      }
      gates.push(
        problems.length === 0
          ? { id: "gates.browserQA", title: "Browser QA", status: "PASS", detail: `${journeys.length} journey(s) current and passing` }
          : { id: "gates.browserQA", title: "Browser QA", status: "FAIL", detail: problems.join("; ") }
      );
    }
  }
  void featureVerificationQa;

  // 6. security review - required iff risk HIGH/CRITICAL, security signals,
  // or unresolved blocker findings exist (21: findings block regardless).
  const securityFindings = readFindings(root, featureId);
  const excepted = exceptedFindingIds(root);
  const secPolicy = readSecurityPolicy(root);
  const unresolvedBlockerFindings = securityFindings.filter((f) => {
    if (f.status !== "OPEN") return false;
    if (excepted.has(f.id)) return false;
    if (secPolicy.block.critical && f.severity === "CRITICAL") return true;
    if (secPolicy.block.high && f.severity === "HIGH") return true;
    return false;
  });
  const securityRequired =
    feature.requiredGates.includes("securityReview") ||
    unresolvedBlockerFindings.length > 0;
  if (!securityRequired) {
    gates.push({ id: "gates.securityReview", title: "Security review", status: "NOT_REQUIRED", detail: `risk ${risk}` });
  } else {
    const passed = evidence.some(
      (e) => e.kind === "review.security" && e.payload["featureId"] === featureId && e.payload["verdict"] === "pass"
    );
    const secFreshness = passed ? checkFreshness(root, featureId, "review.security") : null;
    if (unresolvedBlockerFindings.length > 0) {
      gates.push({
        id: "gates.securityReview",
        title: "Security review",
        status: "FAIL",
        detail: `unresolved security blocker(s): ${unresolvedBlockerFindings.map((f) => `${f.id}(${f.severity} ${f.category})`).join(", ")}`,
      });
    } else if (passed && secFreshness?.freshness !== "STALE") {
      gates.push({ id: "gates.securityReview", title: "Security review", status: "PASS", detail: "security review evidence recorded" });
    } else {
      gates.push({
        id: "gates.securityReview",
        title: "Security review",
        status: "MISSING",
        detail: secFreshness?.freshness === "STALE" ? `security evidence is STALE - ${secFreshness.detail}` : `risk ${risk}; security review evidence required`,
      });
    }
  }

  // 7. no blockers
  const blockedTasks = tasks.filter((t) => t.status === "BLOCKED");
  const blockers = openBlockers(readReview(root, featureId));
  gates.push(
    blockedTasks.length === 0 && blockers.length === 0
      ? { id: "gates.blockers", title: "No unresolved blockers", status: "PASS", detail: "none" }
      : {
          id: "gates.blockers",
          title: "No unresolved blockers",
          status: "FAIL",
          detail: [...blockedTasks.map((t) => `task ${t.id} BLOCKED`), ...blockers.map((f) => `finding ${f.id}`)].join("; "),
        }
  );

  // 8. Project Guardian — partial implementation detection. Tests passing
  // is not enough: the requirement's implementation surface must exist,
  // without stub markers, and be test-associated.
  try {
    const report = guardFeature(root, featureId);
    const partial = report.requirements.filter((r) => r.verdict !== "IMPLEMENTED");
    const stubBlockers = report.stubMarkers.filter(
      (s) => s.marker === "not implemented" || s.marker === "throw not-implemented" || s.marker === "unimplemented"
    );
    if (partial.length === 0 && stubBlockers.length === 0) {
      gates.push({
        id: "gates.guardian",
        title: "Guardian: requirements implemented",
        status: "PASS",
        detail: `${report.requirements.length} requirement(s) verified against the repository`,
      });
    } else {
      const details = [
        ...partial.map((r) => `${r.requirementId}: ${r.verdict} (${r.gaps.join("; ")})`),
        ...stubBlockers.map((s) => `stub marker in ${s.file}:${s.line} (${s.marker})`),
      ];
      gates.push({
        id: "gates.guardian",
        title: "Guardian: requirements implemented",
        status: "FAIL",
        detail: details.join("; "),
      });
    }
  } catch {
    // Guardian needs an index; if it cannot run, do not silently pass.
    gates.push({
      id: "gates.guardian",
      title: "Guardian: requirements implemented",
      status: "MISSING",
      detail: "guardian could not analyze the repository — run 'steward intel index'",
    });
  }

  const blocking = gates.filter((g) => g.status === "FAIL" || g.status === "MISSING");
  return {
    featureId,
    gates,
    verdict: {
      verdict: blocking.length === 0 ? "COMPLETE_ELIGIBLE" : "NOT_COMPLETE",
      remainingGates: blocking.map((g) => `${g.title}: ${g.status} — ${g.detail}`),
    },
  };
}
