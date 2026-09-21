import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { getFeature, requiredGatesFor, refreshRisk } from "../state/features.js";
import { listRequirements } from "../state/requirements.js";
import { listTasks } from "../state/tasks.js";
import { openBlockers, readReview } from "../state/review.js";
import { resolveCommands } from "./commands.js";
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
    } else if (latest.payload["success"] === true) {
      gates.push({
        id: gateId,
        title,
        status: "PASS",
        detail: `exit 0 via ${command.command}`,
        evidence: typeof latest.payload["evidenceFile"] === "string" ? [latest.payload["evidenceFile"]] : undefined,
      });
    } else {
      gates.push({
        id: gateId,
        title,
        status: "FAIL",
        detail: `${command.command} failed (exit ${latest.payload["exitCode"]})`,
        evidence: typeof latest.payload["evidenceFile"] === "string" ? [latest.payload["evidenceFile"]] : undefined,
      });
    }
  }

  // 5. browser QA — required iff UI signals
  const featureVerificationQa = featureVerification.filter((e) => e.payload["kind"] === "qa" || e.kind === "review.qa");
  const qaRequired = feature.requiredGates.includes("browserQA");
  if (!qaRequired) {
    gates.push({ id: "gates.browserQA", title: "Browser QA", status: "NOT_REQUIRED", detail: "no UI surfaces detected" });
  } else {
    const passed = evidence.some(
      (e) => e.kind === "review.qa" && e.payload["featureId"] === featureId && e.payload["verdict"] === "pass"
    );
    gates.push(
      passed
        ? { id: "gates.browserQA", title: "Browser QA", status: "PASS", detail: "QA evidence recorded" }
        : { id: "gates.browserQA", title: "Browser QA", status: "MISSING", detail: "UI surfaces detected; browser QA evidence required" }
    );
  }
  void featureVerificationQa;

  // 6. security review — required iff risk HIGH/CRITICAL or security signals
  const securityRequired = feature.requiredGates.includes("securityReview");
  if (!securityRequired) {
    gates.push({ id: "gates.securityReview", title: "Security review", status: "NOT_REQUIRED", detail: `risk ${risk}` });
  } else {
    const passed = evidence.some(
      (e) => e.kind === "review.security" && e.payload["featureId"] === featureId && e.payload["verdict"] === "pass"
    );
    gates.push(
      passed
        ? { id: "gates.securityReview", title: "Security review", status: "PASS", detail: "security review evidence recorded" }
        : { id: "gates.securityReview", title: "Security review", status: "MISSING", detail: `risk ${risk}; security review evidence required` }
    );
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
