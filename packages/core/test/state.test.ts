import { describe, expect, it } from "vitest";
import {
  addRequirement,
  addTask,
  approveSpec,
  createFeature,
  createPlan,
  createSpec,
  getFeature,
  getRequirement,
  listTasks,
  refreshRisk,
  setRequirementStatus,
  startTask,
  transitionFeature,
} from "../src/index.js";
import { StateError } from "../src/state/ids.js";
import { makeProject } from "./helpers.js";

describe("requirements", () => {
  it("auto-assigns stable, sequential IDs per area", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "org invitations", request: "Add org invitations" });
    const a = addRequirement(root, f.id, { area: "INVITE", title: "Send invitation", status: "accepted" });
    const b = addRequirement(root, f.id, { area: "INVITE", title: "Accept invitation", status: "accepted" });
    expect(a.id).toBe("REQ-INVITE-001");
    expect(b.id).toBe("REQ-INVITE-002");
  });

  it("rejects duplicate requirement IDs", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "dupes" });
    addRequirement(root, f.id, { id: "REQ-INVITE-001", title: "one" });
    expect(() =>
      addRequirement(root, f.id, { id: "REQ-INVITE-001", title: "two" })
    ).toThrow(/duplicate requirement id/);
  });

  it("preserves traceability from requirement to feature", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "trace" });
    const r = addRequirement(root, f.id, { title: "linked" });
    const loaded = getRequirement(root, f.id, r.id);
    expect(loaded.featureId).toBe(f.id);
  });
});

describe("tasks and planning", () => {
  it("rejects tasks that reference unknown requirements", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "orphans" });
    expect(() =>
      addTask(root, f.id, { objective: "orphan work", requirements: ["REQ-NOPE-001"] })
    ).toThrow(/unknown requirement/);
  });

  it("rejects tasks that depend on unknown tasks", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "deps" });
    expect(() =>
      addTask(root, f.id, { objective: "later work", dependencies: ["TASK-099"] })
    ).toThrow(/unknown task/);
  });

  it("keeps dependency-aware readiness", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "ordering" });
    const r = addRequirement(root, f.id, { title: "r", status: "accepted" });
    const first = addTask(root, f.id, { objective: "first", requirements: [r.id] });
    const second = addTask(root, f.id, {
      objective: "second",
      requirements: [r.id],
      dependencies: [first.id],
    });
    expect(listTasks(root, f.id)).toHaveLength(2);
    createSpec(root, f.id, { objective: "ordering spec" });
    approveSpec(root, f.id);
    createPlan(root, f.id);
    // second depends on first: starting it out of order is refused
    expect(() => startTask(root, f.id, second.id)).toThrow(/not READY/);
  });

  it("plans only from an APPROVED spec", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "plan gate" });
    createSpec(root, f.id, { objective: "do the thing" });
    addRequirement(root, f.id, { title: "r", status: "accepted" });
    addTask(root, f.id, { objective: "t1" });
    expect(() => createPlan(root, f.id)).toThrow(/APPROVED spec/);
    approveSpec(root, f.id);
    const plan = createPlan(root, f.id);
    expect(plan.taskOrder).toHaveLength(1);
    expect(getFeature(root, f.id).state).toBe("PLANNED");
  });
});

describe("risk classification", () => {
  it("detects auth surfaces as HIGH and mandates security review", () => {
    const root = makeProject();
    const f = createFeature(root, {
      title: "add github login",
      request: "Add GitHub login with oauth sessions and admin permission checks",
    });
    const classification = refreshRisk(root, f.id);
    expect(classification.level).toBe("HIGH");
    expect(classification.signals).toContain("auth");
    expect(getFeature(root, f.id).requiredGates).toContain("securityReview");
  });

  it("does not mandate security review for plain UI text work", () => {
    const root = makeProject();
    const f = createFeature(root, {
      title: "update about page copy",
      request: "Reword the about page marketing copy",
    });
    const classification = refreshRisk(root, f.id);
    // UI copy work flags browser QA, never security review
    expect(classification.signals).toContain("ui");
    expect(classification.requiresSecurityReview).toBe(false);
    expect(getFeature(root, f.id).requiredGates).not.toContain("securityReview");
  });

  it("flags UI surfaces for browser QA", () => {
    const root = makeProject();
    const f = createFeature(root, {
      title: "profile display name",
      request: "Add a display name field to the profile page form",
    });
    const classification = refreshRisk(root, f.id);
    expect(classification.requiresBrowserQA).toBe(true);
    expect(getFeature(root, f.id).requiredGates).toContain("browserQA");
  });
});

describe("requirement status lifecycle", () => {
  it("supersedes without deleting history", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "history" });
    const r = addRequirement(root, f.id, { title: "v1" });
    setRequirementStatus(root, f.id, r.id, "superseded");
    expect(getRequirement(root, f.id, r.id).status).toBe("superseded");
    expect(() => addRequirement(root, f.id, { id: r.id, title: "v2" })).toThrow(/duplicate/);
  });
});

describe("state validation", () => {
  it("refuses invalid transitions with a clear error", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "bad jump" });
    expect(() => transitionFeature(root, f.id, "COMPLETE" as never)).toThrow(
      /illegal feature transition/
    );
  });
});
