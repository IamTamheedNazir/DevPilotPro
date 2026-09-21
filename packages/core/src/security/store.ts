import * as fs from "node:fs";
import { execSync } from "node:child_process";
import {
  SECURITY_SCHEMA,
  SecurityFindingsFile,
  SecurityExceptionsFile,
  SecurityReview,
  SecurityBaseline,
  ThreatModel,
  ThreatScenario,
  type SecurityFindingT,
  type SecurityExceptionT,
  type SecurityReviewT,
  type SecurityBaselineT,
  type ThreatModelT,
  type ThreatScenarioT,
  type FindingStatus,
} from "./schema.js";
import { nowIso, readYaml, writeYaml } from "../state/store.js";
import { StateError, validateFeatureId } from "../state/ids.js";
import { stewardPaths } from "../state/paths.js";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { pathExists } from "../util/fs.js";
import { toProjectRelative } from "../intel/graph.js";

/**
 * Security Guardian state store. Findings, exceptions, reviews, and threat
 * models live under .steward/security/. All identifiers are validated
 * (feature ids are filesystem path segments — hostile ids can never escape
 * Steward-owned paths), and finding file paths are validated before storage.
 */

const ACTOR = `steward-core@${VERSION}`;

export const SEC_ID_RE = /^SEC-\d{3}$/;
export const SEC_EXC_ID_RE = /^SEC-EXC-\d{3}$/;
export const THREAT_SCENARIO_ID_RE = /^THREAT-[A-Z0-9]+-\d{3}$/;

export function validateFindingId(id: string): string {
  if (!SEC_ID_RE.test(id)) {
    throw new StateError(`invalid security finding id '${id}': must match SEC-\\d{3}`);
  }
  return id;
}

export function validateExceptionId(id: string): string {
  if (!SEC_EXC_ID_RE.test(id)) {
    throw new StateError(`invalid security exception id '${id}': must match SEC-EXC-\\d{3}`);
  }
  return id;
}

/** Finding file paths are stored project-relative only — never traversal. */
export function safeFindingPath(root: string, file: string): string {
  if (!file) return "";
  if (file.includes("..") || path0Starts(file)) {
    throw new StateError(`invalid finding file path '${file}'`);
  }
  return toProjectRelative(root, file);
}

function path0Starts(file: string): boolean {
  return file.startsWith("/") || /^[A-Za-z]:/.test(file);
}

// ─── findings ────────────────────────────────────────────────────────────

export function readFindings(root: string, featureId: string): SecurityFindingT[] {
  validateFeatureId(featureId);
  const p = stewardPaths(root).securityFindingsYaml(featureId);
  if (!pathExists(p)) return [];
  const parsed = readYaml(p, SecurityFindingsFile);
  return parsed?.findings ?? [];
}

function writeFindings(root: string, featureId: string, findings: SecurityFindingT[]): void {
  validateFeatureId(featureId);
  writeYaml(stewardPaths(root).securityFindingsYaml(featureId), {
    schema: SECURITY_SCHEMA,
    featureId,
    findings,
  });
}

function ledger(root: string): Ledger {
  return new Ledger(brainPaths(root).ledgerJsonl);
}

function nextFindingId(existing: SecurityFindingT[]): string {
  let max = 0;
  for (const f of existing) {
    const n = Number.parseInt(f.id.slice("SEC-".length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `SEC-${String(max + 1).padStart(3, "0")}`;
}

export interface NewFindingInput {
  featureId: string;
  category: SecurityFindingT["category"];
  severity: SecurityFindingT["severity"];
  confidence: SecurityFindingT["confidence"];
  source: SecurityFindingT["source"];
  ruleId?: string;
  file?: string;
  line?: number;
  title: string;
  detail?: string;
  basis?: string[];
  dependencyReachable?: SecurityFindingT["dependencyReachable"];
  requirementIds?: string[];
  taskIds?: string[];
  evidence?: SecurityFindingT["evidence"];
}

/** Upsert a finding by (ruleId, file, line) signature — re-reviews update, not duplicate. */
export function upsertFinding(root: string, input: NewFindingInput): SecurityFindingT {
  const existing = readFindings(root, input.featureId);
  const signature = findingSignature(input.ruleId ?? input.category, safeFindingPath(root, input.file ?? ""), input.line ?? 0);
  const match = existing.find(
    (f) => f.status === "OPEN" && findingSignature(f.ruleId || f.category, f.file, f.line) === signature
  );
  if (match) {
    match.severity = input.severity;
    match.confidence = input.confidence;
    match.title = input.title;
    match.detail = input.detail ?? match.detail;
    match.basis = input.basis ?? match.basis;
    match.updatedAt = nowIso();
    writeFindings(root, input.featureId, existing);
    ledger(root).append("security.finding.updated", ACTOR, match.id, {
      featureId: input.featureId,
      severity: match.severity,
      status: match.status,
      ruleId: match.ruleId,
    });
    return match;
  }
  const finding: SecurityFindingT = {
    schema: SECURITY_SCHEMA,
    id: nextFindingId(existing),
    featureId: input.featureId,
    requirementIds: input.requirementIds ?? [],
    taskIds: input.taskIds ?? [],
    category: input.category,
    severity: input.severity,
    confidence: input.confidence,
    source: input.source,
    ruleId: input.ruleId ?? "",
    file: safeFindingPath(root, input.file ?? ""),
    line: input.line ?? 0,
    title: input.title,
    detail: input.detail ?? "",
    basis: input.basis ?? [],
    dependencyReachable: input.dependencyReachable,
    evidence: input.evidence ?? [],
    status: "OPEN",
    introducedBy: introducedByOf(root, input),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  existing.push(finding);
  writeFindings(root, input.featureId, existing);
  ledger(root).append("security.finding.recorded", ACTOR, finding.id, {
    featureId: input.featureId,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    source: finding.source,
    file: finding.file,
    ruleId: finding.ruleId,
    introducedBy: finding.introducedBy,
  });
  return finding;
}

function findingSignature(rule: string, file: string, line: number): string {
  return `${rule}::${file}::${line}`;
}

function introducedByOf(root: string, input: NewFindingInput): SecurityFindingT["introducedBy"] {
  const baseline = readSecurityBaseline(root);
  if (!baseline) return "CURRENT_CHANGE";
  const fp = baselineFingerprint(input);
  return baseline.fingerprints.includes(fp) ? "PRE_EXISTING" : "CURRENT_CHANGE";
}

/** Deterministic fingerprint for baseline comparison (content-free). */
export function baselineFingerprint(f: {
  category: string;
  severity: string;
  ruleId?: string;
  file?: string;
  line?: number;
  title?: string;
}): string {
  const id = f.ruleId || f.title || "";
  return `${f.category}::${id}::${f.file ?? ""}::${f.line ?? 0}`.toLowerCase();
}

export function getFinding(root: string, findingId: string): SecurityFindingT {
  validateFindingId(findingId);
  const p = stewardPaths(root);
  if (!pathExists(p.securityFindingsDir)) {
    throw new StateError(`security finding '${findingId}' not found`);
  }
  for (const entry of fs.readdirSync(p.securityFindingsDir)) {
    const file = p.securityFindingsYaml(entry.replace(/\.yaml$/, ""));
    if (!pathExists(file)) continue;
    const parsed = readYaml(file, SecurityFindingsFile);
    const hit = parsed?.findings.find((f) => f.id === findingId);
    if (hit) return hit;
  }
  throw new StateError(`security finding '${findingId}' not found`);
}

export function allFindings(root: string): SecurityFindingT[] {
  const p = stewardPaths(root);
  if (!pathExists(p.securityFindingsDir)) return [];
  const out: SecurityFindingT[] = [];
  for (const entry of fs.readdirSync(p.securityFindingsDir).sort()) {
    const file = p.securityFindingsYaml(entry.replace(/\.yaml$/, ""));
    if (!pathExists(file)) continue;
    const parsed = readYaml(file, SecurityFindingsFile);
    if (parsed) out.push(...parsed.findings);
  }
  return out;
}

/**
 * Update a finding's lifecycle status (§12, §59). OPEN → RESOLVED requires
 * no justification; ACCEPTED_RISK requires a reason, an exception record,
 * and (for HIGH/CRITICAL per policy) never silently comes from an agent.
 */
export function setFindingStatus(
  root: string,
  findingId: string,
  status: FindingStatus,
  opts: { reason?: string; owner?: string; scope?: string; expires?: string; actor?: string } = {}
): { finding: SecurityFindingT; exception?: SecurityExceptionT } {
  const finding = getFinding(root, findingId);
  const p = stewardPaths(root);
  let exception: SecurityExceptionT | undefined;

  if (status === "ACCEPTED_RISK") {
    if (opts.actor && opts.actor.startsWith("agent:")) {
      throw new StateError("agents may not accept security risks; a human must record the exception");
    }
    if (!opts.reason || opts.reason.trim().length < 3) {
      throw new StateError("ACCEPTED_RISK requires a reason (rationale is mandatory)");
    }
    exception = recordException(root, {
      findingId,
      reason: opts.reason,
      owner: opts.owner ?? "project",
      scope: opts.scope ?? finding.file,
      expires: opts.expires,
    });
  }

  const findings = readFindings(root, finding.featureId!);
  const target = findings.find((f) => f.id === findingId);
  if (target) {
    target.status = status;
    target.updatedAt = nowIso();
    writeFindings(root, finding.featureId!, findings);
  }
  ledger(root).append("security.finding.status", ACTOR, findingId, {
    featureId: finding.featureId,
    from: finding.status,
    to: status,
    reason: opts.reason ? opts.reason.slice(0, 300) : "",
    exceptionId: exception?.id,
  });
  return { finding: target ?? finding, exception };
}

// ─── exceptions ──────────────────────────────────────────────────────────

export function readExceptions(root: string): SecurityExceptionT[] {
  const p = stewardPaths(root).securityExceptionsYaml;
  if (!pathExists(p)) return [];
  const parsed = readYaml(p, SecurityExceptionsFile);
  return parsed?.exceptions ?? [];
}

function writeExceptions(root: string, exceptions: SecurityExceptionT[]): void {
  writeYaml(stewardPaths(root).securityExceptionsYaml, {
    schema: SECURITY_SCHEMA,
    exceptions,
  });
}

export function recordException(
  root: string,
  input: { findingId: string; reason: string; owner?: string; scope?: string; expires?: string }
): SecurityExceptionT {
  const existing = readExceptions(root);
  let max = 0;
  for (const e of existing) {
    const n = Number.parseInt(e.id.slice("SEC-EXC-".length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const exception: SecurityExceptionT = {
    schema: SECURITY_SCHEMA,
    id: `SEC-EXC-${String(max + 1).padStart(3, "0")}`,
    findingId: input.findingId,
    reason: input.reason,
    scope: input.scope ?? "",
    owner: input.owner ?? "project",
    expires: input.expires,
    createdAt: nowIso(),
  };
  existing.push(exception);
  writeExceptions(root, existing);
  ledger(root).append("security.exception", ACTOR, exception.id, {
    findingId: exception.findingId,
    scope: exception.scope,
    expires: exception.expires ?? null,
  });
  return exception;
}

export function isExceptionActive(exception: SecurityExceptionT, at: Date = new Date()): boolean {
  if (!exception.expires) return true;
  const t = Date.parse(exception.expires);
  if (!Number.isFinite(t)) return true;
  return at.getTime() < t;
}

export function exceptedFindingIds(root: string, at: Date = new Date()): Map<string, SecurityExceptionT> {
  const map = new Map<string, SecurityExceptionT>();
  for (const e of readExceptions(root)) {
    if (isExceptionActive(e, at)) map.set(e.findingId, e);
  }
  return map;
}

// ─── reviews ─────────────────────────────────────────────────────────────

export function readSecurityReview(root: string, featureId: string): SecurityReviewT | null {
  validateFeatureId(featureId);
  const p = stewardPaths(root).securityReviewYaml(featureId);
  if (!pathExists(p)) return null;
  return readYaml(p, SecurityReview);
}

export function writeSecurityReview(root: string, review: SecurityReviewT): void {
  validateFeatureId(review.featureId);
  writeYaml(stewardPaths(root).securityReviewYaml(review.featureId), review);
}

// ─── security baseline (§60) ─────────────────────────────────────────────

export function readSecurityBaseline(root: string): SecurityBaselineT | null {
  const p = stewardPaths(root).securityBaselineYaml;
  if (!pathExists(p)) return null;
  return readYaml(p, SecurityBaseline);
}

export function captureSecurityBaseline(root: string): SecurityBaselineT {
  const fps = new Set<string>();
  for (const f of allFindings(root)) {
    fps.add(baselineFingerprint(f));
  }
  const baseline: SecurityBaselineT = {
    schema: SECURITY_SCHEMA,
    capturedAt: nowIso(),
    revision: currentRevision(root),
    fingerprints: [...fps].sort(),
  };
  writeYaml(stewardPaths(root).securityBaselineYaml, baseline);
  ledger(root).append("security.baseline", ACTOR, "", { fingerprints: baseline.fingerprints.length });
  return baseline;
}

function currentRevision(root: string): string {
  try {
    const out = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out;
  } catch {
    return "";
  }
}

// ─── threat models ───────────────────────────────────────────────────────

export function readThreatModel(root: string, featureId: string): ThreatModelT | null {
  validateFeatureId(featureId);
  const p = stewardPaths(root).threatModelYaml(featureId);
  if (!pathExists(p)) return null;
  return readYaml(p, ThreatModel);
}

export function writeThreatModel(root: string, model: ThreatModelT): void {
  validateFeatureId(model.featureId);
  writeYaml(stewardPaths(root).threatModelYaml(model.featureId), model);
  ledger(root).append("security.threat-model", ACTOR, model.featureId, {
    scenarios: model.scenarios.length,
    verified: model.scenarios.filter((s) => s.status === "VERIFIED").length,
  });
}

export function upsertThreatScenario(root: string, featureId: string, scenario: ThreatScenarioT): ThreatModelT {
  validateFeatureId(featureId);
  validateScenarioId(scenario.id);
  const model = readThreatModel(root, featureId);
  if (!model) throw new StateError(`no threat model for feature '${featureId}' — run 'steward security threat-model ${featureId}'`);
  const idx = model.scenarios.findIndex((s) => s.id === scenario.id);
  if (idx >= 0) model.scenarios[idx] = scenario;
  else model.scenarios.push(scenario);
  model.updatedAt = nowIso();
  writeThreatModel(root, model);
  return model;
}

export function validateScenarioId(id: string): string {
  if (!THREAT_SCENARIO_ID_RE.test(id)) {
    throw new StateError(`invalid threat scenario id '${id}': must match THREAT-<AREA>-<NNN>`);
  }
  return id;
}

export { ThreatScenario };
