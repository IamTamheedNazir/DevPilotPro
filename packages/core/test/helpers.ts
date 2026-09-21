import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { initBrain } from "../src/brain/init.js";
import { saveProjectState } from "../src/verification/commands.js";
import type { ProjectState } from "../src/state/schema.js";

/** Commands that deterministically pass / fail without touching anything. */
export const PASS_CMD = 'node -e "process.exit(0)"';
export const FAIL_CMD = 'node -e "console.error(\'synthetic failure: 3 tests failed\'); process.exit(1)"';

export function makeProject(opts?: { verification?: ProjectState["verification"] }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "steward-fix-"));
  initBrain(root, { name: "fixture" });
  saveProjectState(root, {
    schema: "steward.state.v1",
    name: "fixture",
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    verification:
      opts?.verification ?? {
        test: PASS_CMD,
        typecheck: PASS_CMD,
        lint: PASS_CMD,
        build: PASS_CMD,
      },
    milestone: undefined,
  });
  return root;
}

export function run<T>(fn: () => T): T {
  return fn();
}
