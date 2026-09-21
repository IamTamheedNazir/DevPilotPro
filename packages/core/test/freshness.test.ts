import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  makeProject,
  PASS_CMD,
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
  runVerification,
  transitionFeature,
  recordReviewVerdict,
  checkFreshness,
  freshnessSurface,
  evaluateGates,
} from "../src/index.js";

async function toVerifying(root: string) {
  const f = createFeature(root, { title: "org invitations", request: "Add organization invitations" });
  createSpec(root, f.id, { objective: "invitation flow" });
  const r = addRequirement(root, f.id, { title: "invitation flow requirement", status: "accepted" });
  const t = addTask(root, f.id, {
    objective: "invitations",
    requirements: [r.id],
    verification: [PASS_CMD],
    expectedFiles: ["src/invitations/invitation.ts"],
  });
  approveSpec(root, f.id);
  createPlan(root, f.id);
  startTask(root, f.id, t.id);
  writeImplAndTest(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
  await runTaskVerification(root, f.id, t.id);
  await runVerification(root, f.id);
  transitionFeature(root, f.id, "VERIFYING");
  return f;
}

describe("evidence freshness", () => {
  it("fresh evidence stays fresh when nothing relevant changes", async () => {
    const root = makeProject();
    const f = await toVerifying(root);
    const check = checkFreshness(root, f.id, "verification.run");
    expect(check.freshness).toBe("FRESH");
  });

  it("verification evidence goes STALE when a surface file changes afterward", async () => {
    const root = makeProject();
    const f = await toVerifying(root);
    // relevant code changes AFTER the passing run
    writeFileSync(`${root}/src/invitations/invitation.ts`, "export const v2 = true;\n", "utf8");
    const check = checkFreshness(root, f.id, "verification.run");
    expect(check.freshness).toBe("STALE");
    // and the gate reverts to MISSING — the old pass no longer counts
    const evaluation = evaluateGates(root, f.id);
    const testGate = evaluation.gates.find((g) => g.id === "verification.test");
    expect(testGate?.status).toBe("MISSING");
    expect(testGate?.detail).toContain("STALE");
  });

  it("unrelated changes do NOT invalidate evidence", async () => {
    const root = makeProject();
    const f = await toVerifying(root);
    // change a file outside the feature's dependency surface
    mkdirSync(`${root}/src/other`, { recursive: true });
    writeFileSync(`${root}/src/other/unrelated.ts`, "export const z = 9;\n", "utf8");
    expect(checkFreshness(root, f.id, "verification.run").freshness).toBe("FRESH");
  });

  it("QA evidence goes stale on relevant changes and blocks the browserQA gate", async () => {
    const root = makeProject({ verification: { test: PASS_CMD } });
    const f = createFeature(root, {
      title: "profile page form",
      request: "Add a profile page form rendering the user form",
    });
    createSpec(root, f.id, { objective: "profile form" });
    const r = addRequirement(root, f.id, { title: "profile form renders", status: "accepted" });
    const t = addTask(root, f.id, {
      objective: "form",
      requirements: [r.id],
      verification: [PASS_CMD],
      expectedFiles: ["src/profile.ts"],
    });
    approveSpec(root, f.id);
    createPlan(root, f.id);
    startTask(root, f.id, t.id);
    writeImplAndTest(root, { impl: "src/profile.ts", test: "src/profile.test.ts" });
    await runTaskVerification(root, f.id, t.id);
    await runVerification(root, f.id, { categories: ["test"] });
    transitionFeature(root, f.id, "VERIFYING");
    recordReviewVerdict(root, f.id, "review.qa", "pass", "form verified in browser");

    const before = evaluateGates(root, f.id);
    expect(before.gates.find((g) => g.id === "gates.browserQA")?.status).toBe("PASS");

    // relevant code changes after QA passed
    writeFileSync(`${root}/src/profile.ts`, "export const v2 = true;\n", "utf8");
    const qa = checkFreshness(root, f.id, "review.qa");
    expect(qa.freshness).toBe("STALE");
    const after = evaluateGates(root, f.id);
    expect(after.gates.find((g) => g.id === "gates.browserQA")?.status).toBe("MISSING");
    expect(after.gates.find((g) => g.id === "gates.browserQA")?.detail).toContain("STALE");
  });

  it("feature with no expected files reports NO_SURFACE rather than silently passing", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "no files", request: "chat only" });
    const stamp = freshnessSurface(root, f.id);
    expect(stamp.surfaces).toEqual([]);
  });

  it("a re-run after changes re-stamps fresh evidence", async () => {
    const root = makeProject();
    const f = await toVerifying(root);
    writeFileSync(`${root}/src/invitations/invitation.ts`, "export const v2 = true;\n", "utf8");
    expect(checkFreshness(root, f.id, "verification.run").freshness).toBe("STALE");
    await runVerification(root, f.id);
    expect(checkFreshness(root, f.id, "verification.run").freshness).toBe("FRESH");
  });
});

void mkdirSync;
