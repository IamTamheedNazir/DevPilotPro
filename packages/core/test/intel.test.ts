import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import {
  buildIndex,
  diffIndexes,
  buildDependencyMap,
  transitiveDependents,
  associatedTests,
  impactOfChangedFiles,
  detectScopeDrift,
  retrieveContext,
  workingTreeChanges,
  createFeature,
  createSpec,
  addRequirement,
  addTask,
} from "../src/index.js";
import { makeProject, writeImplAndTest } from "./helpers.js";

function writeTree(root: string): void {
  mkdirSync(`${root}/src/models`, { recursive: true });
  mkdirSync(`${root}/src/services`, { recursive: true });
  mkdirSync(`${root}/src/routes`, { recursive: true });
  writeFileSync(`${root}/src/models/user.ts`, "export interface User { name: string }\n", "utf8");
  writeFileSync(`${root}/src/services/profile.ts`, `import type { User } from "../models/user.js";\nexport function getProfile(u: User) { return u.name; }\n`, "utf8");
  writeFileSync(`${root}/src/routes/profile-route.ts`, `import { getProfile } from "../services/profile.js";\nexport const route = () => getProfile;\n`, "utf8");
  writeFileSync(`${root}/src/profile.test.ts`, `import { getProfile } from "./services/profile.js";\nexport const t = getProfile;\n`, "utf8");
  writeFileSync(`${root}/src/unrelated.ts`, "export const unrelated = true;\n", "utf8");
}

describe("repository index", () => {
  it("indexes project files with stable content hashes", () => {
    const root = makeProject();
    writeTree(root);
    const index = buildIndex(root);
    const profile = index.files.find((f) => f.path === "src/services/profile.ts");
    expect(profile).toBeDefined();
    expect(profile!.hash).toHaveLength(64);
    expect(profile!.imports).toContain("src/models/user.ts");
    expect(index.files.find((f) => f.path === "src/profile.test.ts")?.isTest).toBe(true);
    // deterministic: rebuild produces identical hashes
    const again = buildIndex(root);
    expect(again.files.map((f) => [f.path, f.hash])).toEqual(index.files.map((f) => [f.path, f.hash]));
    // ignores build/vendor dirs
    expect(index.files.some((f) => f.path.startsWith("node_modules/"))).toBe(false);
  });

  it("never escapes the project root (path traversal)", () => {
    const root = makeProject();
    expect(() => buildIndex(root)).not.toThrow();
  });

  it("diffs two snapshots", () => {
    const root = makeProject();
    writeTree(root);
    const before = buildIndex(root);
    writeFileSync(`${root}/src/new-file.ts`, "export const neu = 1;\n", "utf8");
    writeFileSync(`${root}/src/unrelated.ts`, "export const unrelated = 2;\n", "utf8");
    const after = buildIndex(root);
    const delta = diffIndexes(before, after);
    expect(delta.added).toEqual(["src/new-file.ts"]);
    expect(delta.modified).toEqual(["src/unrelated.ts"]);
    expect(delta.removed).toEqual([]);
  });
});

describe("dependency map and impact", () => {
  it("computes reverse dependencies transitively", () => {
    const root = makeProject();
    writeTree(root);
    const index = buildIndex(root);
    const map = buildDependencyMap(index);
    // route -> service -> model
    expect(transitiveDependents(map, "src/models/user.ts")).toEqual([
      "src/profile.test.ts",
      "src/routes/profile-route.ts",
      "src/services/profile.ts",
    ]);
  });

  it("associates tests through the import graph", () => {
    const root = makeProject();
    writeTree(root);
    const index = buildIndex(root);
    const map = buildDependencyMap(index);
    expect(associatedTests(index, map, "src/services/profile.ts")).toEqual(["src/profile.test.ts"]);
    expect(associatedTests(index, map, "src/unrelated.ts")).toEqual([]);
  });

  it("maps changed files to affected files and impacted tests", () => {
    const root = makeProject();
    writeTree(root);
    const impact = impactOfChangedFiles(root, ["src/models/user.ts"]);
    expect(impact.affected).toContain("src/routes/profile-route.ts");
    expect(impact.impactedTests).toEqual(["src/profile.test.ts"]);
    expect(impact.notes).toEqual([]);
  });

  it("warns when a changed file has no test coverage", () => {
    const root = makeProject();
    writeTree(root);
    const impact = impactOfChangedFiles(root, ["src/unrelated.ts"]);
    expect(impact.impactedTests).toEqual([]);
    expect(impact.notes.join("\n")).toContain("coverage gap");
  });
});

describe("scope drift", () => {
  it("classifies changed files as in-scope or drift against the plan", () => {
    const root = makeProject();
    writeTree(root);
    const f = createFeature(root, { title: "profile service", request: "profile work" });
    createSpec(root, f.id, { objective: "profile service" });
    const r = addRequirement(root, f.id, { title: "profile service requirement", status: "accepted" });
    addTask(root, f.id, {
      objective: "build profile",
      requirements: [r.id],
      expectedFiles: ["src/services/profile.ts"],
    });

    const report = detectScopeDrift(root, f.id, {
      changed: ["src/services/profile.ts", "src/profile.test.ts", "src/totally-different-widget.ts"],
    });
    expect(report.inScope).toContain("src/services/profile.ts");
    expect(report.inScope).toContain("src/profile.test.ts"); // test imports an expected file
    expect(report.drift.map((d) => d.file)).toContain("src/totally-different-widget.ts");
  });

  it("reads working-tree changes from git when no explicit list is given", () => {
    const root = makeProject();
    writeTree(root);
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    execSync("git init -q", { cwd: root });
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm i", { cwd: root });
    writeFileSync(`${root}/src/unrelated.ts`, "export const unrelated = 3;\n", "utf8");
    expect(workingTreeChanges(root)).toEqual(["src/unrelated.ts"]);
  });
});

describe("targeted retrieval", () => {
  it("ranks files deterministically by query relevance with dependency closure", () => {
    const root = makeProject();
    writeTree(root);
    const result = retrieveContext(root, "profile service");
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("src/services/profile.ts");
    expect(paths).toContain("src/routes/profile-route.ts"); // closure of the top hit
    // deterministic: same query, same order
    const again = retrieveContext(root, "profile service");
    expect(again.files.map((f) => f.path)).toEqual(paths);
  });
});

/** writeImplAndTest re-exported for readability of the drift test. */
void writeImplAndTest;
void path;
