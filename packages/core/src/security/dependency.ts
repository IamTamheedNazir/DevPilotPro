import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathExists } from "../util/fs.js";
import { sanitizeAndRedact } from "./redact.js";
import type { NewFindingInput } from "./store.js";
import type { SecuritySeverity } from "./schema.js";

/**
 * Dependency security (§13–§16): capability-aware, optional. Steward detects
 * what is installed, runs it locally, normalizes machine-readable output into
 * Steward findings, and reports UNAVAILABLE honestly when nothing is present.
 * Steward never installs tools to satisfy a gate (§14) and never equates
 * "advisory exists" with "application is exploitable" (§15).
 */

export interface ScannerCapability {
  name: "osv-scanner" | "npm audit" | "pnpm audit" | "yarn audit" | "cargo audit" | "pip-audit";
  available: boolean;
  version?: string;
  /** Why unavailable, when it matters for the report. */
  note?: string;
}

export function detectDependencyScanners(root: string): ScannerCapability[] {
  const caps: ScannerCapability[] = [];
  caps.push(capOf("osv-scanner", ["osv-scanner", "--version"], /osv-scanner v?([0-9][^\s]*)/i));
  if (pathExists(`${root}/package.json`)) {
    caps.push(capOf("npm audit", ["npm", "--version"], /([0-9]+\.[0-9]+\.[0-9]+)/));
  }
  if (pathExists(`${root}/pnpm-lock.yaml`)) {
    caps.push(capOf("pnpm audit", ["pnpm", "--version"], /([0-9]+\.[0-9]+\.[0-9]+)/));
  }
  if (pathExists(`${root}/yarn.lock`)) {
    caps.push(capOf("yarn audit", ["yarn", "--version"], /([0-9]+\.[0-9]+\.[0-9]+)/));
  }
  if (pathExists(`${root}/Cargo.toml`)) {
    caps.push(capOf("cargo audit", ["cargo-audit", "--version"], /([0-9]+\.[0-9]+\.[0-9]+)/));
  }
  if (pathExists(`${root}/requirements.txt`) || pathExists(`${root}/pyproject.toml`)) {
    caps.push(capOf("pip-audit", ["pip-audit", "--version"], /([0-9]+\.[0-9]+\.[0-9]+)/));
  }
  return caps;
}

function capOf(name: ScannerCapability["name"], cmd: string[], versionRe: RegExp): ScannerCapability {
  try {
    const out = execFileSync(cmd[0], cmd.slice(1), {
      encoding: "utf8",
      timeout: 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const m = versionRe.exec(out);
    return { name, available: true, version: m?.[1] };
  } catch (err: unknown) {
    const e = err as { code?: string | number };
    return { name, available: false, note: e.code === "ENOENT" ? "not installed" : `probe failed (${e.code ?? "error"})` };
  }
}

export interface DependencyScanResult {
  scanner: string;
  available: boolean;
  /** Normalized findings (empty when unavailable or clean). */
  findings: NewFindingInput[];
  rawCount: number;
  detail: string;
}

/** Map advisory severities from any provider onto Steward's scale. */
export function mapSeverity(raw: string): SecuritySeverity {
  const s = raw.trim().toUpperCase();
  if (["CRITICAL", "CRIT"].includes(s)) return "CRITICAL";
  if (["HIGH"].includes(s)) return "HIGH";
  if (["MODERATE", "MEDIUM", "MED"].includes(s)) return "MEDIUM";
  if (["LOW", "MINOR"].includes(s)) return "LOW";
  return "INFO";
}

const OSV_SEV_ORDER: Record<string, SecuritySeverity> = {
  CVSS_V3: "HIGH",
  CVSS_V4: "HIGH",
  UBUNTU: "HIGH",
  GITLAB: "HIGH",
  PYSEC: "MEDIUM",
  ALPINE: "MEDIUM",
  DEBIAN: "MEDIUM",
};

type OsvVuln = {
  id?: string;
  summary?: string;
  details?: string;
  severity?: Array<{ type?: string; score?: string }>;
  database_specific?: { severity?: string };
  groups?: Array<{ experimentalAnalysis?: { called?: boolean } }>;
};

function osvSeverityOf(vuln: OsvVuln): SecuritySeverity {
  const db = vuln.database_specific?.severity;
  if (db) return mapSeverity(db);
  for (const s of vuln.severity ?? []) {
    const t = (s.type ?? "").toUpperCase();
    if (OSV_SEV_ORDER[t]) return OSV_SEV_ORDER[t];
  }
  return "MEDIUM";
}

/** Run the best available scanner; NEVER installs anything (§14). */
export function runDependencyScan(root: string, featureId: string): DependencyScanResult {
  const caps = detectDependencyScanners(root);
  const osv = caps.find((c) => c.name === "osv-scanner");
  if (osv?.available) {
    return runOsv(root, featureId);
  }
  if (pathExists(`${root}/package.json`) && pathExists(`${root}/package-lock.json`)) {
    return runNpmAudit(root, featureId);
  }
  const first = caps.find((c) => c.available);
  if (first) {
    return {
      scanner: first.name,
      available: true,
      findings: [],
      rawCount: 0,
      detail: `${first.name} is available but Steward has no normalizer for this ecosystem yet; treat as UNAVAILABLE for gating`,
    };
  }
  return {
    scanner: "none",
    available: false,
    findings: [],
    rawCount: 0,
    detail: "Dependency vulnerability scanner: UNAVAILABLE (nothing installed; Steward does not install tools)",
  };
}

function runOsv(root: string, featureId: string): DependencyScanResult {
  try {
    const out = execFileSync("osv-scanner", ["--json"], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return osvFromJson(out, "osv-scanner", featureId, 0);
  } catch (err: unknown) {
    // osv-scanner exits 1 when it FINDS vulnerabilities (JSON still on stdout).
    const e = err as { code?: number | string; stdout?: string };
    if (typeof e.code === "number" && e.code === 1 && e.stdout) {
      return osvFromJson(e.stdout, "osv-scanner", featureId, 1);
    }
    return {
      scanner: "osv-scanner",
      available: true,
      findings: [],
      rawCount: 0,
      detail: `osv-scanner present but run failed (${e.code ?? "error"}); treating as UNAVAILABLE for gating`,
    };
  }
}

export function osvFromJson(json: string, scanner: string, featureId: string, exitCode: number): DependencyScanResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { scanner, available: true, findings: [], rawCount: 0, detail: "scanner output was not valid JSON; ignored" };
  }
  const root = (parsed ?? {}) as {
    results?: Array<{
      source?: { path?: string };
      packages?: Array<{
        package?: { name?: string; version?: string };
        vulnerabilities?: OsvVuln[];
      }>;
    }>;
  };

  const findings: NewFindingInput[] = [];
  let rawCount = 0;
  for (const result of root.results ?? []) {
    for (const pkg of result.packages ?? []) {
      for (const vuln of pkg.vulnerabilities ?? []) {
        rawCount += 1;
        const called = vuln.groups?.some((g) => g.experimentalAnalysis?.called === true);
        findings.push({
          featureId,
          category: "dependency",
          severity: osvSeverityOf(vuln),
          // PROVEN: the dependency is affected. Reachability recorded, not assumed (§15).
          confidence: "proven",
          source: "osv",
          ruleId: vuln.id ?? "OSV-UNKNOWN",
          file: result.source?.path ? path.basename(result.source.path) : "",
          title: `Vulnerable dependency: ${pkg.package?.name ?? "unknown"}@${pkg.package?.version ?? "?"} (${vuln.id ?? "?"})`,
          detail: sanitizeAndRedact(vuln.summary ?? vuln.details ?? "", 800),
          dependencyReachable: called === true ? "REACHABLE" : called === false ? "NOT_REACHABLE" : "UNKNOWN",
          basis: [
            `OSV advisory ${vuln.id ?? "?"} affects ${pkg.package?.name ?? "?"}@${pkg.package?.version ?? "?"}`,
            result.source?.path ? `manifest: ${path.basename(result.source.path)}` : "manifest: unknown",
            called === true
              ? "OSV call-analysis says the vulnerable API IS called"
              : "vulnerable API reachability: UNKNOWN (not equated with exploitability)",
          ],
        });
      }
    }
  }
  const detail =
    rawCount === 0
      ? `${scanner}: no known vulnerabilities in scanned manifests (exit ${exitCode})`
      : `${scanner}: ${rawCount} vulnerable package version(s) across manifests`;
  return { scanner, available: true, findings, rawCount, detail };
}

function runNpmAudit(root: string, featureId: string): DependencyScanResult {
  let out: string;
  try {
    out = execSync("npm audit --json", {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (err: unknown) {
    const e = err as { code?: number | string; stdout?: string };
    // npm audit exits non-zero when vulnerabilities exist; JSON is on stdout.
    if (e.stdout) {
      return npmAuditFromJson(e.stdout, featureId);
    }
    return {
      scanner: "npm audit",
      available: false,
      findings: [],
      rawCount: 0,
      detail: "npm audit could not run (no lockfile or registry unreachable); UNAVAILABLE",
    };
  }
  return npmAuditFromJson(out, featureId);
}

export function npmAuditFromJson(json: string, featureId: string): DependencyScanResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { scanner: "npm audit", available: true, findings: [], rawCount: 0, detail: "npm audit output was not valid JSON; ignored" };
  }
  const root = (parsed ?? {}) as {
    vulnerabilities?: Record<
      string,
      {
        severity?: string;
        name?: string;
        range?: string;
        via?: Array<string | { title?: string; url?: string }>;
      }
    >;
  };
  const findings: NewFindingInput[] = [];
  const vulns = Object.entries(root.vulnerabilities ?? {});
  for (const [name, v] of vulns) {
    const via = (v.via ?? []).filter((x): x is { title?: string } => typeof x === "object");
    findings.push({
      featureId,
      category: "dependency",
      severity: mapSeverity(v.severity ?? ""),
      confidence: "proven",
      source: "project-tool",
      ruleId: (v.via ?? []).find((x): x is string => typeof x === "string") ?? "npm-audit",
      file: "package-lock.json",
      title: `Vulnerable dependency: ${name}${v.range ? ` (${v.range})` : ""}`,
      detail: sanitizeAndRedact(via.map((x) => x.title ?? "").join("; "), 800),
      dependencyReachable: "UNKNOWN",
      basis: [
        `npm audit reports ${name} affected (${v.range ?? "range unknown"})`,
        "reachability not analyzed by npm audit; recorded as UNKNOWN",
      ],
    });
  }
  return {
    scanner: "npm audit",
    available: true,
    findings,
    rawCount: findings.length,
    detail: findings.length === 0 ? "npm audit: no known vulnerabilities" : `npm audit: ${findings.length} vulnerable package(s)`,
  };
}

/** §18: recognize security tooling the project already wires up. */
export function detectProjectSecurityTools(root: string): Array<{ tool: string; via: string }> {
  const tools: Array<{ tool: string; via: string }> = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8")) as {
      scripts?: Record<string, string>;
    };
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
      if (/secur|audit|semgrep|bandit|gosec|brakeman/i.test(name) || /\b(bandit|gosec|brakeman|semgrep)\b/.test(cmd)) {
        tools.push({ tool: `npm run ${name}`, via: cmd.slice(0, 120) });
      }
    }
  } catch {
    /* no package.json */
  }
  return tools;
}
