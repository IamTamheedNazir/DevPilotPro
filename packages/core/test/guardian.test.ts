import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import {
  makeProject,
  PASS_CMD,
  FAIL_CMD,
  writeImplAndTest,
} from "./helpers.js";
import {
  createFeature,
  createSpec,
  addRequirement,
  addTask,
  approveSpec,
  createPlan,
  startTask,
  runTaskVerification,
  transitionFeature,
  completeFeature,
  evaluateGates,
  guardFeature,
  guardAll,
} from "../src/index.js";

/** Drive a feature to VERIFYING with real files (or none, per opts). */
async function toVerifying(
  root: string,
  opts: { withFiles?: boolean; stub?: boolean } = {}
) {
  const f = createFeature(root, { title: "org invitations", request: "Add organization invitations" });
  createSpec(root, f.id, { objective: "organization invitations flow" });
  const r = addRequirement(root, f.id, {
    area: "INVITE",
    title: "invitation record and delivery",
    description: "create an invitation and deliver the invitation email",
    status: "accepted",
  });
  const t = addTask(root, f.id, {
    objective: "implement invitations",
    requirements: [r.id],
    verification: [PASS_CMD],
    expectedFiles: opts.withFiles === false ? [] : ["src/invitations/invitation.ts"],
  });
  approveSpec(root, f.id);
  createPlan(root, f.id);
  startTask(root, f.id, t.id);
  if (opts.withFiles !== false) {
    writeImplAndTest(root, {
      impl: "src/invitations/invitation.ts",
      test: "src/invitations/invitation.test.ts",
      implCode: opts.stub
        ? `// invitation delivery\nexport function sendInvitation() {\n  // TODO: not implemented yet\n  throw new Error("not implemented");\n}\n`
        : undefined,
    });
  }
  await runTaskVerification(root, f.id, t.id);
  transitionFeature(root, f.id, "VERIFYING");
  return f;
}

describe("Project Guardian", () => {
  it("verifies a genuinely implemented requirement (SATISFIED)", async () => {
    const root = makeProject();
    const f = await toVerifying(root, { withFiles: true });
    const report = guardFeature(root, f.id);
    expect(report.verdict).toBe("SATISFIED");
    expect(report.requirements[0].verdict).toBe("IMPLEMENTED");
  });

  it("detects PARTIAL when tests pass but the implementation is a stub", async () => {
    const root = makeProject();
    const f = await toVerifying(root, { withFiles: true, stub: true });
    const report = guardFeature(root, f.id);
    // tests pass, task DONE, but the surface contains not-implemented markers
    expect(report.requirements[0].verdict).toBe("PARTIAL");
    expect(report.stubMarkers.length).toBeGreaterThan(0);
    expect(report.stubMarkers.some((s) => s.marker === "not implemented" || s.marker === "TODO")).toBe(true);
  });

  it("blocks COMPLETE with passing tests when the requirement surface is missing", async () => {
    const root = makeProject();
    const f = await toVerifying(root, { withFiles: false });
    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(false);
    const guardian = outcome.evaluation.gates.find((g) => g.id === "gates.guardian");
    expect(guardian?.status).toBe("FAIL");
    expect(guardian?.detail).toContain("PARTIAL");
  });

  it("blocks COMPLETE when a stub marker sits in the implementation", async () => {
    const root = makeProject();
    const f = await toVerifying(root, { withFiles: true, stub: true });
    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(false);
    expect(outcome.evaluation.gates.find((g) => g.id === "gates.guardian")?.detail).toContain("stub marker");
  });

  it("does not let stale guardian signals block unrelated stale findings (no false BLOCKERs)", async () => {
    const root = makeProject();
    const f = await toVerifying(root, { withFiles: true });
    const evaluation = evaluateGates(root, f.id);
    const guardian = evaluation.gates.find((g) => g.id === "gates.guardian");
    expect(guardian?.status).toBe("PASS");
  });

  it("flags expected behavior without a matching requirement as a WARNING finding", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "spec gap check", request: "plain" });
    createSpec(root, f.id, {
      objective: "spec gap check",
      expectedBehavior: ["Quantum flux capacitor recalibrates automatically"],
    });
    const report = guardFeature(root, f.id);
    expect(report.findings.some((x) => x.severity === "WARNING" && x.issue.includes("Quantum"))).toBe(true);
  });

  it("guardAll covers active features only", async () => {
    const root = makeProject();
    await toVerifying(root, { withFiles: true });
    const reports = guardAll(root);
    expect(reports).toHaveLength(1);
    expect(reports[0].featureId).toContain("org");
  });

  it("writes no state outside .steward when analyzing (git safety)", async () => {
    const root = makeProject();
    await toVerifying(root, { withFiles: true });
    const implBefore = readFileSync(`${root}/src/invitations/invitation.ts`, "utf8");
    guardFeature(root, "org-invitations");
    expect(readFileSync(`${root}/src/invitations/invitation.ts`, "utf8")).toBe(implBefore);
  });
});

describe("guardian integration with a failing test", () => {
  it("reports both the failing test gate and the guardian verdict", async () => {
    const root = makeProject({
      verification: { test: FAIL_CMD, typecheck: PASS_CMD, lint: PASS_CMD, build: PASS_CMD },
    });
    const f = await toVerifying(root, { withFiles: true, stub: true });
    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(false);
    const statuses = Object.fromEntries(outcome.evaluation.gates.map((g) => [g.id, g.status]));
    expect(statuses["verification.test"]).toBe("FAIL");
    expect(statuses["gates.guardian"]).toBe("FAIL");
  });
});

void readFileSync;
void mkdirSync;
void writeFileSync;
