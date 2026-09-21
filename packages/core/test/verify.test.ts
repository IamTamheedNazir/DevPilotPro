import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  addRequirement,
  addTask,
  approveSpec,
  brainPaths,
  createFeature,
  createPlan,
  createSpec,
  evidenceFor,
  Ledger,
  redact,
  runTaskVerification,
  runVerification,
  startTask,
  summarize,
} from "../src/index.js";

/** Drive PROPOSED → APPROVED through the real spec flow. */
function approvePlan(root: string, featureId: string, objective: string) {
  createSpec(root, featureId, { objective });
  approveSpec(root, featureId);
}
import { makeProject, PASS_CMD, FAIL_CMD } from "./helpers.js";

describe("command execution", () => {
  it("observes success (exit 0) as evidence", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "verify me" });
    const { executions } = await runVerification(root, f.id);
    expect(executions.length).toBeGreaterThan(0);
    for (const e of executions) {
      expect(e.success).toBe(true);
      expect(e.exitCode).toBe(0);
    }
  });

  it("captures failures without throwing", async () => {
    const root = makeProject({ verification: { test: FAIL_CMD } });
    const f = createFeature(root, { title: "failing feature" });
    const { executions } = await runVerification(root, f.id, { categories: ["test"] });
    expect(executions).toHaveLength(1);
    expect(executions[0].success).toBe(false);
    expect(executions[0].exitCode).toBe(1);
    expect(executions[0].stderrSummary).toContain("synthetic failure");
  });

  it("redacts secrets from stored output", () => {
    const redacted = redact("token sk_live_abcdef123456 and password=hunter2 with AKIAIOSFODNN7EXAMPLE");
    expect(redacted).not.toContain("sk_live_abcdef123456");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(redacted).toContain("[REDACTED");
  });

  it("truncates enormous output", () => {
    const huge = "x".repeat(100_000);
    const summary = summarize(huge);
    expect(summary.length).toBeLessThan(3000);
    expect(summary).toContain("truncated");
  });

  it("persists evidence summaries and ledger events traceable to the feature", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "evidence feature" });
    await runVerification(root, f.id);
    const records = evidenceFor(root, f.id);
    const runs = records.filter((r) => r.kind === "verification.run");
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(r.payload?.["featureId"]).toBe(f.id);
      expect(typeof r.payload?.["exitCode"]).toBe("number");
      expect(typeof r.payload?.["evidenceFile"]).toBe("string");
      const evidencePath = path.join(root, String(r.payload?.["evidenceFile"]));
      expect(existsSync(evidencePath)).toBe(true);
      const stored = JSON.parse(readFileSync(evidencePath, "utf8"));
      expect(stored.featureId).toBe(f.id);
      expect(typeof stored.outputHash).toBe("string");
    }
    // ledger chain still intact
    expect(new Ledger(brainPaths(root).ledgerJsonl).verify().ok).toBe(true);
  });
});

describe("task verification", () => {
  it("records evidence against the task and allows DONE only when commands pass", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "task evidence" });
    const r = addRequirement(root, f.id, { title: "r", status: "accepted" });
    const t = addTask(root, f.id, {
      objective: "work",
      requirements: [r.id],
      verification: [PASS_CMD],
    });
    approvePlan(root, f.id, "task evidence fixture");
    createPlan(root, f.id);
    startTask(root, f.id, t.id);
    const result = await runTaskVerification(root, f.id, t.id);
    expect(result.done).toBe(true);
    const records = evidenceFor(root, f.id).filter(
      (e) => e.kind === "verification.run" && e.payload?.["taskId"] === t.id
    );
    expect(records.length).toBe(1);
    expect(records[0].payload?.["success"]).toBe(true);
  });

  it("refuses DONE when a task verification command failed", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "task fails" });
    const r = addRequirement(root, f.id, { title: "r", status: "accepted" });
    const t = addTask(root, f.id, {
      objective: "broken work",
      requirements: [r.id],
      verification: [FAIL_CMD],
    });
    approvePlan(root, f.id, "failing verification fixture");
    createPlan(root, f.id);
    startTask(root, f.id, t.id);
    const result = await runTaskVerification(root, f.id, t.id);
    expect(result.done).toBe(false);
    const task = (await import("../src/index.js")).getTask(root, f.id, t.id);
    expect(task.status).not.toBe("DONE");
  });

  it("refuses DONE with no evidence at all (claims are not evidence)", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "no evidence" });
    const r = addRequirement(root, f.id, { title: "r", status: "accepted" });
    const t = addTask(root, f.id, {
      objective: "claimed work",
      requirements: [r.id],
      verification: [PASS_CMD],
    });
    approvePlan(root, f.id, "no-evidence fixture");
    createPlan(root, f.id);
    startTask(root, f.id, t.id);
    const { setTaskStatus } = await import("../src/index.js");
    expect(() => setTaskStatus(root, f.id, t.id, "DONE")).toThrow(/no passing evidence/);
  });
});
