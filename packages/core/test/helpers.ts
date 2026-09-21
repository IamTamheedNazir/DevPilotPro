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

/**
 * Write a real implementation + test file pair so the Project Guardian's
 * repository analysis has an actual surface to verify. Keywords from the
 * requirement text should appear in the implementation file.
 */
export function writeImplAndTest(
  root: string,
  opts: { impl: string; test: string; implCode?: string }
): void {
  const implAbs = `${root}/${opts.impl}`;
  const testAbs = `${root}/${opts.test}`;
  const implPath = implAbs.slice(0, implAbs.lastIndexOf("/"));
  const testPath = testAbs.slice(0, testAbs.lastIndexOf("/"));
  fs.mkdirSync(implPath, { recursive: true });
  fs.mkdirSync(testPath, { recursive: true });
  fs.writeFileSync(implAbs, opts.implCode ?? DEFAULT_IMPL, "utf8");
  // Correct POSIX-relative import from the test file's directory to the impl.
  const rel = path
    .relative(path.dirname(testAbs), implAbs)
    .split(path.sep)
    .join("/")
    .replace(/^(?!\.)/, "./");
  fs.writeFileSync(testAbs, `import { x } from "${rel}";\nexport const xRef = x;\n`, "utf8");
}

const DEFAULT_IMPL = `export const feature = { ready: true };
// profile display logic lives here
export function displayName() { return "ready"; }
`;
