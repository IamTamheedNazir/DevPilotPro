import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  addRequirement,
  addTask,
  approveSpec,
  completeFeature,
  createFeature,
  createPlan,
  createSpec,
  contextForTask,
  evaluateGates,
  evidenceFor,
  getFeature,
  listFeatures,
  recordReviewVerdict,
  runTaskVerification,
  startTask,
  transitionFeature,
  runVerification,
} from "../src/index.js";
import { makeProject, PASS_CMD, FAIL_CMD, writeImplAndTest } from "./helpers.js";

/**
 * SECTION 25 — end-to-end fixture evaluation.
 * Feature: "Add profile display name."
 * REQ-PROFILE-001..003, exercised through the full lifecycle:
 * init → spec → approve → plan → build/task lifecycle → verification →
 * evidence → COMPLETE. Plus the failure scenario where tests fail and the
 * feature must NOT reach COMPLETE.
 */
describe("end-to-end fixture: profile display name", () => {
  it("walks the full lifecycle to COMPLETE with evidence at every step", async () => {
    const root = makeProject();

    // ── spec ────────────────────────────────────────────────────────────
    const feature = createFeature(root, {
      title: "profile display name",
      request: "Add profile display name.",
    });
    const spec = createSpec(root, feature.id, {
      objective: "Users can set a display name shown on their profile.",
      personas: ["signed-in user"],
      expectedBehavior: [
        "User can save a display name from the profile page",
        "Saved display name appears on the profile",
        "Names longer than the maximum are rejected with a clear error",
      ],
      outOfScope: ["changing the username"],
      acceptanceCriteria: ["display name persists after reload"],
    });
    expect(spec.approved).toBe(false);

    // ── requirements ────────────────────────────────────────────────────
    const r1 = addRequirement(root, feature.id, {
      area: "PROFILE",
      title: "User can save a display name",
      status: "accepted",
      acceptance: ["saving persists a display name"],
    });
    const r2 = addRequirement(root, feature.id, {
      area: "PROFILE",
      title: "Display name cannot exceed defined maximum",
      status: "accepted",
      acceptance: ["over-limit input is rejected"],
    });
    const r3 = addRequirement(root, feature.id, {
      area: "PROFILE",
      title: "Saved display name appears on profile",
      status: "accepted",
      acceptance: ["profile renders the saved name"],
    });
    expect(r1.id).toBe("REQ-PROFILE-001");
    expect(r2.id).toBe("REQ-PROFILE-002");
    expect(r3.id).toBe("REQ-PROFILE-003");

    // ── plan (tasks trace to requirements) ─────────────────────────────
    const task = addTask(root, feature.id, {
      objective: "Implement display name save, validation, and rendering",
      requirements: [r1.id, r2.id, r3.id],
      expectedFiles: ["src/profile.ts", "src/profile.test.ts"],
      verification: [PASS_CMD],
    });
    approveSpec(root, feature.id);
    const plan = createPlan(root, feature.id);
    expect(plan.taskOrder).toEqual([task.id]);
    expect(getFeature(root, feature.id).state).toBe("PLANNED");

    // ── build/task lifecycle ────────────────────────────────────────────
    // The implementation actually exists on disk (the guardian verifies
    // requirement surfaces against the real repository).
    writeImplAndTest(root, { impl: "src/profile.ts", test: "src/profile.test.ts" });
    startTask(root, feature.id, task.id);
    expect(getFeature(root, feature.id).state).toBe("IMPLEMENTING");
    const taskResult = await runTaskVerification(root, feature.id, task.id);
    expect(taskResult.done).toBe(true);
    transitionFeature(root, feature.id, "VERIFYING");

    // ── verification + evidence ─────────────────────────────────────────
    // UI surfaces → browser QA required; record the QA verdict as evidence.
    const pre = await completeFeature(root, feature.id);
    expect(pre.completed).toBe(false); // QA evidence missing
    recordReviewVerdict(root, feature.id, "review.qa", "pass", "display name flow verified in browser");

    const outcome = await completeFeature(root, feature.id);
    expect(outcome.completed).toBe(true);
    expect(getFeature(root, feature.id).state).toBe("COMPLETE");

    // evidence trail: feature ↔ task ↔ requirement linkage
    const evidence = evidenceFor(root, feature.id);
    const kinds = new Set(evidence.map((e) => e.kind));
    expect([...kinds]).toEqual(
      expect.arrayContaining([
        "feature.created",
        "spec.created",
        "spec.approved",
        "requirement.created",
        "plan.created",
        "task.started",
        "verification.run",
        "review.qa",
        "feature.state",
      ])
    );
    const runEvents = evidence.filter((e) => e.kind === "verification.run");
    expect(runEvents.every((e) => e.payload?.["featureId"] === feature.id)).toBe(true);
    const persisted = runEvents.filter((e) =>
      existsSync(path.join(root, String(e.payload?.["evidenceFile"])))
    );
    expect(persisted.length).toBeGreaterThan(0);

    // spec markdown is human-readable and diffable
    const specMd = readFileSync(path.join(root, ".steward", "features", feature.id, "spec.md"), "utf8");
    expect(specMd).toContain("Objective: Users can set a display name");
    expect(specMd).toContain("Status: APPROVED");
  });

  it("cannot reach COMPLETE when tests fail (the most important Phase 2 test)", async () => {
    const root = makeProject({
      verification: { test: FAIL_CMD, typecheck: PASS_CMD, lint: PASS_CMD, build: PASS_CMD },
    });
    const feature = createFeature(root, {
      title: "broken profile change",
      request: "profile work",
    });
    createSpec(root, feature.id, { objective: "profile work" });
    const r = addRequirement(root, feature.id, { title: "r", status: "accepted" });
    const t = addTask(root, feature.id, { objective: "work", requirements: [r.id], verification: [PASS_CMD] });
    approveSpec(root, feature.id);
    createPlan(root, feature.id);
    startTask(root, feature.id, t.id);
    await runTaskVerification(root, feature.id, t.id);
    transitionFeature(root, feature.id, "VERIFYING");

    const outcome = await completeFeature(root, feature.id);
    expect(outcome.completed).toBe(false);
    expect(outcome.evaluation.verdict.verdict).toBe("NOT_COMPLETE");
    expect(outcome.evaluation.verdict.remainingGates.join("\n")).toContain("Verification: test");
    expect(getFeature(root, feature.id).state).toBe("VERIFYING"); // never COMPLETE
  });

  it("works end-to-end from listFeatures (deterministic lookup, no conversational memory)", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "lookup check" });
    const found = listFeatures(root);
    expect(found.map((x) => x.id)).toContain(f.id);
    const pack = contextForTask(root, addTask(root, f.id, { objective: "only task" }).id);
    expect(pack.title).toContain("TASK-001");
  });

  it("PHASE 3: relevant code changes after passing verification → evidence goes STALE, feature cannot complete", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "stale after change", request: "plain work" });
    createSpec(root, f.id, { objective: "stale check" });
    const r = addRequirement(root, f.id, { title: "stale requirement", status: "accepted" });
    const t = addTask(root, f.id, {
      objective: "work",
      requirements: [r.id],
      verification: [PASS_CMD],
      expectedFiles: ["src/widget.ts"],
    });
    approveSpec(root, f.id);
    createPlan(root, f.id);
    startTask(root, f.id, t.id);
    writeImplAndTest(root, { impl: "src/widget.ts", test: "src/widget.test.ts" });
    await runTaskVerification(root, f.id, t.id);
    transitionFeature(root, f.id, "VERIFYING");

    // everything is fresh: eligible
    const before = await completeFeature(root, f.id);
    expect(before.completed).toBe(true);

    // but the feature was REOPENED conceptually: change the surface afterward.
    // Reopen by transitioning back through the machine's legal path (VERIFYING
    // is not reachable from COMPLETE, so we assert on a second feature: the
    // freshness property itself is covered by freshness.test.ts; here we prove
    // the flow end-to-end on a fresh feature whose code moves mid-flight).
    const f2 = createFeature(root, { title: "stale mid flight", request: "plain work" });
    createSpec(root, f2.id, { objective: "stale mid flight" });
    const r2 = addRequirement(root, f2.id, { title: "mid flight requirement", status: "accepted" });
    const t2 = addTask(root, f2.id, {
      objective: "work",
      requirements: [r2.id],
      verification: [PASS_CMD],
      expectedFiles: ["src/mid.ts"],
    });
    approveSpec(root, f2.id);
    createPlan(root, f2.id);
    startTask(root, f2.id, t2.id);
    writeImplAndTest(root, { impl: "src/mid.ts", test: "src/mid.test.ts" });
    await runTaskVerification(root, f2.id, t2.id);
    await runVerification(root, f2.id); // project-level evidence with surface stamp
    transitionFeature(root, f2.id, "VERIFYING");

    // code changes AFTER the run: the recorded pass no longer describes the
    // current code. Gate evaluation must treat the old evidence as stale —
    // the feature cannot be declared complete on yesterday's run.
    writeFileSync(path.join(root, "src", "mid.ts"), "export const moved = true;\n", "utf8");

    // Direct gate evaluation (no re-run): stale verification evidence must
    // be reported, so a completion claim on stale evidence is refused.
    const staleEvaluation = evaluateGates(root, f2.id);
    const testGate = staleEvaluation.gates.find((g) => g.id === "verification.test");
    expect(testGate?.status).toBe("MISSING");
    expect(testGate?.detail).toContain("STALE");
    expect(staleEvaluation.verdict.verdict).toBe("NOT_COMPLETE");

    // completeFeature re-runs verification first (fresh evidence) — proving
    // the recovery path is a re-run, never a claim.
    const after = await completeFeature(root, f2.id);
    expect(after.completed).toBe(true);
    expect(after.evaluation.gates.find((g) => g.id === "verification.test")?.detail).toContain("fresh");
  });

  it("PHASE 3: partial implementation with passing tests is refused (guardian blocks COMPLETE)", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "half done", request: "plain work" });
    createSpec(root, f.id, { objective: "half done" });
    const r = addRequirement(root, f.id, { title: "half done requirement", status: "accepted" });
    const t = addTask(root, f.id, {
      objective: "work",
      requirements: [r.id],
      verification: [PASS_CMD],
      expectedFiles: ["src/ghost.ts"], // declared but never written
    });
    approveSpec(root, f.id);
    createPlan(root, f.id);
    startTask(root, f.id, t.id);
    await runTaskVerification(root, f.id, t.id); // synthetic pass
    transitionFeature(root, f.id, "VERIFYING");

    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(false);
    const guardian = outcome.evaluation.gates.find((g) => g.id === "gates.guardian");
    expect(guardian?.status).toBe("FAIL");
    expect(outcome.evaluation.verdict.verdict).toBe("NOT_COMPLETE");
  });
});
