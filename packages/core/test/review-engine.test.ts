import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
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
  reviewDiff,
  readReview,
  resolveFinding,
} from "../src/index.js";

function setup(root: string, files: { impl: string; test: string }) {
  const f = createFeature(root, { title: "reviewed feature", request: "feature work" });
  createSpec(root, f.id, { objective: "reviewed work" });
  const r = addRequirement(root, f.id, { title: "reviewed requirement", status: "accepted" });
  addTask(root, f.id, {
    objective: "implement",
    requirements: [r.id],
    verification: [PASS_CMD],
    expectedFiles: [files.impl],
  });
  return f;
}

describe("repository-aware diff review", () => {
  it("flags scope drift as WARNING and records findings in state", () => {
    const root = makeProject();
    const f = setup(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
    writeImplAndTest(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
    mkdirSync(`${root}/src/random`, { recursive: true });
    writeFileSync(`${root}/src/random/unexpected.ts`, "export const u = 1;\n", "utf8");

    const result = reviewDiff(root, f.id, {
      changed: ["src/invitations/invitation.ts", "src/invitations/invitation.test.ts", "src/random/unexpected.ts"],
    });
    expect(result.findings.some((x) => x.issue.includes("scope drift"))).toBe(true);
    expect(result.summary.scopeDrift).toBe(1);
    // recorded into review.yaml
    const stored = readReview(root, f.id);
    expect(stored?.findings.length).toBeGreaterThan(0);
  });

  it("flags implementation changes with no test association", () => {
    const root = makeProject();
    const f = setup(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
    writeImplAndTest(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
    mkdirSync(`${root}/src/solo`, { recursive: true });
    writeFileSync(`${root}/src/solo/orphan.ts`, "export const o = 1;\n", "utf8");

    const result = reviewDiff(root, f.id, {
      changed: ["src/solo/orphan.ts"],
      record: false,
    });
    expect(result.findings.some((x) => x.issue.includes("no test imports it"))).toBe(true);
  });

  it("raises BLOCKERs for unsafe shortcuts and missing planned files", () => {
    const root = makeProject();
    const f = setup(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
    mkdirSync(`${root}/src/invitations`, { recursive: true });
    writeFileSync(
      `${root}/src/invitations/bad.ts`,
      "export const hack = eval('2+2');\nexport function noop() {}\n",
      "utf8"
    );
    const result = reviewDiff(root, f.id, {
      changed: ["src/invitations/bad.ts", "src/invitations/invitation.ts"],
      record: false,
    });
    expect(result.findings.some((x) => x.severity === "BLOCKER" && x.issue.includes("eval()"))).toBe(true);
    // planned file missing from disk although work is claimed
    expect(result.findings.some((x) => x.severity === "BLOCKER" && x.issue.includes("planned file does not exist"))).toBe(true);
  });

  it("notes TODOs left in changed code", () => {
    const root = makeProject();
    const f = setup(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
    mkdirSync(`${root}/src/invitations`, { recursive: true });
    writeFileSync(`${root}/src/invitations/invitation.ts`, "export const a = 1; // TODO finish\n", "utf8");
    const result = reviewDiff(root, f.id, { changed: ["src/invitations/invitation.ts"], record: false });
    expect(result.findings.some((x) => x.severity === "NOTE" && x.issue.includes("TODO"))).toBe(true);
  });

  it("detects copy-paste duplication between two changed files", () => {
    const root = makeProject();
    const f = setup(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
    mkdirSync(`${root}/src/invitations`, { recursive: true });
    const body = 'export function shared() {\n  return "' + "x".repeat(300) + '";\n}\n';
    writeFileSync(`${root}/src/invitations/a.ts`, body, "utf8");
    writeFileSync(`${root}/src/invitations/b.ts`, body, "utf8");
    const result = reviewDiff(root, f.id, {
      changed: ["src/invitations/a.ts", "src/invitations/b.ts"],
      record: false,
    });
    expect(result.findings.some((x) => x.issue.includes("identical to"))).toBe(true);
  });

  it("resolveFinding removes resolved findings from the gate view", () => {
    const root = makeProject();
    const f = setup(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
    writeImplAndTest(root, { impl: "src/invitations/invitation.ts", test: "src/invitations/invitation.test.ts" });
    // a drifted file guarantees at least one finding is recorded
    mkdirSync(`${root}/src/random`, { recursive: true });
    writeFileSync(`${root}/src/random/unexpected.ts`, "export const u = 1;\n", "utf8");
    reviewDiff(root, f.id, { changed: ["src/invitations/invitation.ts", "src/random/unexpected.ts"] });
    const stored = readReview(root, f.id)!;
    expect(stored.findings.length).toBeGreaterThan(0);
    resolveFinding(root, f.id, stored.findings[0].id);
    expect(readReview(root, f.id)!.findings.find((x) => x.id === stored.findings[0].id)).toBeUndefined();
  });
});
