import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  addRequirement,
  addTask,
  approveSpec,
  completeFeature,
  captureBaseline,
  createFeature,
  createPlan,
  createSpec,
  startTask,
  runTaskVerification,
  transitionFeature,
} from "../src/index.js";
import { makeProject, PASS_CMD, writeImplAndTest } from "./helpers.js";

describe("git safety", () => {
  it("pre-existing dirty user files survive the complete workflow untouched", async () => {
    const root = makeProject();
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
    execSync("git init -q", { cwd: root });
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: root });

    // user has uncommitted work in progress
    const userFile = path.join(root, "notes.md");
    writeFileSync(userFile, "draft: half-written by the user\n", "utf8");
    const trackedFile = path.join(root, "package.json");
    const before = {
      untracked: readFileSync(userFile, "utf8"),
      tracked: readFileSync(trackedFile, "utf8"),
    };

    await captureBaseline(root);

    // full workflow
    const f = createFeature(root, { title: "safe workflow", request: "plain work" });
    createSpec(root, f.id, { objective: "safe" });
    const r = addRequirement(root, f.id, { title: "r", status: "accepted" });
    const t = addTask(root, f.id, { objective: "work", requirements: [r.id], verification: [PASS_CMD], expectedFiles: ["src/widget.ts"] });
    approveSpec(root, f.id);
    createPlan(root, f.id);
    startTask(root, f.id, t.id);
    writeImplAndTest(root, { impl: "src/widget.ts", test: "src/widget.test.ts" });
    await runTaskVerification(root, f.id, t.id);
    transitionFeature(root, f.id, "VERIFYING");
    const outcome = await completeFeature(root, f.id);
    expect(outcome.completed).toBe(true);

    // the user's files are byte-identical and still untracked/uncommitted
    expect(readFileSync(userFile, "utf8")).toBe(before.untracked);
    expect(readFileSync(trackedFile, "utf8")).toBe(before.tracked);
    const status = execSync("git status --porcelain", { cwd: root, encoding: "utf8" });
    expect(status).toContain("?? notes.md");
    expect(status).not.toContain("M package.json");
  });
});
