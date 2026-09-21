import { describe, expect, it } from "vitest";
import {
  addRequirement,
  addTask,
  approveSpec,
  captureBaseline,
  contextForFeature,
  contextForTask,
  createFeature,
  createPlan,
  createSpec,
  startTask,
  transitionFeature,
  StateError,
} from "../src/index.js";
import { makeProject, PASS_CMD } from "./helpers.js";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

describe("context packs", () => {
  it("packs the task, its requirements, verification, and blockers — nothing else", async () => {
    const root = makeProject();
    const f = createFeature(root, { title: "org invitations", request: "invitations" });
    createSpec(root, f.id, { objective: "invitations" });
    const r1 = addRequirement(root, f.id, { area: "INVITE", title: "send invite", status: "accepted" });
    const r2 = addRequirement(root, f.id, { area: "INVITE", title: "accept invite", status: "accepted" });
    const t = addTask(root, f.id, {
      objective: "implement invitation send",
      requirements: [r1.id, r2.id],
      verification: [PASS_CMD],
      testExpectations: ["invitation email queued"],
    });
    approveSpec(root, f.id);
    createPlan(root, f.id);
    startTask(root, f.id, t.id);

    const pack = contextForTask(root, t.id);
    expect(pack.markdown).toContain(t.id);
    expect(pack.markdown).toContain("implement invitation send");
    expect(pack.markdown).toContain(r1.id);
    expect(pack.markdown).toContain(r2.id);
    expect(pack.markdown).toContain(PASS_CMD);
    // does NOT dump unrelated content
    expect(pack.markdown).not.toContain("spec.meta");
  });

  it("lists protected dirty paths in the pack", async () => {
    const root = makeProject();
    execSync("git init -q", { cwd: root });
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm init", { cwd: root });
    writeFileSync(`${root}/user-file.txt`, "user work\n");
    await captureBaseline(root);

    const f = createFeature(root, { title: "ctx dirty" });
    const r = addRequirement(root, f.id, { title: "r", status: "accepted" });
    const t = addTask(root, f.id, { objective: "work", requirements: [r.id] });
    const pack = contextForTask(root, t.id);
    expect(pack.markdown).toContain("user-file.txt");
    expect(pack.markdown).toContain("NOT yours to modify");
  });

  it("throws for unknown tasks", () => {
    const root = makeProject();
    expect(() => contextForTask(root, "TASK-999")).toThrow(StateError);
  });

  it("summarizes a whole feature deterministically", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "feature pack" });
    addRequirement(root, f.id, { title: "r", status: "accepted" });
    const pack = contextForFeature(root, f.id);
    expect(pack.markdown).toContain("State: PROPOSED");
    expect(pack.markdown).toContain("REQ-CORE-001");
  });
});
