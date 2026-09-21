import { execSync } from "node:child_process";
import { brainPaths } from "./brain/paths.js";
import { Ledger } from "./schema/ledger.js";
import { VERSION } from "./version.js";
import { nowIso, readYaml, writeYaml } from "./state/store.js";
import { stewardPaths } from "./state/paths.js";
import { BaselineConfig, type Baseline } from "./state/schema.js";
import { resolveCommands } from "./verification/commands.js";
import { failureSignature, runCommand, type VerificationResult } from "./verification/result.js";

const ACTOR = `steward-core@${VERSION}`;

export interface CaptureOptions {
  categories?: Array<"test" | "typecheck" | "lint" | "build">;
  timeoutMs?: number;
}

/**
 * Capture a baseline BEFORE new work starts: current revision, the dirty
 * working-tree paths Steward must never claim or discard, and the
 * verification commands that already fail. Pre-existing failures are
 * recorded so they are never later blamed on a new task.
 */
export async function captureBaseline(
  root: string,
  opts: CaptureOptions = {}
): Promise<Baseline> {
  let revision = "";
  try {
    revision = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    revision = "";
  }

  let dirtyPaths: string[] = [];
  try {
    const status = execSync("git status --porcelain", { cwd: root, encoding: "utf8" });
    dirtyPaths = status
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^..\s+/, "").replace(/"/g, ""));
  } catch {
    dirtyPaths = [];
  }

  const { commands } = resolveCommands(root);
  const selected = opts.categories
    ? commands.filter((c) => opts.categories!.includes(c.category as never))
    : commands;

  const failing: Baseline["failing"] = [];
  for (const cmd of selected) {
    const result = await runCommand(root, {
      command: cmd.command,
      category: cmd.category,
      timeoutMs: opts.timeoutMs,
    });
    if (!result.success) {
      failing.push({
        command: result.command,
        exitCode: result.exitCode,
        // store only the stable output signature, never full logs
        summary: failureSignature(result).split("::")[1] ?? "",
      });
    }
  }

  const baseline: Baseline = BaselineConfig.parse({
    capturedAt: nowIso(),
    revision,
    dirtyPaths,
    failing,
  });
  writeYaml(stewardPaths(root).baselineYaml, baseline);
  new Ledger(brainPaths(root).ledgerJsonl).append("baseline.captured", ACTOR, undefined, {
    revision,
    dirty: dirtyPaths.length,
    failing: failing.length,
  });
  return baseline;
}

export function readBaseline(root: string): Baseline | null {
  return readYaml(stewardPaths(root).baselineYaml, BaselineConfig);
}

export type FailureOrigin = "PRE_EXISTING" | "REGRESSION";

/**
 * Distinguish a pre-existing failure from a regression caused by current
 * work: a failure matches the baseline when the same command fails with the
 * same output signature.
 */
export function classifyFailure(baseline: Baseline | null, result: VerificationResult): FailureOrigin {
  if (!baseline) return "REGRESSION";
  const signature = failureSignature(result);
  for (const f of baseline.failing) {
    const baselineSignature = `${f.command}::${f.summary}`;
    if (baselineSignature === signature) {
      return "PRE_EXISTING";
    }
  }
  return "REGRESSION";
}
