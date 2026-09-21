import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import {
  toProjectRelative,
  associatedTests,
  transitiveDependents,
  buildDependencyMap,
  dependenciesOf,
  fileByPath,
  type DependencyMap,
} from "./graph.js";
import { ensureIndex, type RepoIndex } from "./index.js";
import { listTasks } from "../state/tasks.js";
import { listRequirements } from "../state/requirements.js";
import { getFeature, listFeatures } from "../state/features.js";
import { StateError, validateTaskId, validateFeatureId } from "../state/ids.js";
import { contextForTask } from "../context.js";
import { pathExists } from "../util/fs.js";

/**
 * Repository Intelligence, part 3: impact analysis, scope-drift detection,
 * and targeted retrieval. All of it deterministic graph work over the index.
 */

// ─── change-impact analysis ──────────────────────────────────────────────

export interface ChangeImpact {
  changedFiles: string[];
  /** Directly affected files (importers of changed files, minus changed). */
  affected: string[];
  /** Transitive closure of affected files. */
  affectedTransitive: string[];
  /** Tests that import changed or affected files — the blast radius to run. */
  impactedTests: string[];
  /** Warnings produced while analyzing (unreadable files, no tests found…). */
  notes: string[];
}

export function impactOfChangedFiles(
  root: string,
  changed: string[],
  index?: RepoIndex,
  map?: DependencyMap
): ChangeImpact {
  const idx = index ?? ensureIndex(root);
  const g = map ?? buildDependencyMap(idx);
  const known = new Set(idx.files.map((f) => f.path));
  const notes: string[] = [];
  const changedRel = changed.map((c) => toProjectRelative(root, c)).filter((c) => !isStewardOwned(c));

  const outside = changedRel.filter((c) => !known.has(c));
  for (const c of outside) notes.push(`changed path is not in the index (new or ignored): ${c}`);

  const inTree = changedRel.filter((c) => known.has(c));
  const affected = new Set<string>();
  for (const c of inTree) {
    for (const d of transitiveDependents(g, c)) affected.add(d);
  }
  const changedSet = new Set(inTree);
  const affectedOnly = [...affected].filter((f) => !changedSet.has(f));

  const impactedTests = new Set<string>();
  for (const f of [...inTree, ...affectedOnly]) {
    for (const t of associatedTests(idx, g, f)) impactedTests.add(t);
  }
  if (inTree.length > 0 && impactedTests.size === 0) {
    notes.push("no tests import the changed files or their dependents — coverage gap for this change");
  }

  return {
    changedFiles: changedRel,
    affected: affectedOnly,
    affectedTransitive: [...affected].sort(),
    impactedTests: [...impactedTests].sort(),
    notes,
  };
}

/** Changed files from git (working tree + index), or empty when not a repo. */
export function workingTreeChanges(root: string): string[] {
  try {
    const out = execSync("git status --porcelain -uall", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const entries = out
      .split("\n")
      .map((l) => l.replace(/^..\s+/, "").replace(/"/g, "").trim())
      .filter(Boolean);
    // git collapses renamed entries to "old -> new"; take the new side.
    return entries.map((e) => (e.includes(" -> ") ? e.split(" -> ")[1] : e));
  } catch {
    return [];
  }
}

// ─── scope-drift detection ───────────────────────────────────────────────

export interface ScopeDriftFinding {
  file: string;
  reason: "not-expected" | "unrelated-to-requirements" | "new-test";
  detail: string;
}

export interface ScopeDriftReport {
  taskId?: string;
  featureId: string;
  expectedFiles: string[];
  changedFiles: string[];
  /** Changed files that match the plan (expected files or their tests). */
  inScope: string[];
  /** Changed files outside the plan — candidate scope drift. */
  drift: ScopeDriftFinding[];
}

/**
 * Compare a change set against what the plan says should change. Drift is a
 * finding for /review, not an error: sometimes out-of-plan files must change,
 * but Steward records it so review and the guardian can ask why.
 */
export function detectScopeDrift(
  root: string,
  featureId: string,
  opts: { taskId?: string; changed?: string[] } = {}
): ScopeDriftReport {
  validateFeatureId(featureId);
  if (opts.taskId) validateTaskId(opts.taskId);
  const index = ensureIndex(root);
  const g = buildDependencyMap(index);
  const tasks = listTasks(root, featureId);
  const task = opts.taskId ? tasks.find((t) => t.id === opts.taskId) : undefined;
  if (opts.taskId && !task) throw new StateError(`task '${opts.taskId}' not found in feature '${featureId}'`);

  const requirements = listRequirements(root, featureId);
  const feature = getFeature(root, featureId);
  const expected = new Set<string>(
    tasks.flatMap((t) => t.expectedFiles).map((f) => toProjectRelative(root, f))
  );
  const reqText = requirements.map((r) => `${r.title} ${r.description} ${r.acceptance.join(" ")}`).join("\n").toLowerCase();
  const featureText = `${feature.title} ${feature.request}`.toLowerCase();

  const changed = (opts.changed ?? workingTreeChanges(root))
    .map((c) => toProjectRelative(root, c))
    .filter((c) => !isStewardOwned(c));
  const inScope: string[] = [];
  const drift: ScopeDriftFinding[] = [];

  for (const file of changed) {
    if (expected.has(file)) {
      inScope.push(file);
      continue;
    }
    const entry = fileByPath(index, file);
    const isTest = entry?.isTest ?? /(\.test|\.spec)\.[a-z]+$|(test|spec)s?\//i.test(file);
    // A test file whose target is in scope is itself in scope.
    if (isTest) {
      const importedByTest = dependenciesOf(g, file);
      if (importedByTest.some((i) => expected.has(i))) {
        inScope.push(file);
        continue;
      }
    }
    // Heuristic text match against requirement/feature wording (deterministic).
    const base = file.toLowerCase().replace(/\.[a-z]+$/, "");
    const words = base.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const matched = words.some((w) => reqText.includes(w) || featureText.includes(w));
    if (matched) {
      inScope.push(file);
      continue;
    }
    drift.push(
      isTest
        ? { file, reason: "new-test", detail: "test file outside the planned file set; verify it belongs to this feature" }
        : { file, reason: "not-expected", detail: "changed but not in any task's expected files" }
    );
  }

  return {
    taskId: task?.id,
    featureId,
    expectedFiles: [...expected].sort(),
    changedFiles: changed,
    inScope: inScope.sort(),
    drift,
  };
}

// ─── targeted retrieval ──────────────────────────────────────────────────

export interface RetrievedContext {
  query: string;
  /** Files ranked by deterministic relevance: direct word hits > dependent/import closure. */
  files: Array<{ path: string; score: number; reason: string }>;
  markdown: string;
}

/**
 * Deterministic targeted retrieval: rank project files by keyword overlap
 * with the query, then add the dependency closure of the top hits. No
 * embeddings, no RAG — same query, same ranking.
 */
export function retrieveContext(root: string, query: string, limit = 12): RetrievedContext {
  const index = ensureIndex(root);
  const g = buildDependencyMap(index);
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const scored = new Map<string, { score: number; reason: string }>();

  for (const f of index.files) {
    const base = f.path.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (base.includes(term)) score += path.basename(base).includes(term) ? 3 : 1;
    }
    if (score > 0) {
      scored.set(f.path, { score, reason: "name matches query" });
      continue;
    }
    // content scan (skipped for huge/binary entries with empty hash)
    if (f.hash && f.bytes > 0 && f.bytes <= 200_000) {
      const abs = `${root}/${f.path}`;
      if (pathExists(abs)) {
        try {
          const content = fs.readFileSync(abs, "utf8").toLowerCase();
          let hits = 0;
          for (const term of terms) if (content.includes(term)) hits++;
          if (hits > 0) scored.set(f.path, { score: hits, reason: "content matches query" });
        } catch {
          /* unreadable: skip */
        }
      }
    }
  }

  // Dependency closure of the top direct hits.
  const direct = [...scored.entries()]
    .filter(([, v]) => v.reason === "name matches query")
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 5);
  for (const [p] of direct) {
    for (const dep of dependenciesOf(g, p)) {
      if (!scored.has(dep)) scored.set(dep, { score: 1, reason: `imported by ${p}` });
    }
    for (const dependent of transitiveDependents(g, p).slice(0, 4)) {
      const existing = scored.get(dependent);
      if (existing) existing.score += 1;
      else scored.set(dependent, { score: 1, reason: `imports ${p}` });
    }
  }

  const files = [...scored.entries()]
    .sort((a, b) => b[1].score - a[1].score || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([p, v]) => ({ path: p, score: v.score, reason: v.reason }));

  const taskPack = /^TASK-\d{3}$/.test(query) ? tryTaskPack(root, query) : null;
  const lines = [
    `# Targeted context: ${query}`,
    "",
    ...(taskPack ? [taskPack, ""] : []),
    "## Ranked files (deterministic retrieval)",
    "",
    ...files.map((f) => `- ${f.path} (score ${f.score} — ${f.reason})`),
  ];
  return { query, files, markdown: lines.join("\n") };
}

function tryTaskPack(root: string, taskId: string): string | null {
  try {
    return contextForTask(root, taskId).markdown.split("\n").slice(0, 12).join("\n");
  } catch {
    return null;
  }
}

// ─── feature-level intel summary (for guardian + CLI) ────────────────────

export interface FeatureIntel {
  featureId: string;
  expectedFiles: string[];
  changedFiles: string[];
  missingExpected: string[];
  impactedTests: string[];
  drift: ScopeDriftReport["drift"];
}

export function featureIntel(root: string, featureId: string): FeatureIntel {
  const tasks = listTasks(root, featureId);
  const expected = [...new Set(tasks.flatMap((t) => t.expectedFiles))].sort();
  const changed = workingTreeChanges(root).filter((c) => !isStewardOwned(c));
  const impact = impactOfChangedFiles(root, changed);
  const drift = detectScopeDrift(root, featureId, { changed });
  const missingExpected = expected.filter((e) => !pathExists(`${root}/${e}`));
  return {
    featureId,
    expectedFiles: expected,
    changedFiles: changed,
    missingExpected,
    impactedTests: impact.impactedTests,
    drift: drift.drift,
  };
}

/** Exclude Steward's own state directories from analysis input. */
export function isStewardOwned(pathRel: string): boolean {
  return pathRel === ".steward" || pathRel.startsWith(".steward/") || pathRel === ".vibe" || pathRel.startsWith(".vibe/");
}
