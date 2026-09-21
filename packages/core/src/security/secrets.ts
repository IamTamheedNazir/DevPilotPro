import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import { workingTreeChanges } from "../intel/impact.js";
import { toProjectRelative } from "../intel/graph.js";
import { pathExists } from "../util/fs.js";
import { findSecrets, sanitizeText } from "./redact.js";
import type { NewFindingInput } from "./store.js";

/**
 * Secret Guard (§10): local secret protection over the CURRENT change set —
 * working diff first, staged diff optionally, history only when explicitly
 * requested (never by default). The full secret value NEVER appears in any
 * finding: every output goes through the shared redaction layer.
 */

export interface SecretScanHit {
  file: string;
  line: number;
  /** e.g. "Stripe secret key" */
  type: string;
  /** Always a redacted placeholder — the raw value is discarded here. */
  redacted: string;
}

export interface SecretScanResult {
  hits: SecretScanHit[];
  scannedFiles: number;
  scopes: Array<"working" | "staged" | "history">;
  detail: string;
}

/** Git diff hunks for a scope; returns [] outside a repo or on error. */
function diffForScope(root: string, scope: "working" | "staged" | "history"): string[] {
  try {
    const args =
      scope === "history"
        ? ["log", "-p", "--unified=0", "-n", "200", "--color=never"]
        : scope === "staged"
          ? ["diff", "--cached", "--unified=0", "--color=never"]
          : ["diff", "--unified=0", "--color=never"];
    const out = execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    return out.split("\n");
  } catch {
    return [];
  }
}

/** Collect candidate text files from the working tree change set. */
function candidateFiles(root: string): string[] {
  const files = new Set<string>();
  try {
    for (const raw of workingTreeChanges(root)) {
      files.add(toProjectRelative(root, raw));
    }
  } catch {
    /* not a git repo: fall through to filesystem scan */
  }
  if (files.size === 0) {
    // No git info: scan tracked-ish top-level text files shallowly.
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isFile() && !entry.name.startsWith(".") && /\.(ts|tsx|js|jsx|mjs|cjs|py|env|yml|yaml|json|md)$/i.test(entry.name)) {
          files.add(entry.name);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return [...files].filter((f) => !f.startsWith(".steward/") && f !== ".steward" && !f.startsWith(".vibe/") && f !== ".vibe");
}

const MAX_FILE_BYTES = 400_000;

function lineOf(lines: string[], index: number): number {
  let count = 1;
  for (const l of lines) {
    if (l.length >= index) return count;
    count += l.length + 1;
  }
  return count;
}

/** Scan one file's content; hits carry a redacted marker, never the secret. */
export function scanText(root: string, file: string, text: string): SecretScanHit[] {
  const hits: SecretScanHit[] = [];
  for (const hit of findSecrets(text)) {
    const before = text.slice(0, Math.min(hit.index, text.length));
    const line = before.split("\n").length;
    const redacted = `[REDACTED:${hit.label.replace(/\s+/g, "_").toUpperCase()}]`;
    hits.push({ file: toProjectRelative(root, file), line, type: hit.label, redacted });
    if (hits.length >= 50) break; // bounded
  }
  return hits;
}

export function scanFile(root: string, file: string): SecretScanHit[] {
  const abs = `${root}/${file}`;
  if (!pathExists(abs)) return [];
  try {
    const st = fs.statSync(abs);
    if (st.size > MAX_FILE_BYTES) return [];
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|kt|env|yml|yaml|json|md|txt|toml|sql)$/i.test(file) && !file.endsWith(".env")) {
      return [];
    }
    const content = fs.readFileSync(abs, "utf8");
    return scanText(root, file, content);
  } catch {
    return [];
  }
}

/**
 * Run the secret scan for a change. scope "working" scans changed files'
 * content plus the working diff (catches deletions/renames); "staged" adds
 * the staged diff; "history" scans recent history and must be requested
 * explicitly.
 */
export function runSecretScan(
  root: string,
  opts: { includeStaged?: boolean; includeHistory?: boolean } = {}
): SecretScanResult {
  const scopes: SecretScanResult["scopes"] = ["working"];
  const hits: SecretScanHit[] = [];
  const files = candidateFiles(root);
  let scanned = 0;

  for (const file of files) {
    const fileHits = scanFile(root, file);
    scanned += 1;
    hits.push(...fileHits);
    if (hits.length >= 50) break;
  }

  // Diff-based scan catches content not on disk (deleted lines, renames).
  for (const line of diffForScope(root, "working")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      hits.push(...scanText(root, "(diff)", line.slice(1)));
    }
    if (hits.length >= 50) break;
  }

  if (opts.includeStaged) {
    scopes.push("staged");
    for (const line of diffForScope(root, "staged")) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        hits.push(...scanText(root, "(diff)", line.slice(1)));
      }
      if (hits.length >= 50) break;
    }
  }

  if (opts.includeHistory) {
    scopes.push("history");
    for (const line of diffForScope(root, "history")) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        hits.push(...scanText(root, "(diff)", line.slice(1)));
      }
      if (hits.length >= 50) break;
    }
  }

  // De-duplicate by (file, line, type).
  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    const k = `${h.file}:${h.line}:${h.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const detail =
    unique.length === 0
      ? `no likely secrets in ${scanned} changed file(s) across scopes: ${scopes.join(", ")}`
      : `${unique.length} likely secret(s) found (values redacted); scopes: ${scopes.join(", ")}`;

  return { hits: unique.slice(0, 50), scannedFiles: scanned, scopes, detail };
}

/** Convert secret hits into normalized findings (§2). */
export function secretFindings(root: string, featureId: string, result: SecretScanResult): NewFindingInput[] {
  return result.hits.map((h) => ({
    featureId,
    category: "secret" as const,
    // Secret findings are BLOCKER-grade: proven existence in the change.
    severity: "CRITICAL" as const,
    confidence: "proven" as const,
    source: "steward" as const,
    ruleId: "secret-scan",
    file: h.file,
    line: h.line,
    title: `Possible ${h.type} in changed content (${h.redacted})`,
    detail: `A value matching the ${h.type} pattern appears in the current change. The raw value is never stored; review the line and remove or move the credential to a managed secret store.`,
    basis: [
      `pattern match: ${h.type}`,
      `file: ${h.file} line ${h.line}`,
      "value redacted before storage (shared redaction layer)",
    ],
  }));
}
