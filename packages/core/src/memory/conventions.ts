import * as fs from "node:fs";
import { readMemories, addMemory, transitionMemory } from "./store.js";
import { findContradictions, markContradicted, discriminativeTerms } from "./authority.js";
import type { MemoryRecordT } from "./schema.js";
import { ensureIndex, type RepoIndex } from "../intel/index.js";
import { buildDependencyMap, type DependencyMap } from "../intel/graph.js";
import { isStewardOwned } from "../intel/impact.js";
import { pathExists } from "../util/fs.js";

/**
 * Learned-convention engine (Phase 5 §5–§7).
 *
 * Observes repeated repository patterns and proposes them as LEARNED_CANDIDATE
 * convention memory — never project truth. Detection is deterministic:
 * structural rules over the content-hashed index. When evidence conflicts
 * (e.g. some packages use Vitest, others Jest) the engine emits a
 * CONFLICTED project-scope candidate or package-scoped conventions —
 * never a fake universal rule.
 */

export interface ConventionObservation {
  /** What pattern was seen, stated as a candidate convention. */
  statement: string;
  kind: MemoryRecordT["kind"];
  scopes: MemoryRecordT["scopes"];
  /** Deterministic facts backing the observation. */
  basis: string[];
  /** Files supporting the pattern (freshness surface). */
  supportFiles: string[];
}

const VITEST_RE = /\bfrom\s+["'](vitest|@playwright\/test)["']|\brequire\(\s*["'](vitest|@playwright\/test)["']\s*\)/;
const JEST_RE = /\bfrom\s+["']@jest\/globals["']|\bdescribe\s*\(\s*["'][^"']+["']\s*,\s*\(\s*\)\s*=>/;

function readSafe(root: string, rel: string): string | null {
  try {
    return fs.readFileSync(`${root}/${rel}`, "utf8");
  } catch {
    return null;
  }
}

function dirOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "." : rel.slice(0, i);
}

/** Top-level package roots (packages/*, apps/*) when this is a monorepo. */
export function packageRoots(index: RepoIndex): string[] {
  const roots = new Set<string>();
  for (const f of index.files) {
    const m = f.path.match(/^(packages|apps|libs)\b/) ? f.path.split("/").slice(0, 2).join("/") : null;
    if (m) roots.add(m);
  }
  return [...roots].sort();
}

/** Scope prefix for a file given detected package roots. */
function scopeFor(file: string, roots: string[]): { scope: MemoryRecordT["scopes"][number]["scope"]; target: string } {
  for (const r of roots) {
    if (file === r || file.startsWith(`${r}/`)) {
      return { scope: "package", target: r };
    }
  }
  return { scope: "project", target: "" };
}

// ─── test-framework observation ──────────────────────────────────────────

export function observeTestFramework(root: string, index: RepoIndex): ConventionObservation[] {
  const roots = packageRoots(index);
  const byScope = new Map<string, { vitest: number; jest: number; files: string[] }>();
  for (const f of index.files) {
    if (!f.isTest || f.bytes === 0 || f.bytes > 200_000) continue;
    const content = readSafe(root, f.path);
    if (!content) continue;
    const scope = scopeFor(f.path, roots);
    const key = scope.scope === "project" ? "." : scope.target;
    const entry = byScope.get(key) ?? { vitest: 0, jest: 0, files: [] };
    if (VITEST_RE.test(content)) entry.vitest += 1;
    if (JEST_RE.test(content)) entry.jest += 1;
    entry.files.push(f.path);
    byScope.set(key, entry);
  }
  const out: ConventionObservation[] = [];
  const frameworksSeen = new Set<string>();
  for (const [key, counts] of [...byScope.entries()].sort()) {
    const dominant = counts.vitest >= counts.jest && counts.vitest > 0 ? "vitest" : counts.jest > 0 ? "jest" : null;
    if (!dominant) continue;
    frameworksSeen.add(dominant);
    const scope: MemoryRecordT["scopes"] =
      key === "." ? [{ scope: "project", target: "" }] : [{ scope: "package", target: key }];
    out.push({
      statement: `tests use ${dominant} in ${key === "." ? "this project" : key}`,
      kind: "convention",
      scopes: scope,
      basis: [`${Math.max(counts.vitest, counts.jest)} test file(s) import ${dominant} APIs (index-derived)`],
      supportFiles: counts.files.slice(0, 20),
    });
  }
  // Cross-scope contradiction: same project, conflicting frameworks.
  if (frameworksSeen.size > 1 && byScope.size > 1) {
    const allFiles = [...byScope.values()].flatMap((v) => v.files).slice(0, 40);
    out.push({
      statement: `test framework differs between packages (vitest in some, jest in others) — package-scoped conventions apply`,
      kind: "convention",
      scopes: [{ scope: "project", target: "" }],
      basis: ["test files across packages import different framework APIs"],
      supportFiles: allFiles,
    });
  }
  return out;
}

// ─── colocated-tests observation ─────────────────────────────────────────

export function observeTestColocation(index: RepoIndex): ConventionObservation[] {
  const source = index.files.filter((f) => !f.isTest && /\.(ts|tsx|js|jsx)$/.test(f.path));
  const colocated = source.filter((f) => /\.(test|spec)\.[jt]sx?$/.test(f.path.replace(/\.(ts|tsx|js|jsx)$/, ".x")) || index.files.some((t) => t.isTest && t.path === f.path.replace(/\.([jt]sx?)$/, ".test.$1")));
  const separate = source.filter((f) => !colocated.includes(f) && index.files.some((t) => t.isTest && (t.path.endsWith(`/${f.path}`) || t.path.includes("/tests/") || t.path.includes("/test/"))));
  const observations: ConventionObservation[] = [];
  if (colocated.length >= 3 && colocated.length > separate.length) {
    observations.push({
      statement: "tests live next to the implementation files they cover",
      kind: "convention",
      scopes: [{ scope: "project", target: "" }],
      basis: [`${colocated.length} implementation files have a sibling test file`],
      supportFiles: colocated.slice(0, 20).map((f) => f.path),
    });
  } else if (separate.length >= 3 && separate.length > colocated.length) {
    observations.push({
      statement: "tests live in dedicated tests directories, separate from implementation",
      kind: "convention",
      scopes: [{ scope: "project", target: "" }],
      basis: [`${separate.length} implementation files have tests under tests/ or test/ directories`],
      supportFiles: separate.slice(0, 20).map((f) => f.path),
    });
  }
  return observations;
}

// ─── repository/data-access pattern observation ──────────────────────────

const REPO_FILE_RE = /(^|\/)(repositories?|repos?|data-access|dal)\//i;
const REPO_NAME_RE = /(^|\/|\.)([A-Z]\w*)?Repository(\.|\b)/;

export function observeDataAccessPattern(root: string, index: RepoIndex, map: DependencyMap): ConventionObservation[] {
  const repoFiles = index.files.filter((f) => !f.isTest && (REPO_FILE_RE.test(f.path) || REPO_NAME_RE.test(f.path)));
  if (repoFiles.length < 2) return [];
  const consumers: string[] = [];
  for (const f of index.files) {
    if (f.isTest || !map.dependencies[f.path]) continue;
    if (map.dependencies[f.path].some((d) => repoFiles.some((r) => r.path === d))) consumers.push(f.path);
  }
  if (consumers.length < 2) return [];
  // Consumers should not touch storage directly when repositories exist.
  const storageDirect = consumers.filter((c) => {
    const content = readSafe(root, c);
    return content !== null && /\b(?:prisma|mongoose|knex)\b/i.test(content);
  });
  const basis = [
    `${repoFiles.length} repository module(s) under repository-style paths`,
    `${consumers.length} consumer file(s) import them`,
  ];
  if (storageDirect.length === 0) basis.push("no repository consumer imports storage clients directly");
  return [{
    statement: "data access goes through repository modules rather than direct storage clients",
    kind: "convention",
    scopes: [{ scope: "project", target: "" }],
    basis,
    supportFiles: [...repoFiles.map((f) => f.path), ...consumers].slice(0, 40),
  }];
}

// ─── validation-library observation ──────────────────────────────────────

const ZOD_RE = /\bfrom\s+["']zod["']|\brequire\(\s*["']zod["']\s*\)/;
const YUP_RE = /\bfrom\s+["']yup["']/;
const IO_TS_RE = /\bfrom\s+["']io-ts["']/;

export function observeValidationLibrary(root: string, index: RepoIndex): ConventionObservation[] {
  const counts = { zod: 0, yup: 0, ioTs: 0 };
  const files: string[] = [];
  for (const f of index.files) {
    if (f.isTest || !/\.(ts|tsx|js|jsx|mts|cts)$/.test(f.path) || f.bytes === 0 || f.bytes > 200_000) continue;
    const content = readSafe(root, f.path);
    if (!content) continue;
    let hit = false;
    if (ZOD_RE.test(content)) { counts.zod += 1; hit = true; }
    if (YUP_RE.test(content)) { counts.yup += 1; hit = true; }
    if (IO_TS_RE.test(content)) { counts.ioTs += 1; hit = true; }
    if (hit) files.push(f.path);
  }
  const total = counts.zod + counts.yup + counts.ioTs;
  if (total < 3) return [];
  const libs = [
    { name: "zod", n: counts.zod },
    { name: "yup", n: counts.yup },
    { name: "io-ts", n: counts.ioTs },
  ].filter((l) => l.n > 0).sort((a, b) => b.n - a.n);
  const dominantShare = libs[0].n / total;
  const out: ConventionObservation[] = [];
  if (dominantShare >= 0.9) {
    out.push({
      statement: `schema validation uses ${libs[0].name}`,
      kind: "convention",
      scopes: [{ scope: "project", target: "" }],
      basis: [`${libs[0].n}/${total} validation imports use ${libs[0].name}`],
      supportFiles: files.slice(0, 30),
    });
  } else if (libs.length > 1 && libs[1].n / total >= 0.2) {
    out.push({
      statement: `validation libraries are mixed (${libs.map((l) => `${l.name}: ${l.n}`).join(", ")}) — no project-wide convention, package-scoped rules may apply`,
      kind: "convention",
      scopes: [{ scope: "project", target: "" }],
      basis: ["validation imports split across multiple libraries"],
      supportFiles: files.slice(0, 30),
    });
  }
  return out;
}

// ─── engine entry ────────────────────────────────────────────────────────

export interface ConventionProposal {
  memory: MemoryRecordT;
  isNew: boolean;
  contradicted: MemoryRecordT[];
}

export interface ConventionScanResult {
  observations: number;
  proposed: ConventionProposal[];
  skippedDuplicates: number;
}

/**
 * Scan the repository for repeated patterns and record them as CANDIDATE
 * convention memory. Existing candidates are strengthened (re-confirmed)
 * rather than duplicated; contradiction marking is explicit, never silent.
 */
export function learnConventions(root: string, actor = "convention-engine"): ConventionScanResult {
  const index = ensureIndex(root);
  const map = buildDependencyMap(index);
  const observations = [
    ...observeTestFramework(root, index),
    ...observeTestColocation(index),
    ...observeDataAccessPattern(root, index, map),
    ...observeValidationLibrary(root, index),
  ];

  const existing = readMemories(root).memories.filter(
    (m) => m.kind === "convention" && m.status !== "REJECTED"
  );
  const proposed: ConventionProposal[] = [];
  let skippedDuplicates = 0;

  for (const obs of observations) {
    const terms = discriminativeTerms(obs.statement);
    const dup = existing.find(
      (m) =>
        m.scopes.some((s) => obs.scopes.some((o) => o.scope === s.scope && o.target === s.target)) &&
        overlapRatio(discriminativeTerms(m.statement), terms) > 0.6
    );
    if (dup) {
      skippedDuplicates += 1;
      continue;
    }
    const memory = addMemory(root, {
      kind: "convention",
      title: obs.statement.slice(0, 200),
      statement: obs.statement,
      authority: "LEARNED_CANDIDATE",
      confidence: "supported",
      status: "CANDIDATE",
      scopes: obs.scopes,
      provenance: {
        kind: "convention-engine",
        actor,
        basis: obs.basis,
      },
      supportFiles: dedupePaths(root, obs.supportFiles),
    });
    const contradictions = findContradictions(root, {
      kind: memory.kind,
      scopes: memory.scopes,
      statement: memory.statement,
      excludeId: memory.id,
    });
    if (contradictions.length > 0) {
      markContradicted(root, contradictions.map((c) => c.id), actor);
      // The new candidate itself becomes CONFLICTED too — a contradicted rule
      // must not read as project truth.
      transitionMemory(root, memory.id, "conflict", { by: actor });
    }
    proposed.push({ memory, isNew: true, contradicted: contradictions });
  }

  return { observations: observations.length, proposed, skippedDuplicates };
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((t) => setB.has(t)).length;
  return shared / Math.min(a.length, b.length);
}

/** Keep only real, non-Steward-owned paths for the freshness surface. */
function dedupePaths(root: string, paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    if (!p || isStewardOwned(p)) continue;
    if (!pathExists(`${root}/${p}`)) continue;
    out.add(p);
  }
  return [...out].slice(0, 100).sort();
}
