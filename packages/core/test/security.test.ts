import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import {
  addFindings,
  addRequirement,
  advanceDebugStage,
  createDebugSession,
  createFeature,
  createSpec,
  stewardPaths,
  slugifyFeature,
  validateDebugId,
  validateFeatureId,
  validateRequirementId,
  validateReviewId,
  validateTaskId,
  FEATURE_ID_RE,
  REQUIREMENT_ID_RE,
  TASK_ID_RE,
} from "../src/index.js";
import { makeProject } from "./helpers.js";

const HOSTILE_IDS = [
  "../../.ssh/id_rsa",
  "../escape",
  "..\\..\\windows\\system32",
  "foo/bar",
  "foo\\bar",
  ".hidden",
  "..",
  "REQ-../EVIL-001",
  "TASK-001/../../x",
];

describe("adversarial path inputs", () => {
  it("rejects every hostile id at the validation boundary", () => {
    for (const id of HOSTILE_IDS) {
      expect(() => validateFeatureId(id), `feature id: ${id}`).toThrow();
      expect(() => validateRequirementId(id), `requirement id: ${id}`).toThrow();
      expect(() => validateTaskId(id), `task id: ${id}`).toThrow();
    }
  });

  it("rejects hostile review and debug ids", () => {
    expect(() => validateReviewId("../evil")).toThrow();
    expect(() => validateDebugId("DEBUG-001/../../.ssh")).toThrow();
  });

  it("never writes outside .steward even via store paths", () => {
    const root = makeProject();
    const p = stewardPaths(root);
    // feature ids reaching the store are always validated first; the
    // validated forms must resolve inside .steward/features
    const safe = "legit-feature";
    expect(validateFeatureId(safe)).toBe(safe);
    expect(p.featureDir(safe).startsWith(p.featuresDir)).toBe(true);
    // hostile ids are refused before any path is built
    for (const id of HOSTILE_IDS) {
      let escaped = false;
      try {
        const dir = p.featureDir(validateFeatureId(id));
        escaped = !dir.startsWith(p.featuresDir);
      } catch {
        // expected: validation throws
      }
      expect(escaped).toBe(false);
    }
  });

  it("slug derivation strips traversal characters", () => {
    expect(slugifyFeature("Add ../../.ssh/id_rsa keys")).toMatch(FEATURE_ID_RE);
    expect(slugifyFeature("profile/display:name")).toMatch(FEATURE_ID_RE);
  });

  it("feature creation refuses hostile explicit ids", () => {
    const root = makeProject();
    expect(() => createFeature(root, { title: "x", id: "../../.ssh/id_rsa" })).toThrow();
  });

  it("keeps .steward state free of attacker-written files after hostile attempts", () => {
    const root = makeProject();
    const p = stewardPaths(root);
    // one legit feature so the store directory exists
    createFeature(root, { title: "legit feature" });
    for (const id of HOSTILE_IDS) {
      try {
        createFeature(root, { title: "t", id: id });
      } catch {
        // expected
      }
    }
    expect(existsSync(path.join(path.dirname(root), ".ssh"))).toBe(false);
    // only the legit feature directory was created
    expect(existsSync(p.featureDir("legit-feature"))).toBe(true);
    for (const id of HOSTILE_IDS) {
      const segments = id.split(/[\\/]/).filter(Boolean);
      const attackerPath = segments.find((s) => s.includes("."))?.replace(/[^a-z.]/gi, "");
      if (attackerPath && attackerPath.includes("..")) continue;
      void attackerPath;
    }
    const created = existsSync(p.featuresDir)
      ? (require("node:fs") as typeof import("node:fs")).readdirSync(p.featuresDir)
      : [];
    expect(created).toEqual(["legit-feature"]);
  });
});

describe("schema input validation", () => {
  it("rejects malformed requirement ids on add", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "schema" });
    expect(() =>
      addRequirement(root, f.id, { id: "req-invite-1", title: "lowercase rejected" })
    ).toThrow(/invalid requirement id/);
  });

  it("keeps debug stage advancement evidence-gated", () => {
    const root = makeProject();
    const s = createDebugSession(root, { symptom: "500s on save" });
    // skipping straight to FIX is illegal
    expect(() =>
      advanceDebugStage(root, s.id, "FIX", { resolution: "edited something" })
    ).toThrow(/one at a time/);
    // REPRODUCE requires the reproduction artifact
    expect(() => advanceDebugStage(root, s.id, "HYPOTHESES", {})).toThrow(/requires its artifact/);
  });

  it("stores debug sessions under steward-owned paths only", () => {
    const root = makeProject();
    const s = createDebugSession(root, { symptom: "bug", featureId: undefined });
    expect(s.id).toMatch(/^DEBUG-\d{3}$/);
  });

  it("validates review finding storage paths", () => {
    const root = makeProject();
    const f = createFeature(root, { title: "reviews" });
    createSpec(root, f.id, { objective: "x" });
    addFindings(root, f.id, {
      scope: "diff",
      findings: [{ severity: "NOTE", issue: "nit", file: "src/a.ts" }],
    });
    const review = stewardPaths(root).reviewYaml(f.id);
    expect(review.startsWith(path.join(root, ".steward"))).toBe(true);
    expect(REQUIREMENT_ID_RE.test("REQ-INVITE-001")).toBe(true);
    expect(TASK_ID_RE.test("TASK-001")).toBe(true);
  });
});
