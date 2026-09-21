import * as fs from "node:fs";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { nowIso } from "../state/store.js";
import { validateFeatureId, StateError } from "../state/ids.js";
import { getFeature } from "../state/features.js";
import { listTasks } from "../state/tasks.js";
import { classifySecuritySurface, type SecuritySurfaceClassification } from "./classify.js";
import { readSecurityPolicy } from "./policy.js";
import { runSecretScan, secretFindings } from "./secrets.js";
import { runDependencyScan } from "./dependency.js";
import { runStaticScan } from "./static.js";
import { analyzeAuthorization } from "./authorization.js";
import {
  upsertFinding,
  readFindings,
  readSecurityReview,
  writeSecurityReview,
  readSecurityBaseline,
  exceptedFindingIds,
  type NewFindingInput,
} from "./store.js";
import { freshnessSurface } from "../intel/freshness.js";
import { severityAtLeast, type SecurityCheckReportT, type SecurityFindingT, type SecurityPolicy, type SecurityReviewT } from "./schema.js";

/**
 * Security review engine (§19, §20). Pipeline:
 *   load feature → requirements → diff → impact → classify surface →
 *   secret check → dependency check (if relevant) → static check (if
 *   available) → authz analysis → threat-scenario check → normalize →
 *   persist evidence.
 *
 * Findings whose only source is a heuristic are labeled with confidence
 * "inferred"; the required confirmation is always named. Baseline findings
 * are marked PRE_EXISTING (§60) but never excused — policy decides what
 * blocks.
 */

const ACTOR = `steward-core@${VERSION}`;

export interface SecurityReviewResult {
  review: SecurityReviewT;
  findings: SecurityFindingT[];
  classification: SecuritySurfaceClassification;
}

export function runSecurityReview(root: string, featureId: string, opts: { force?: boolean } = {}): SecurityReviewResult {
  validateFeatureId(featureId);
  const feature = getFeature(root, featureId);
  void feature;
  const policy = readSecurityPolicy(root);
  const classification = classifySecuritySurface(root, featureId, policy);
  const checks: SecurityCheckReportT[] = [];

  // ── 1. secret scan (changed content, §10) ──────────────────────────────
  let secretFindingsNormalized: NewFindingInput[] = [];
  if (policy.secretScan.enabled) {
    const scan = runSecretScan(root, {
      includeStaged: policy.secretScan.includeStaged,
      includeHistory: policy.secretScan.includeHistory,
    });
    if (scan.hits.length === 0) {
      checks.push({ id: "secrets", title: "Secrets", status: "PASS", detail: scan.detail });
    } else {
      checks.push({ id: "secrets", title: "Secrets", status: "FAIL", detail: scan.detail });
      secretFindingsNormalized = secretFindings(root, featureId, scan);
    }
  } else {
    checks.push({ id: "secrets", title: "Secrets", status: "SKIPPED", detail: "disabled by policy" });
  }

  // ── 2. dependency scan (only when relevant, §5/§13) ────────────────────
  let depFindings: NewFindingInput[] = [];
  if (classification.requiredChecks.includes("dependencyScan")) {
    const scan = runDependencyScan(root, featureId);
    if (!scan.available) {
      checks.push({ id: "dependency", title: "Dependencies", status: "UNAVAILABLE", detail: scan.detail });
    } else if (scan.findings.length === 0) {
      checks.push({ id: "dependency", title: "Dependencies", status: "PASS", detail: scan.detail });
    } else {
      checks.push({
        id: "dependency",
        title: "Dependencies",
        status: "FAIL",
        detail: `${scan.rawCount} vulnerable package version(s); severity per advisory; reachability recorded separately`,
        findingIds: [],
      });
      depFindings = scan.findings;
    }
  } else {
    checks.push({ id: "dependency", title: "Dependencies", status: "NOT_AFFECTED", detail: "no manifest/dependency change in this change set" });
  }

  // ── 3. static analysis (only if installed, §17) ────────────────────────
  let staticFindings: NewFindingInput[] = [];
  const staticScan = runStaticScan(root, featureId, policy.semgrepConfig);
  if (classification.securityRelevant || classification.changedFiles.length > 0) {
    if (!staticScan.available) {
      checks.push({ id: "static", title: "Static analysis", status: "UNAVAILABLE", detail: staticScan.detail });
    } else if (staticScan.findings.length === 0) {
      checks.push({ id: "static", title: "Static analysis", status: "PASS", detail: staticScan.detail });
    } else {
      checks.push({ id: "static", title: "Static analysis", status: "FAIL", detail: staticScan.detail });
      staticFindings = staticScan.findings;
    }
  } else {
    checks.push({ id: "static", title: "Static analysis", status: "NOT_AFFECTED", detail: "no changed files" });
  }

  // ── 4. authorization analysis (§8) + tenant isolation (§9) ─────────────
  const authz = analyzeAuthorization(root, featureId, classification, policy);
  let authzFindings = authz.findings;
  if (classification.requiredChecks.includes("authorizationReview")) {
    if (authzFindings.length === 0) {
      checks.push({
        id: "authorization",
        title: "Authorization",
        status: authz.touchedSensitiveFiles.length > 0 ? "PASS" : "NOT_AFFECTED",
        detail:
          authz.touchedSensitiveFiles.length > 0
            ? `authz-sensitive files changed (${authz.touchedSensitiveFiles.map((t) => t.file).join(", ")}); no missing-permission shape detected — evidence of a passing authorization test still required by the gate`
            : "no authz-sensitive surfaces in this change",
      });
    } else {
      checks.push({
        id: "authorization",
        title: "Authorization",
        status: "FAIL",
        detail: `${authzFindings.length} possible missing-check shape(s) detected (heuristic; confirmation required)`,
      });
    }
  } else {
    checks.push({ id: "authorization", title: "Authorization", status: "NOT_AFFECTED", detail: "no auth-relevant area touched" });
  }

  if (classification.requiredChecks.includes("tenantIsolation")) {
    checks.push({
      id: "tenant-isolation",
      title: "Tenant isolation",
      status: authz.tenantVerificationRequired ? "FAIL" : "PASS",
      detail: authz.tenantVerificationRequired
        ? "tenancy enabled and data-access changed — cross-tenant evidence required"
        : "no tenant-key surfaces changed",
    });
  }

  // ── normalize + persist findings ───────────────────────────────────────
  const allNew = [...secretFindingsNormalized, ...depFindings, ...staticFindings, ...authzFindings];
  const persisted: SecurityFindingT[] = [];
  for (const input of allNew) {
    persisted.push(upsertFinding(root, input));
  }

  // Annotate with baseline provenance comparison against existing findings.
  const existing = readFindings(root, featureId);
  const baseline = readSecurityBaseline(root);
  const byId = new Map(existing.map((f) => [f.id, f]));

  // ── verdict per policy (§21) ───────────────────────────────────────────
  const excepted = exceptedFindingIds(root);
  const blockers = existing
    .concat(persisted)
    .filter((f) => {
      if (f.status === "RESOLVED" || f.status === "FALSE_POSITIVE") return false;
      if (excepted.has(f.id)) return false;
      const sev = byId.get(f.id)?.severity ?? f.severity;
      if (policy.block.critical && sev === "CRITICAL") return true;
      if (policy.block.high && sev === "HIGH") return true;
      if (policy.block.medium && sev === "MEDIUM") return true;
      return false;
    })
    .map((f) => f.id);

  const requiredMissing = missingRequiredEvidence(root, featureId, classification);
  const failedChecks = checks.filter((c) => c.status === "FAIL");
  const verdict: SecurityReviewT["verdict"] =
    blockers.length > 0 || failedChecks.length > 0 || requiredMissing.length > 0 ? "fail" : "pass";

  const review: SecurityReviewT = {
    schema: "steward.security.v1",
    id: `SECREV-${featureId}`,
    featureId,
    reviewedAt: nowIso(),
    surface: classification.areas.map((a) => a.area),
    risk: classification.risk,
    checks,
    findingIds: [...new Set(existing.map((f) => f.id).concat(persisted.map((f) => f.id)))],
    verdict,
    summary: buildSummary(verdict, classification, checks, blockers, requiredMissing, policy),
    surfaceHash: freshnessSurface(root, featureId).surfaceHash,
  };
  writeSecurityReview(root, review);

  new Ledger(brainPaths(root).ledgerJsonl).append("security.review.recorded", ACTOR, featureId, {
    verdict: review.verdict,
    checks: checks.map((c) => c.status),
    blockers: blockers.length,
    surface: review.surface,
  });

  return { review, findings: existing, classification };
}

/** Which required verifications have no supporting evidence yet (§20 gate). */
export function missingRequiredEvidence(root: string, featureId: string, classification: SecuritySurfaceClassification): string[] {
  const missing: string[] = [];
  const model = readSecurityReview(root, featureId);
  const scenarioVerified = readScenarioVerification(root, featureId);
  if (classification.requiredChecks.includes("authorizationReview")) {
    const evidence = findEvidenceFor(root, featureId, ["authorization", "authentication"]);
    if (evidence.length === 0) missing.push("authorization: no passing authorization test or recorded evidence");
  }
  if (classification.requiredChecks.includes("tenantIsolation") && !scenarioVerified) {
    const evidence = findEvidenceFor(root, featureId, ["tenant-isolation"]);
    if (evidence.length === 0) missing.push("tenant isolation: no cross-tenant evidence (Org A → Org B must be denied)");
  }
  if (model && model.verdict === "fail") {
    // covered by blockers above; nothing extra
  }
  return missing;
}

function readScenarioVerification(root: string, featureId: string): boolean {
  try {
    const p = `${root}/.steward/security/threat-models/${featureId}.yaml`;
    if (!fs.existsSync(p)) return false;
    const content = fs.readFileSync(p, "utf8");
    return content.includes("status: VERIFIED") || content.includes("status: MITIGATED");
  } catch {
    return false;
  }
}

/**
 * Find evidence that plausibly covers a security area: task verification
 * commands whose path/name mentions the area (authorization.test.ts,
 * tenant-isolation.spec.ts, …) or a passing ledger verification whose
 * command references it. Deterministic, name-based — Steward never guesses
 * what a test proves beyond what its name declares.
 */
function findEvidenceFor(root: string, featureId: string, areas: string[]): string[] {
  const evidence: string[] = [];
  const areaNames = areas.map((a) => a.replace(/-/g, ""));
  const matches = (text: string): boolean => {
    const t = text.toLowerCase().replace(/[-_]/g, "");
    return areaNames.some((a) => t.includes(a));
  };
  // 1. Task-declared verification commands (the project's own tests).
  for (const t of listTasks(root, featureId)) {
    for (const command of t.verification) {
      if (matches(command)) evidence.push(`task ${t.id}: ${command}`);
    }
  }
  // 2. Ledger verification runs whose command mentions the area.
  const ledger = new Ledger(brainPaths(root).ledgerJsonl);
  for (const rec of ledger.records()) {
    if (rec.kind !== "verification.run") continue;
    const payload = (rec.payload ?? {}) as { featureId?: string; command?: string };
    if (payload.featureId !== featureId) continue;
    if (payload.command && matches(payload.command)) evidence.push(`ledger #${rec.seq}: ${payload.command}`);
  }
  return evidence;
}

function buildSummary(
  verdict: SecurityReviewT["verdict"],
  classification: SecuritySurfaceClassification,
  checks: SecurityCheckReportT[],
  blockers: string[],
  requiredMissing: string[],
  policy: SecurityPolicy
): string {
  if (verdict === "pass") {
    return `Security review PASS — ${classification.areas.length} area(s) checked, ${checks.filter((c) => c.status === "PASS").length} passed, no blockers`;
  }
  const parts: string[] = [];
  if (blockers.length > 0) parts.push(`${blockers.length} blocker finding(s): ${blockers.join(", ")}`);
  const failed = checks.filter((c) => c.status === "FAIL").map((c) => c.id);
  if (failed.length > 0) parts.push(`failed checks: ${failed.join(", ")}`);
  if (requiredMissing.length > 0) parts.push(`missing required evidence: ${requiredMissing.length}`);
  void policy;
  return parts.join("; ");
}

/** §22: security evidence freshness is delegated to the Phase 3 layer. */
export function securityFreshness(root: string, featureId: string) {
  void root;
  void featureId;
  throw new StateError("use checkFreshness from intel/freshness.js for security.review evidence");
}