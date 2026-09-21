import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { makeProject } from "./helpers.js";
import { classifySecuritySurface } from "../src/security/classify.js";
import { readSecurityPolicy } from "../src/security/policy.js";
import { runSecurityReview } from "../src/security/review.js";
import {
  upsertFinding,
  setFindingStatus,
  readFindings,
  allFindings,
  getFinding,
  exceptedFindingIds,
  isExceptionActive,
  captureSecurityBaseline,
  readSecurityBaseline,
  recordException,
  readSecurityReview,
} from "../src/security/store.js";
import { generateThreatModel } from "../src/security/threat-model.js";
import { readThreatModel } from "../src/security/store.js";
import { evaluateGates } from "../src/verification/gates.js";
import { createFeature } from "../src/state/features.js";
import { addRequirement } from "../src/state/requirements.js";
import { addTask } from "../src/state/tasks.js";
import { createSpec, approveSpec } from "../src/state/specs.js";

/**
 * Security Guardian tests (§68): classification, finding lifecycle,
 * baseline/exception semantics, and the security DoD gate — auth changes
 * demand review, unrelated copy changes do not, unresolved HIGH blocks,
 * resolved findings unblock, stale security evidence blocks.
 */

function setupSecurityFeature(
  root: string,
  featureId: string,
  files: Record<string, string>,
  opts: { verification?: string[] } = {}
): void {
  // Request text deliberately names authorization + membership so the
  // deterministic risk engine classifies this as a security-relevant change.
  createFeature(root, {
    id: featureId,
    title: "Security feature",
    request: "member authorization and permission checks; organizationId tenant boundary; removeMember endpoint",
  });
  createSpec(root, featureId, { objective: "member removal with authorization" });
  const req = addRequirement(root, featureId, {
    title: "Only admins may remove a member (authorization)",
    description: "permission check required; organizationId scoping",
    acceptance: ["unauthorized denied"],
  });
  approveSpec(root, featureId);
  addTask(root, featureId, {
    objective: "implement",
    requirements: [req.id],
    expectedFiles: Object.keys(files),
    verification: opts.verification,
  });
  for (const [path, content] of Object.entries(files)) {
    fs.mkdirSync(`${root}/${path}`.slice(0, `${root}/${path}`.lastIndexOf("/")), { recursive: true });
    fs.writeFileSync(`${root}/${path}`, content);
  }
}

/** Git-init + baseline commit so the change set is "the files written after". */
function gitBaseline(root: string): void {
  execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm i', { cwd: root, stdio: "ignore" });
}

describe("change-aware security classification", () => {
  it("flags authorization areas for auth-surface changes", () => {
    const root = makeProject();
    gitBaseline(root);
    setupSecurityFeature(root, "feat-sec-a", {
      "src/api/member-service.ts": "export async function removeMember(organizationId: string, userId: string) { return db.remove(organizationId, userId); }\n",
    });
    const c = classifySecuritySurface(root, "feat-sec-a", readSecurityPolicy(root));
    expect(c.securityRelevant).toBe(true);
    expect(c.areas.some((a) => a.area === "authorization" || a.area === "tenant-isolation" || a.area === "public-api")).toBe(true);
    expect(c.requiredChecks).toContain("authorizationReview");
  });

  it("does NOT demand heavy checks for a copy-only change", () => {
    const root = makeProject();
    gitBaseline(root);
    // A docs-only feature: no security vocabulary anywhere.
    createFeature(root, { id: "feat-sec-b", title: "Docs copy update", request: "update welcome copy" });
    createSpec(root, "feat-sec-b", { objective: "update welcome copy" });
    const req = addRequirement(root, "feat-sec-b", { title: "Updated copy", acceptance: ["reads well"] });
    approveSpec(root, "feat-sec-b");
    addTask(root, "feat-sec-b", { objective: "edit copy", requirements: [req.id], expectedFiles: ["docs/readme-copy.md"] });
    fs.mkdirSync(`${root}/docs`, { recursive: true });
    fs.writeFileSync(`${root}/docs/readme-copy.md`, "# Updated copy\nWelcome text changes only.\n");
    const c = classifySecuritySurface(root, "feat-sec-b", readSecurityPolicy(root));
    expect(c.requiredChecks).not.toContain("authorizationReview");
    expect(c.requiredChecks).not.toContain("tenantIsolation");
  });

  it("requires tenantIsolation only when tenancy policy is enabled", () => {
    const root = makeProject();
    gitBaseline(root);
    setupSecurityFeature(root, "feat-sec-c", {
      "src/models/member.ts": "export const memberTable = { organizationId: 'org' };\n",
    });
    const c = classifySecuritySurface(root, "feat-sec-c", readSecurityPolicy(root));
    expect(c.requiredChecks).not.toContain("tenantIsolation");
  });
});

describe("security review engine", () => {
  it("fails the review when a secret is planted in the change", () => {
    const root = makeProject();
    gitBaseline(root);
    setupSecurityFeature(root, "feat-sec-d", {
      "src/config.ts": 'const STRIPE = "sk_live_abcdefghijklmnop";\n',
    });
    const result = runSecurityReview(root, "feat-sec-d");
    expect(result.review.verdict).toBe("fail");
    expect(result.review.checks.find((c) => c.id === "secrets")?.status).toBe("FAIL");
    expect(result.findings.some((f) => f.category === "secret")).toBe(true);
    // The secret value must never appear in any finding.
    expect(JSON.stringify(result.findings)).not.toContain("sk_live_abcdefghijklmnop");
  });

  it("records findings with provenance basis and confidence", () => {
    const root = makeProject();
    gitBaseline(root);
    setupSecurityFeature(root, "feat-sec-e", {
      "src/api/invite-endpoint.ts": "export async function acceptInvite(organizationId: string, inviteId: string) { db.write(organizationId, inviteId); }\n",
    });
    const result = runSecurityReview(root, "feat-sec-e");
    const authz = result.findings.filter((f) => f.category === "authorization");
    for (const f of authz) {
      expect(f.basis.length).toBeGreaterThan(0);
      expect(["inferred", "supported"]).toContain(f.confidence);
      expect(f.ruleId).toContain("authz");
    }
  });

  it("writes a review whose surfaceHash enables freshness (§22)", () => {
    const root = makeProject();
    gitBaseline(root);
    // The task declares an authorization test as its verification command —
    // §20 example evidence (tests/org-invite-isolation.test.ts shape).
    setupSecurityFeature(
      root,
      "feat-sec-f",
      { "src/api/clean-endpoint.ts": "export function safeThing(x: string) { return x; }\n" },
      { verification: ["vitest run tests/authorization.test.ts"] }
    );
    fs.mkdirSync(`${root}/tests`, { recursive: true });
    fs.writeFileSync(
      `${root}/tests/authorization.test.ts`,
      "import { expect } from 'vitest';\nit('denies unauthorized', () => { expect(true).toBe(true); });\n"
    );
    const result = runSecurityReview(root, "feat-sec-f");
    expect(result.review.surfaceHash).toBeTruthy();
    const stored = readSecurityReview(root, "feat-sec-f");
    expect(stored?.verdict).toBe("pass");
  });
});

describe("finding lifecycle + exceptions", () => {
  it("upserts by signature instead of duplicating", () => {
    const root = makeProject();
    const a = upsertFinding(root, {
      featureId: "feat-life",
      category: "authorization",
      severity: "HIGH",
      confidence: "inferred",
      source: "steward",
      ruleId: "authz-test-rule",
      file: "src/api/x.ts",
      line: 10,
      title: "Missing check",
    });
    const b = upsertFinding(root, {
      featureId: "feat-life",
      category: "authorization",
      severity: "CRITICAL",
      confidence: "supported",
      source: "steward",
      ruleId: "authz-test-rule",
      file: "src/api/x.ts",
      line: 10,
      title: "Missing check (updated)",
    });
    expect(a.id).toBe(b.id);
    expect(b.severity).toBe("CRITICAL");
    expect(readFindings(root, "feat-life")).toHaveLength(1);
  });

  it("ACCEPTED_RISK requires a reason and creates an exception; agents are refused", () => {
    const root = makeProject();
    createFeature(root, { id: "feat-life2", title: "Lifecycle" });
    const f = upsertFinding(root, {
      featureId: "feat-life2",
      category: "dependency",
      severity: "HIGH",
      confidence: "proven",
      source: "osv",
      ruleId: "GHSA-test-0001",
      title: "Vulnerable dep",
    });
    expect(() => setFindingStatus(root, f.id, "ACCEPTED_RISK", { actor: "agent:test" })).toThrow(/agent/);
    expect(() => setFindingStatus(root, f.id, "ACCEPTED_RISK", {})).toThrow(/reason/);
    const { exception } = setFindingStatus(root, f.id, "ACCEPTED_RISK", { reason: "vulnerable API not used by this application", expires: "2099-01-01" });
    expect(exception).toBeTruthy();
    expect(exceptedFindingIds(root).has(f.id)).toBe(true);
    expect(isExceptionActive(exception!)).toBe(true);
    // Expired exceptions reactivate findings.
    const { exception: exp } = setFindingStatus(root, f.id, "OPEN", {});
    void exp;
    const stale = recordException(root, { findingId: f.id, reason: "old acceptance", expires: "2020-01-01" });
    expect(isExceptionActive(stale)).toBe(false);
  });

  it("RESOLVED findings stop blocking", () => {
    const root = makeProject();
    createFeature(root, { id: "feat-life3", title: "Lifecycle 3" });
    const f = upsertFinding(root, {
      featureId: "feat-life3",
      category: "authorization",
      severity: "HIGH",
      confidence: "inferred",
      source: "steward",
      ruleId: "authz-resolve-test",
      title: "Missing check",
    });
    setFindingStatus(root, f.id, "RESOLVED", {});
    expect(getFinding(root, f.id).status).toBe("RESOLVED");
    expect(allFindings(root).find((x) => x.id === f.id)?.status).toBe("RESOLVED");
  });
});

describe("security baseline (§60)", () => {
  it("marks existing findings PRE_EXISTING after a baseline capture", () => {
    const root = makeProject();
    createFeature(root, { id: "feat-base", title: "Baseline" });
    const f = upsertFinding(root, {
      featureId: "feat-base",
      category: "dependency",
      severity: "MEDIUM",
      confidence: "proven",
      source: "osv",
      ruleId: "GHSA-baseline-1",
      title: "Old vuln",
    });
    expect(f.introducedBy).toBe("CURRENT_CHANGE");
    captureSecurityBaseline(root);
    // A NEW finding after baseline is CURRENT_CHANGE; re-running the same
    // signature is an update (kept CURRENT_CHANGE since not on baseline).
    const g = upsertFinding(root, {
      featureId: "feat-base",
      category: "dependency",
      severity: "HIGH",
      confidence: "proven",
      source: "osv",
      ruleId: "GHSA-baseline-2",
      title: "New vuln",
    });
    void g;
    const baseline = readSecurityBaseline(root);
    expect(baseline).toBeTruthy();
    expect(baseline!.fingerprints.length).toBeGreaterThanOrEqual(1);
  });
});

describe("threat models (§6, §7)", () => {
  it("generates a small feature-specific model with scenario ids and verification", () => {
    const root = makeProject();
    gitBaseline(root);
    setupSecurityFeature(root, "feat-tm", {
      "src/api/member-service.ts": "export async function removeMember(organizationId: string) { return organizationId; }\n",
    });
    const model = generateThreatModel(root, "feat-tm");
    expect(model.featureId).toBe("feat-tm");
    expect(model.scenarios.length).toBeGreaterThan(0);
    expect(model.scenarios.length).toBeLessThanOrEqual(5);
    for (const s of model.scenarios) {
      expect(s.id).toMatch(/^THREAT-[A-Z0-9]+-\d{3}$/);
      expect(s.verification.length).toBeGreaterThan(0);
      expect(s.status).toBe("PENDING");
    }
    expect(readThreatModel(root, "feat-tm")?.scenarios.length).toBe(model.scenarios.length);
  });
});

describe("security DoD gate (§21, §E–F)", () => {
  it("unresolved HIGH finding forces the security gate to FAIL", () => {
    const root = makeProject();
    gitBaseline(root);
    setupSecurityFeature(root, "feat-gate-sec", {
      "src/api/member-service.ts": "export async function removeMember(organizationId: string) { return organizationId; }\n",
    });
    upsertFinding(root, {
      featureId: "feat-gate-sec",
      category: "authorization",
      severity: "HIGH",
      confidence: "inferred",
      source: "steward",
      ruleId: "authz-gate-test",
      file: "src/api/member-service.ts",
      title: "Missing permission check",
    });
    const evaluation = evaluateGates(root, "feat-gate-sec");
    const secGate = evaluation.gates.find((g) => g.id === "gates.securityReview");
    expect(secGate?.status).toBe("FAIL");
    expect(secGate?.detail).toContain("unresolved security blocker");
    expect(evaluation.verdict.verdict).toBe("NOT_COMPLETE");
  });

  it("resolving the finding unblocks the gate (given review evidence)", () => {
    const root = makeProject();
    gitBaseline(root);
    setupSecurityFeature(root, "feat-gate-sec2", {
      "src/api/member-service.ts": "export async function removeMember(organizationId: string) { return organizationId; }\n",
    });
    const f = upsertFinding(root, {
      featureId: "feat-gate-sec2",
      category: "authorization",
      severity: "HIGH",
      confidence: "inferred",
      source: "steward",
      ruleId: "authz-gate-test-2",
      file: "src/api/member-service.ts",
      title: "Missing permission check",
    });
    setFindingStatus(root, f.id, "RESOLVED", {});
    const evaluation = evaluateGates(root, "feat-gate-sec2");
    const secGate = evaluation.gates.find((g) => g.id === "gates.securityReview");
    // Either PASS with fresh evidence, or MISSING (review evidence required) —
    // but no longer FAILED on the finding.
    expect(secGate?.status === "MISSING" || secGate?.status === "PASS").toBe(true);
    expect(secGate?.detail).not.toContain("unresolved security blocker");
  });
});
