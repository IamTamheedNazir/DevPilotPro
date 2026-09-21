import { describe, expect, it } from "vitest";
import {
  addRequirement,
  addTask,
  approveSpec,
  completeFeature,
  createFeature,
  createSpec,
  evaluateGates,
  recordReviewVerdict,
  runTaskVerification,
  runVerification,
  startTask,
  transitionFeature,
  createPlan,
} from "../src/index.js";
import { makeProject, PASS_CMD, FAIL_CMD } from "./helpers.js";

/** Drive a feature to VERIFYING with everything done except verdicts/commands. */
async function toVerifying(
  root: string,
  opts?: { requirements?: number; runTask?: boolean }
) {
  const f = createFeature(root, { title: "feature under gate test", request: "plain feature work" });
  createSpec(root, f.id, { objective: "ship the thing" });
  const count = opts?.requirements ?? 1;
  const reqIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = addRequirement(root, f.id, { title: `req ${i + 1}`, status: "accepted" });
    reqIds.push(r.id);
  }
  const t = addTask(root, f.id, {
    objective: "do all the work",
    requirements: reqIds,
    verification: [PASS_CMD],
  });
  approveSpec(root, f.id);
  createPlan(root, f.id);
  startTask(root, f.id, t.id);
  if (opts?.runTask !== false) {
    await runTaskVerification(root, f.id, t.id);
  }
  transitionFeature(root, f.id, "VERIFYING");
  return f;
}

describe("Definition-of-Done gates", () => {
  it("refuses completion when the agent merely claims it (no verification evidence)", async () => {
    const root = makeProject(); // commands configured but NEVER executed
    const f = await toVerifying(root, { runTask: false });
    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(false);
    expect(outcome.evaluation.verdict.verdict).toBe("NOT_COMPLETE");
    const details = outcome.evaluation.verdict.remainingGates.join("\n");
    expect(details).toContain("All tasks resolved");
  });

  it("refuses completion when tests were executed and FAILED", async () => {
    const root = makeProject({
      verification: { test: FAIL_CMD, typecheck: PASS_CMD, lint: PASS_CMD, build: PASS_CMD },
    });
    const f = await toVerifying(root);
    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(false);
    const testGate = outcome.evaluation.gates.find((g) => g.id === "verification.test");
    expect(testGate?.status).toBe("FAIL");
  });

  it("refuses completion when one of five requirements is not implemented", async () => {
    const root = makeProject();
    const f = await toVerifying(root, { requirements: 5 });
    // REQ-PROFILE-005 style: 4 covered by the DONE task? No — the task lists all 5,
    // so remove coverage by marking one requirement superseded after the fact is
    // not allowed; instead assert the uncovered path directly: add a 5th accepted
    // requirement that no task references.
    const extra = addRequirement(root, f.id, { title: "late requirement", status: "accepted" });
    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(false);
    expect(outcome.evaluation.gates.find((g) => g.id === "requirements.implemented")?.detail).toContain(extra.id);
  });

  it("refuses completion when a required security review is missing", async () => {
    const root = makeProject();
    const f = createFeature(root, {
      title: "org invitations with admin permission",
      request: "Add org invitations; admins can authorize members by email (authentication surface)",
    });
    createSpec(root, f.id, { objective: "invitations" });
    const r = addRequirement(root, f.id, { title: "invite", status: "accepted" });
    const t = addTask(root, f.id, { objective: "invites", requirements: [r.id], verification: [PASS_CMD] });
    approveSpec(root, f.id);
    createPlan(root, f.id);
    startTask(root, f.id, t.id);
    await runTaskVerification(root, f.id, t.id);
    transitionFeature(root, f.id, "VERIFYING");

    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(false);
    const sec = outcome.evaluation.gates.find((g) => g.id === "gates.securityReview");
    expect(sec?.status).toBe("MISSING");
  });

  it("permits completion when all applicable gates pass", async () => {
    const root = makeProject();
    const f = await toVerifying(root);
    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(true);
    expect(outcome.evaluation.verdict.verdict).toBe("COMPLETE_ELIGIBLE");
    expect(outcome.evaluation.gates.every((g) => g.status === "PASS" || g.status === "NOT_REQUIRED")).toBe(true);
  });

  it("does not require irrelevant gates (no UI → browser QA not required)", async () => {
    const root = makeProject();
    const f = await toVerifying(root);
    const evaluation = evaluateGates(root, f.id);
    const qa = evaluation.gates.find((g) => g.id === "gates.browserQA");
    expect(qa?.status).toBe("NOT_REQUIRED");
  });

  it("requires browser QA for UI surfaces and accepts recorded QA evidence", async () => {
    const root = makeProject();
    const f = createFeature(root, {
      title: "profile page",
      request: "Add a profile page rendering the user form and button",
    });
    createSpec(root, f.id, { objective: "profile page" });
    const r = addRequirement(root, f.id, { title: "profile renders", status: "accepted" });
    const t = addTask(root, f.id, { objective: "render profile", requirements: [r.id], verification: [PASS_CMD] });
    approveSpec(root, f.id);
    createPlan(root, f.id);
    startTask(root, f.id, t.id);
    await runTaskVerification(root, f.id, t.id);
    transitionFeature(root, f.id, "VERIFYING");

    // without QA evidence: blocked
    const blocked = await completeFeature(root, f.id);
    expect(blocked.completed).toBe(false);
    expect(blocked.evaluation.gates.find((g) => g.id === "gates.browserQA")?.status).toBe("MISSING");

    // with recorded QA evidence: completes
    recordReviewVerdict(root, f.id, "review.qa", "pass", "profile flow verified in browser");
    const allowed = await completeFeature(root, f.id);
    expect(allowed.completed).toBe(true);
  });

  it("fails on unresolved BLOCKED tasks and open BLOCKER findings", async () => {
    const root = makeProject();
    const f = await toVerifying(root);
    const { addFindings } = await import("../src/index.js");
    addFindings(root, f.id, {
      scope: "diff",
      findings: [{ severity: "BLOCKER", issue: "unsafe shortcut: disables authz check", file: "src/a.ts" }],
    });
    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(false);
    expect(outcome.evaluation.gates.find((g) => g.id === "gates.blockers")?.status).toBe("FAIL");
    void runVerification;
    void FAIL_CMD;
  });
});
