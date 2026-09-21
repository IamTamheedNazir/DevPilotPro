import { exec } from "node:child_process";
import { sha256 } from "../util/hash.js";
import { redactSecrets } from "../security/redact.js";

/**
 * Observed execution is evidence; a model's message is not. This runner
 * executes a command in the project, records timing and exit code, and
 * stores REDACTED, TRUNCATED output summaries — enough to substantiate the
 * claim, never enormous logs or secrets.
 */

export type ResultCategory = "test" | "typecheck" | "lint" | "build" | "custom";

export interface VerificationResult {
  command: string;
  category: ResultCategory;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  exitCode: number;
  success: boolean;
  stdoutSummary: string;
  stderrSummary: string;
  outputHash: string;
}

const SUMMARY_MAX_CHARS = 2000;

/**
 * Phase 4: command output is redacted through the ONE shared redaction
 * layer (security/redact.ts), the same one used for scanner output, QA
 * evidence, findings, and context packs. Never a second, weaker filter.
 */
export function redact(output: string): string {
  return redactSecrets(output);
}

export function truncate(output: string, max = SUMMARY_MAX_CHARS): string {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, Math.floor(max * 0.6));
  const tail = clean.slice(-Math.floor(max * 0.3));
  return `${head}\n… [${clean.length - head.length - tail.length} chars truncated] …\n${tail}`;
}

export function summarize(output: string): string {
  return truncate(redact(output));
}

export function runCommand(
  root: string,
  opts: { command: string; category: ResultCategory; timeoutMs?: number }
): Promise<VerificationResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  return new Promise((resolve) => {
    exec(
      opts.command,
      {
        cwd: root,
        timeout: opts.timeoutMs ?? 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const exitCode = error?.code ?? (error ? 1 : 0);
        const completedAt = new Date().toISOString();
        const stdoutSummary = summarize(String(stdout ?? ""));
        const stderrSummary = summarize(String(stderr ?? ""));
        resolve({
          command: opts.command,
          category: opts.category,
          startedAt,
          completedAt,
          durationMs: Date.now() - startMs,
          exitCode: typeof exitCode === "number" ? exitCode : 1,
          success: exitCode === 0,
          stdoutSummary,
          stderrSummary,
          outputHash: sha256(`${stdoutSummary}\n${stderrSummary}`),
        });
      }
    );
  });
}

/** Stable signature used to match a failure against the baseline. */
export function failureSignature(result: VerificationResult): string {
  return `${result.command}::${sha256(`${result.stderrSummary}\n${result.stdoutSummary}`)}`;
}
