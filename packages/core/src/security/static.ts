import { execFileSync } from "node:child_process";
import { sanitizeAndRedact } from "./redact.js";
import type { NewFindingInput } from "./store.js";
import type { SecuritySeverity } from "./schema.js";

/**
 * Static analysis (§17): optional, local-first. Steward is the control
 * plane; Semgrep is a scanner it may invoke when installed. Nothing is
 * uploaded, no cloud service is required, and raw scanner output is never
 * stored — it is normalized and sanitized first (§63).
 */

export interface StaticScanCapability {
  tool: "semgrep";
  available: boolean;
  version?: string;
  note?: string;
}

export function detectStaticScanners(): StaticScanCapability[] {
  try {
    const out = execFileSync("semgrep", ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const m = /([0-9]+\.[0-9]+\.[0-9]+)/.exec(out);
    return [{ tool: "semgrep", available: true, version: m?.[1] }];
  } catch (err: unknown) {
    const e = err as { code?: string | number };
    return [{ tool: "semgrep", available: false, note: e.code === "ENOENT" ? "not installed" : `probe failed (${e.code ?? "error"})` }];
  }
}

export interface StaticScanResult {
  tool: string;
  available: boolean;
  findings: NewFindingInput[];
  rawCount: number;
  detail: string;
}

/** Run local Semgrep (optional config from policy); findings normalized. */
export function runStaticScan(root: string, featureId: string, config?: string): StaticScanResult {
  const caps = detectStaticScanners();
  const semgrep = caps.find((c) => c.tool === "semgrep");
  if (!semgrep?.available) {
    return {
      tool: "semgrep",
      available: false,
      findings: [],
      rawCount: 0,
      detail: "Semgrep: UNAVAILABLE (not installed; Steward does not install tools)",
    };
  }
  const args = ["scan", "--json", "--quiet", "--timeout", "60"];
  if (config) args.push("--config", config);
  try {
    const out = execFileSync("semgrep", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return semgrepFromJson(out, featureId);
  } catch (err: unknown) {
    // semgrep exits 1 when it FINDS something with --error; without it,
    // findings come back on stdout with exit 0. Non-zero here = infra error.
    const e = err as { code?: number | string; stdout?: string };
    if (e.stdout) {
      return semgrepFromJson(e.stdout, featureId);
    }
    return {
      tool: "semgrep",
      available: true,
      findings: [],
      rawCount: 0,
      detail: `semgrep present but run failed (${e.code ?? "error"}); treating as UNAVAILABLE for gating`,
    };
  }
}

type SemgrepSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

function semgrepSev(raw: string | undefined): SecuritySeverity {
  const s = (raw ?? "").trim().toUpperCase();
  if (s === "CRITICAL" || s === "HIGH") return s;
  if (s === "MEDIUM" || s === "MED") return "MEDIUM";
  if (s === "LOW") return "LOW";
  return "INFO";
}

export function semgrepFromJson(json: string, featureId: string): StaticScanResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { tool: "semgrep", available: true, findings: [], rawCount: 0, detail: "semgrep output was not valid JSON; ignored" };
  }
  const root = (parsed ?? {}) as {
    results?: Array<{
      check_id?: string;
      path?: string;
      start?: { line?: number };
      extra?: {
        severity?: string;
        message?: string;
        lines?: string;
        category?: string;
        metadata?: { cwe?: string[] | string };
      };
    }>;
  };

  const findings: NewFindingInput[] = [];
  const results = root.results ?? [];
  for (const r of results) {
    const cweRaw = r.extra?.metadata?.cwe;
    const cwe = Array.isArray(cweRaw) ? cweRaw[0] : cweRaw;
    const basis = [
      `semgrep rule ${r.check_id ?? "?"} matched ${r.path ?? "?"}:${r.start?.line ?? 0}`,
      cwe ? `rule metadata: ${cwe}` : "rule metadata: none",
      "deterministic pattern match by the project's configured semgrep rules",
    ];
    if (r.extra?.category) basis.push(`rule category: ${r.extra.category}`);    findings.push({
      featureId,
      category: "injection",
      severity: semgrepSev(r.extra?.severity),
      // Deterministic rule match: supported, not proven exploitability.
      confidence: "supported",
      source: "semgrep",
      ruleId: r.check_id ?? "semgrep-unknown",
      file: r.path ?? "",
      line: r.start?.line ?? 0,
      title: sanitizeAndRedact(r.extra?.message?.slice(0, 200) ?? `semgrep finding ${r.check_id ?? ""}`, 300),
      detail: sanitizeAndRedact([r.extra?.lines, r.extra?.message].filter(Boolean).join("\n"), 1000),
      basis,
    });
  }
  return {
    tool: "semgrep",
    available: true,
    findings,
    rawCount: findings.length,
    detail: findings.length === 0 ? "semgrep: no rule matches in the project" : `semgrep: ${findings.length} rule match(es)`,
  };
}

/** Map a semgrep finding to a better category from its rule id. */
export function semgrepCategoryOf(ruleId: string): NewFindingInput["category"] {
  const id = ruleId.toLowerCase();
  if (/xss|html\./.test(id)) return "xss";
  if (/sqli|sql-injection|sql\./.test(id)) return "injection";
  if (/ssrf/.test(id)) return "ssrf";
  if (/csrf/.test(id)) return "csrf";
  if (/redirect/.test(id)) return "redirect";
  if (/upload/.test(id)) return "file-upload";
  if (/traversal/.test(id)) return "path-traversal";
  if (/crypto|jwt|hash/.test(id)) return "crypto";
  if (/secret|credential/.test(id)) return "secret";
  if (/jwt/.test(id)) return "authentication";
  return "injection";
}
