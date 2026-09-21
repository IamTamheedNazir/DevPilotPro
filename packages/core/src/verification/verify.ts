import * as fs from "node:fs";
import { brainPaths } from "../brain/paths.js";
import { Ledger } from "../schema/ledger.js";
import { VERSION } from "../version.js";
import { nowIso } from "../state/store.js";
import { stewardPaths } from "../state/paths.js";
import { ensureDir } from "../util/fs.js";
import { resolveCommands } from "./commands.js";
import { evaluateGates, type VerificationEvaluation } from "./gates.js";
import { runCommand, type ResultCategory, type VerificationResult } from "./result.js";

const ACTOR = `steward-core@${VERSION}`;

export interface CommandExecution extends VerificationResult {
  featureId: string;
  evidenceFile: string;
}

/**
 * Execute the project's configured verification commands for a feature and
 * record the results as evidence. This is the engine's own observation —
 * not a builder's self-report.
 */
export async function runVerification(
  root: string,
  featureId: string,
  opts: { categories?: ResultCategory[]; timeoutMs?: number } = {}
): Promise<{ executions: CommandExecution[]; evaluation: VerificationEvaluation }> {
  const { commands } = resolveCommands(root);
  const selected = opts.categories
    ? commands.filter((c) => opts.categories!.includes(c.category))
    : commands;

  const evidenceDir = stewardPaths(root).evidenceDir(featureId);
  ensureDir(evidenceDir);
  const ledger = new Ledger(brainPaths(root).ledgerJsonl);
  const executions: CommandExecution[] = [];

  for (const cmd of selected) {
    const result = await runCommand(root, {
      command: cmd.command,
      category: cmd.category,
      timeoutMs: opts.timeoutMs,
    });
    const stamp = nowIso().replace(/[:.]/g, "-");
    const evidenceFile = `${stamp}-${cmd.category}.json`;
    const abs = `${evidenceDir}/${evidenceFile}`;
    fs.writeFileSync(
      abs,
      JSON.stringify({ featureId, ...result }, null, 2),
      "utf8"
    );
    ledger.append("verification.run", ACTOR, featureId, {
      featureId,
      category: cmd.category,
      command: result.command,
      exitCode: result.exitCode,
      success: result.success,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      evidenceFile: `.steward/features/${featureId}/evidence/${evidenceFile}`,
    });
    executions.push({ ...result, featureId, evidenceFile });
  }

  const evaluation = evaluateGates(root, featureId);
  ledger.append(evaluation.verdict.verdict === "COMPLETE_ELIGIBLE" ? "verification.passed" : "verification.evaluated", ACTOR, featureId, {
    featureId,
    remaining: evaluation.verdict.remainingGates.length,
  });
  return { executions, evaluation };
}

/** Record an externally executed review verdict (browser QA, security review). */
export function recordReviewVerdict(
  root: string,
  featureId: string,
  kind: "review.security" | "review.qa",
  verdict: "pass" | "fail",
  summary: string
): void {
  new Ledger(brainPaths(root).ledgerJsonl).append(kind, ACTOR, featureId, {
    featureId,
    verdict,
    summary,
    at: nowIso(),
  });
}

/**
 * Execute a task's own verification commands (recorded against the task) and
 * mark it DONE when every command passed. Task DONE is evidence-gated.
 */
export async function runTaskVerification(
  root: string,
  featureId: string,
  taskId: string
): Promise<{ executions: CommandExecution[]; done: boolean }> {
  const { getTask } = await import("../state/tasks.js");
  const { completeTask } = await import("../state/tasks.js");
  const task = getTask(root, featureId, taskId);
  const evidenceDir = stewardPaths(root).evidenceDir(featureId);
  ensureDir(evidenceDir);
  const ledger = new Ledger(brainPaths(root).ledgerJsonl);
  const executions: CommandExecution[] = [];

  for (const command of task.verification) {
    const result = await runCommand(root, { command, category: "custom" });
    const stamp = nowIso().replace(/[:.]/g, "-");
    const evidenceFile = `${stamp}-task-${taskId}.json`;
    fs.writeFileSync(
      `${evidenceDir}/${evidenceFile}`,
      JSON.stringify({ featureId, taskId, ...result }, null, 2),
      "utf8"
    );
    ledger.append("verification.run", ACTOR, taskId, {
      featureId,
      taskId,
      category: "custom",
      command: result.command,
      exitCode: result.exitCode,
      success: result.success,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      evidenceFile: `.steward/features/${featureId}/evidence/${evidenceFile}`,
    });
    executions.push({ ...result, featureId, evidenceFile });
  }

  let done = false;
  if (task.verification.length === 0 || executions.every((e) => e.success)) {
    completeTask(root, featureId, taskId);
    done = true;
  }
  return { executions, done };
}

/**
 * The completion boundary: run verification, evaluate gates, and only then
 * attempt VERIFYING → COMPLETE. Returns the gate report either way.
 */
export async function completeFeature(
  root: string,
  featureId: string
): Promise<{ evaluation: VerificationEvaluation; completed: boolean; remainingGates: string[] }> {
  const { transitionFeature } = await import("../state/features.js");
  const { evaluation } = await runVerification(root, featureId);
  const outcome = transitionFeature(root, featureId, "COMPLETE", {
    gates: () => evaluation.gates,
  });
  return {
    evaluation,
    completed: outcome.feature.state === "COMPLETE",
    remainingGates: evaluation.verdict.remainingGates,
  };
}

/** All workflow evidence events for a feature (for `steward evidence`). */
export function evidenceFor(root: string, featureId: string): LedgerRecordView[] {
  return new Ledger(brainPaths(root).ledgerJsonl)
    .records()
    .filter((r) => r.payload?.["featureId"] === featureId || r.ref === featureId)
    .map((r) => ({
      seq: r.seq,
      ts: r.ts,
      kind: r.kind,
      ref: r.ref,
      payload: r.payload,
    }));
}

export interface LedgerRecordView {
  seq: number;
  ts: string;
  kind: string;
  ref?: string;
  payload?: Record<string, unknown>;
}
