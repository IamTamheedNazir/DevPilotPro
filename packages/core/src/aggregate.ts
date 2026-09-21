import * as fs from "node:fs";
import { brainPaths } from "./brain/paths.js";
import { Ledger } from "./schema/ledger.js";
import { getFeature } from "./state/features.js";
import { listRequirements } from "./state/requirements.js";
import { listTasks } from "./state/tasks.js";
import { StateError, validateFeatureId } from "./state/ids.js";
import { evaluateGates, type GateReport } from "./verification/gates.js";
import { guardFeature } from "./guardian.js";
import { readSecurityReview, readFindings, exceptedFindingIds } from "./security/store.js";
import { readSecurityPolicy } from "./security/policy.js";
import { featureQaStatus } from "./qa/store.js";
import { readQaPolicy } from "./security/policy.js";
import { checkFreshness } from "./intel/freshness.js";
import { classifySecuritySurface } from "./security/classify.js";
import { readSecurityBaseline } from "./security/store.js";
import { pathExists } from "./util/fs.js";

/**
 * Guardian aggregate (§50): one completion decision combining requirements,
 * implementation, tasks, tests, architecture, security, browser QA, and
 * evidence freshness. Ship check (§52): the same gates, evaluated for
 * release readiness — no deployment, just honest readiness.
 */

export interface GuardianAggregate {
  featureId: string;
  featureTitle: string;
  state: string;
  risk: string;
  requirements: { total: number; verified: number; partial: number; missing: number };
  tests: { status: string; detail: string };
  security: {
    required: boolean;
    verdict: string;
    openFindings: number;
    blockers: Array<{ id: string; severity: string; category: string; title: string }>;
    stale: boolean;
    detail: string;
  };
  qa: {
    required: boolean;
    status: string;
    journeysCurrent: number;
    journeysTotal: number;
    detail: string;
  };
  evidence: { verification: string; qa: string; security: string };
  gates: GateReport[];
  blockers: string[];
  result: "COMPLETE" | "NOT COMPLETE";
}

export function guardianAggregate(root: string, featureId: string): GuardianAggregate {
  validateFeatureId(featureId);
  const feature = getFeature(root, featureId);
  const requirements = listRequirements(root, featureId);
  const tasks = listTasks(root, featureId);
  const evaluation = evaluateGates(root, featureId);
  const guard = guardFeature(root, featureId);

  // Security aggregation.
  const secPolicy = readSecurityPolicy(root);
  const findings = readFindings(root, featureId);
  const excepted = exceptedFindingIds(root);
  const openFindings = findings.filter((f) => f.status === "OPEN" && !excepted.has(f.id));
  const secBlockers = openFindings.filter((f) => (secPolicy.block.critical && f.severity === "CRITICAL") || (secPolicy.block.high && f.severity === "HIGH"));
  const secReview = readSecurityReview(root, featureId);
  const secFresh = checkFreshness(root, featureId, "review.security");
  const securityRequired =
    feature.requiredGates.includes("securityReview") || secBlockers.length > 0 || (secReview?.verdict === "fail");

  // QA aggregation.
  const qaStatus = featureQaStatus(root, featureId);
  const qaPolicy = readQaPolicy(root);
  void qaPolicy;
  const qaRequired = feature.requiredGates.includes("browserQA") || qaStatus.required;

  const gates = evaluation.gates;
  const blockers = [...evaluation.verdict.remainingGates];

  const securityStale = secReview ? secFresh.freshness === "STALE" : false;

  return {
    featureId,
    featureTitle: feature.title,
    state: feature.state,
    risk: feature.risk,
    requirements: {
      total: requirements.length,
      verified: requirements.length - guard.requirements.filter((r) => r.verdict !== "IMPLEMENTED").length,
      partial: guard.requirements.filter((r) => r.verdict === "PARTIAL").length,
      missing: guard.requirements.filter((r) => r.verdict === "MISSING").length,
    },
    tests: {
      status: gates.find((g) => g.id === "verification.test")?.status ?? "NOT_REQUIRED",
      detail: gates.find((g) => g.id === "verification.test")?.detail ?? "",
    },
    security: {
      required: securityRequired,
      verdict: secReview?.verdict ?? (securityRequired ? "MISSING" : "not_required"),
      openFindings: openFindings.length,
      blockers: secBlockers.map((f) => ({ id: f.id, severity: f.severity, category: f.category, title: f.title })),
      stale: securityStale,
      detail:
        secBlockers.length > 0
          ? `${secBlockers.length} blocker finding(s)`
          : secReview
            ? securityStale
              ? "evidence STALE — re-run the security review"
              : `review verdict ${secReview.verdict}`
            : securityRequired
              ? "no security review recorded"
              : "not required",
    },
    qa: {
      required: qaRequired,
      status:
        qaStatus.journeys.length === 0
          ? "NO_JOURNEYS"
          : qaStatus.blocking.length === 0
            ? "CURRENT"
            : "ATTENTION",
      journeysCurrent: qaStatus.journeys.filter((r) => r.freshness === "CURRENT").length,
      journeysTotal: qaStatus.journeys.length,
      detail: qaStatus.detail,
    },
    evidence: {
      verification: checkFreshness(root, featureId, "verification.run").freshness,
      qa: qaStatus.journeys.length === 0 ? checkFreshness(root, featureId, "review.qa").freshness : "JOURNEY_BASED",
      security: secFresh.freshness,
    },
    gates,
    blockers,
    result: evaluation.verdict.verdict === "COMPLETE_ELIGIBLE" ? "COMPLETE" : "NOT COMPLETE",
  };
}

// ─── ship readiness (§52) ────────────────────────────────────────────────

export interface ShipCheck {
  ready: boolean;
  checks: Array<{ id: string; title: string; status: "PASS" | "FAIL" | "WARN" | "UNKNOWN"; detail: string }>;
  summary: string;
}

export function shipCheck(root: string): ShipCheck {
  const checks: ShipCheck["checks"] = [];
  const features = listAllFeaturesForShip(root);

  let totalGatesBlocking = 0;
  let securityFails = 0;
  let qaAttention = 0;
  let staleEvidence = 0;
  for (const f of features) {
    const agg = guardianAggregate(root, f);
    if (agg.result !== "COMPLETE") totalGatesBlocking += 1;
    if (agg.security.required && (agg.security.verdict === "fail" || agg.security.blockers.length > 0 || agg.security.stale)) securityFails += 1;
    if (agg.qa.required && agg.qa.status === "ATTENTION") qaAttention += 1;
    if (agg.evidence.verification === "STALE") staleEvidence += 1;
    if (agg.evidence.security === "STALE") staleEvidence += 1;
  }

  checks.push({
    id: "features.complete",
    title: "Feature completeness (Guardian)",
    status: features.length === 0 ? "UNKNOWN" : totalGatesBlocking === 0 ? "PASS" : "FAIL",
    detail:
      features.length === 0
        ? "no features registered"
        : `${features.length - totalGatesBlocking}/${features.length} feature(s) COMPLETE`,
  });
  checks.push({
    id: "security",
    title: "Security",
    status: securityFails === 0 ? "PASS" : "FAIL",
    detail: securityFails === 0 ? "no failing/stale security surfaces" : `${securityFails} feature(s) with security failures`,
  });
  checks.push({
    id: "qa",
    title: "Browser QA",
    status: qaAttention === 0 ? "PASS" : "FAIL",
    detail: qaAttention === 0 ? "all declared journeys current" : `${qaAttention} feature(s) with QA attention`,
  });
  checks.push({
    id: "stale-evidence",
    title: "Stale required evidence",
    status: staleEvidence === 0 ? "PASS" : "FAIL",
    detail: `${staleEvidence} stale evidence surface(s)`,
  });

  // HIGH assumptions block (§52).
  const assumptions = countHighAssumptions(root);
  checks.push({
    id: "assumptions",
    title: "Open HIGH assumptions",
    status: assumptions === 0 ? "PASS" : "WARN",
    detail: `${assumptions} open HIGH assumption(s) across specs`,
  });

  const ready = checks.every((c) => c.status === "PASS" || c.status === "WARN");
  return {
    ready,
    checks,
    summary: ready ? "READY: YES (with noted warnings)" : "READY: NO — fix failing checks",
  };
}

function listAllFeaturesForShip(root: string): string[] {
  const featuresDir = `${root}/.steward/features`;
  if (!pathExists(featuresDir)) return [];
  try {
    return fs.readdirSync(featuresDir).filter((d) => !d.startsWith("."));
  } catch {
    return [];
  }
}

function countHighAssumptions(root: string): number {
  // Specs record assumptions; count HIGH-marked ones deterministically.
  const specsDir = `${root}/.steward/features`;
  if (!pathExists(specsDir)) return 0;
  let count = 0;
  try {
    for (const d of fs.readdirSync(specsDir)) {
      const spec = `${specsDir}/${d}/spec.md`;
      if (!pathExists(spec)) continue;
      const content = fs.readFileSync(spec, "utf8");
      count += (content.match(/HIGH/g) ?? []).length;
    }
  } catch {
    return count;
  }
  return count;
}

// Re-exports for CLI convenience.
export { readSecurityBaseline };
export { classifySecuritySurface };
export { StateError };
export { Ledger };
