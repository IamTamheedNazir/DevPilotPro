import * as fs from "node:fs";
import { pathExists } from "../util/fs.js";
import { getFeature } from "../state/features.js";
import { listRequirements } from "../state/requirements.js";
import { listTasks } from "../state/tasks.js";
import { addFindings, readReview, resolveFinding } from "../state/review.js";
import type { ReviewFinding } from "../state/schema.js";
import { validateFeatureId, StateError } from "../state/ids.js";
import { ensureIndex } from "./index.js";
import { buildDependencyMap, toProjectRelative, fileByPath } from "./graph.js";
import { detectScopeDrift, isStewardOwned } from "./impact.js";
import { workingTreeChanges } from "./impact.js";
import { sha256 } from "../util/hash.js";

/**
 * Repository-aware /review: inspects the ACTUAL change set (working tree
 * diff) against the plan, requirements, and dependency graph. Deterministic
 * checks only — BLOCKER/WARNING/NOTE findings, no scores.
 *
 * The reviewing agent still reads the diff for judgment; this engine
 * guarantees the mechanical checks are never skipped and records every
 * finding in state (review.yaml) so gates can see them.
 */

export interface DiffReviewOptions {
  changed?: string[];
  /** Record findings into review.yaml (default true). */
  record?: boolean;
}

export interface DiffReviewResult {
  featureId: string;
  changedFiles: string[];
  findings: Array<ReviewFinding & { engine: string }>;
  summary: {
    blockers: number;
    warnings: number;
    notes: number;
    scopeDrift: number;
    stubs: number;
  };
}

const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b/;
const UNSAFE_PATTERNS: Array<{ re: RegExp; issue: string }> = [
  { re: /eval\s*\(/, issue: "use of eval() — unsafe shortcut" },
  { re: /child_process\.execSync\([^)]*\bsudo\b/, issue: "sudo in code — unsafe" },
  { re: /console\.log\([^)]*(?:password|secret|token)/i, issue: "possible secret logging" },
  { re: /catch\s*\([^)]*\)\s*\{\s*\}/, issue: "empty catch block swallows errors" },
  { re: /any\s+as\s+any|as\s+unknown\s+as\s+any/, issue: "type system escape hatch (any as any)" },
];

function severityOf(engineFindings: Array<{ severity: "BLOCKER" | "WARNING" | "NOTE" }>): DiffReviewResult["summary"] {
  const count = (s: string) => engineFindings.filter((f) => f.severity === s).length;
  return {
    blockers: count("BLOCKER"),
    warnings: count("WARNING"),
    notes: count("NOTE"),
    scopeDrift: 0,
    stubs: 0,
  };
}

export function reviewDiff(root: string, featureId: string, opts: DiffReviewOptions = {}): DiffReviewResult {
  validateFeatureId(featureId);
  getFeature(root, featureId); // existence
  const index = ensureIndex(root);
  const map = buildDependencyMap(index);
  const tasks = listTasks(root, featureId);
  const requirements = listRequirements(root, featureId);
  const changed = (opts.changed ?? workingTreeChanges(root))
    .map((c) => toProjectRelative(root, c))
    .filter((c) => !isStewardOwned(c));

  const engineFindings: Array<{ engine: string; severity: "BLOCKER" | "WARNING" | "NOTE"; issue: string; file: string; requirement?: string }> = [];

  const drift = detectScopeDrift(root, featureId, { changed });
  for (const d of drift.drift) {
    engineFindings.push({
      engine: "scope-drift",
      severity: "WARNING",
      issue: `scope drift — ${d.detail}`,
      file: d.file,
    });
  }

  // requirement alignment: changed files should intersect requirement surfaces
  const expected = new Set(tasks.flatMap((t) => t.expectedFiles).map((f) => toProjectRelative(root, f)));
  const servedReqs = new Map<string, string[]>();
  for (const r of requirements) {
    if (r.status !== "accepted") continue;
    for (const t of tasks.filter((t) => t.requirements.includes(r.id))) {
      for (const f of t.expectedFiles) servedReqs.set(toProjectRelative(root, f), [...(servedReqs.get(f) ?? []), r.id]);
    }
  }
  for (const file of drift.inScope) {
    const reqs = servedReqs.get(file);
    if (!reqs || reqs.length === 0) {
      engineFindings.push({
        engine: "alignment",
        severity: "NOTE",
        issue: "changed file in plan but no accepted requirement links to its task",
        file,
      });
    }
  }

  // missing tests: implementation files changed with no test impact
  const testImpact = new Set<string>();
  for (const file of changed) {
    if (!expected.has(file) && !fileByPath(index, file)) continue;
    const dependents = map.dependents[file] ?? [];
    if (dependents.some((d) => fileByPath(index, d)?.isTest)) testImpact.add(file);
  }
  const implChanged = changed.filter((f) => !f.match(/(\.test|\.spec)\.|(^|\/)(tests?|__tests__)\//));
  const untested = implChanged.filter((f) => !testImpact.has(f));
  for (const f of untested) {
    engineFindings.push({
      engine: "test-coverage",
      severity: "WARNING",
      issue: "implementation file changed but no test imports it (directly or via expected set)",
      file: f,
    });
  }

  // content scans on changed files: TODOs, unsafe shortcuts, duplication
  const seenContent = new Map<string, string>(); // content hash → first file
  for (const file of changed) {
    const abs = `${root}/${file}`;
    if (!pathExists(abs)) continue;
    let content: string;
    try {
      content = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      if (TODO_RE.test(line)) {
        engineFindings.push({
          engine: "todo-scan",
          severity: "NOTE",
          issue: `TODO/FIXME left in changed code: ${line.trim().slice(0, 80)}`,
          file,
        });
      }
      for (const { re, issue } of UNSAFE_PATTERNS) {
        if (re.test(line)) {
          engineFindings.push({
            engine: "unsafe-pattern",
            severity: "BLOCKER",
            issue,
            file,
          });
        }
      }
    });
    // duplicated implementation: identical non-trivial content in two files
    if (content.length > 200 && /\.(ts|tsx|js|jsx|py)$/.test(file)) {
      const hash = sha256(content);
      const first = seenContent.get(hash);
      if (first && first !== file) {
        engineFindings.push({
          engine: "duplication",
          severity: "WARNING",
          issue: `file content is identical to ${first} — possible copy-paste implementation`,
          file,
        });
      } else {
        seenContent.set(hash, file);
      }
    }
  }

  // obvious regressions: expected files that no longer exist after the change
  const missing = [...expected].filter((f) => !pathExists(`${root}/${f}`) && changed.length > 0);
  for (const f of missing) {
    engineFindings.push({
      engine: "regression-watch",
      severity: "BLOCKER",
      issue: "planned file does not exist although work is claimed done",
      file: f,
    });
  }

  const summary = severityOf(engineFindings);
  summary.scopeDrift = drift.drift.length;
  const existing = readReview(root, featureId);
  summary.stubs = existing?.findings.filter((f) => f.issue.toLowerCase().includes("stub")).length ?? 0;

  let findings: Array<ReviewFinding & { engine: string }>;
  if (opts.record === false) {
    findings = engineFindings.map((f, i) => ({
      ...f,
      id: `ENGINE-${String(i + 1).padStart(3, "0")}`,
    }));
  } else {
    const review = addFindings(root, featureId, {
      scope: `engine diff review (${changed.length} changed files)`,
      findings: engineFindings.map(({ engine, severity, issue, file, requirement }) => ({
        severity,
        issue: `[${engine}] ${issue}`,
        file,
        requirement,
      })),
    });
    findings = review.findings.slice(-engineFindings.length).map((f) => ({ ...f, engine: "recorded" }));
  }

  return {
    featureId,
    changedFiles: changed,
    findings,
    summary,
  };
}

export { resolveFinding };
