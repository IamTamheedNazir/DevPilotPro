import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { brainExists, initBrain, readProjectBrain } from "../src/brain/init.js";
import { brainPaths } from "../src/brain/paths.js";
import { Ledger } from "../src/schema/ledger.js";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "steward-brain-"));
}

describe("initBrain", () => {
  it("creates the brain scaffold and a valid genesis ledger", () => {
    const root = tmpRoot();
    const { created } = initBrain(root, { name: "demo-app" });
    expect(brainExists(root)).toBe(true);
    expect(created).toContain(".vibe/project.yaml");

    const p = brainPaths(root);
    for (const dir of [p.decisionsDir, p.tasksDir, p.researchDir, p.memoryDir, p.evidenceDir, p.qaDir, p.securityDir, p.handoffsDir, p.sessionsDir]) {
      expect(fs.existsSync(dir)).toBe(true);
    }
    expect(fs.readFileSync(p.productMd, "utf8")).toContain("# Product");
    expect(fs.readFileSync(p.learnedYaml, "utf8")).toContain("learned: []");

    const brain = readProjectBrain(root);
    expect(brain.name).toBe("demo-app");
    expect(brain.schema).toBe("steward.project.v1");
    expect(brain.profile).toBe("builder");
    expect(brain.autonomy).toBe("balanced");

    const verify = new Ledger(p.ledgerJsonl).verify();
    expect(verify.ok).toBe(true);
    expect(verify.count).toBe(1);
  });

  it("refuses to overwrite an existing brain", () => {
    const root = tmpRoot();
    initBrain(root, { name: "first" });
    expect(() => initBrain(root, { name: "second" })).toThrow(/refusing to overwrite/);
    expect(readProjectBrain(root).name).toBe("first");
  });

  it("rejects invalid config via the zod schema", () => {
    const root = tmpRoot();
    expect(() =>
      initBrain(root, { name: "", profile: "builder" as never })
    ).toThrow();
  });

  it("readProjectBrain throws with guidance when absent", () => {
    const root = tmpRoot();
    expect(() => readProjectBrain(root)).toThrow(/steward init/);
  });
});
