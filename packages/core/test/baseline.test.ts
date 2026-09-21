import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import {
  captureBaseline,
  classifyFailure,
  readBaseline,
  runCommand,
} from "../src/index.js";
import { makeProject, PASS_CMD, FAIL_CMD } from "./helpers.js";

describe("baseline", () => {
  it("captures revision, dirty paths, and pre-existing failures", async () => {
    const root = makeProject({ verification: { test: FAIL_CMD } });
    const baseline = await captureBaseline(root, { categories: ["test"] });
    expect(baseline.failing).toHaveLength(1);
    expect(baseline.failing[0].command).toBe(FAIL_CMD);
    expect(baseline.failing[0].summary).not.toContain("synthetic failure"); // only a signature, not logs
    expect(readBaseline(root)?.capturedAt).toBe(baseline.capturedAt);
  });

  it("distinguishes a pre-existing failure from a regression", async () => {
    const root = makeProject({ verification: { test: FAIL_CMD, typecheck: PASS_CMD } });
    const baseline = await captureBaseline(root);

    // Same command, same output → PRE_EXISTING
    const sameFailure = await runCommand(root, { command: FAIL_CMD, category: "test" });
    expect(classifyFailure(baseline, sameFailure)).toBe("PRE_EXISTING");

    // Different failing output → REGRESSION
    const regression = await runCommand(root, {
      command: 'node -e "console.error(\'new crash: boom\'); process.exit(1)"',
      category: "test",
    });
    expect(classifyFailure(baseline, regression)).toBe("REGRESSION");

    // No baseline at all → treat as regression (conservative)
    expect(classifyFailure(null, sameFailure)).toBe("REGRESSION");
  });

  it("records protected dirty paths from git status", async () => {
    const root = makeProject({ verification: { test: PASS_CMD } });
    // simulate a git repo so status works
    const { execSync } = await import("node:child_process");
    execSync("git init -q", { cwd: root });
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: root });
    writeFileSync(path.join(root, "user-draft.txt"), "user's own work\n");
    writeFileSync(path.join(root, "README.md"), "user edit\n", "utf8");

    const baseline = await captureBaseline(root);
    expect(baseline.dirtyPaths).toContain("user-draft.txt");
    expect(baseline.dirtyPaths.some((p) => p.includes("README.md"))).toBe(true);
  });
});
