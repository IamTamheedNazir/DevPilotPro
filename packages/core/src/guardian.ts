import * as fs from "node:fs";
import { pathExists } from "./util/fs.js";
import { getFeature, listFeatures } from "./state/features.js";
import { listRequirements } from "./state/requirements.js";
import { listTasks } from "./state/tasks.js";
import { readSpec } from "./state/specs.js";
import { workingTreeChanges, impactOfChangedFiles, type ChangeImpact } from "./intel/impact.js";
import { ensureIndex } from "./intel/index.js";
import { buildDependencyMap, toProjectRelative, fileByPath, type DependencyMap } from "./intel/graph.js";
import { StateError, validateFeatureId } from "./state/ids.js";

/**
 * Project Guardian: detects partially implemented requirements even when
 * tests pass. Tests prove behavior that was written; the guardian asks the
 * different question — was the requirement's surface actually written?
 *
 * Deterministic signals only (no AI verdicts):
 *  1. task coverage — every accepted requirement has a DONE task
 *  2. expected files — every requirement's tasks declare and produce files
 *  3. implementation surface — code exists that plausibly implements the
 *     requirement (keyword match over the requirement's own words)
 *  4. stub detection — TODO/FIXME/not-implemented markers inside changed
 *     implementation files
 *  5. test association — at least one test imports the implementation
 */

export type GuardianVerdict = "IMPLEMENTED" | "PARTIAL" | "MISSING";

export interface GuardianRequirement {
  requirementId: string;
  title: string;
  verdict: GuardianVerdict;
  confidence: "high" | "medium" | "low";
  signals: string[];
  gaps: string[];
}

export interface GuardianFinding {
  requirementId: string;
  severity: "BLOCKER" | "WARNING";
  issue: string;
  file: string;
}

export interface GuardianReport {
  featureId: string;
  verdict: "SATISFIED" | "PARTIAL";
  requirements: GuardianRequirement[];
  findings: GuardianFinding[];
  /** Changed implementation files containing stub markers. */
  stubMarkers: Array<{ file: string; line: number; marker: string }>;
  impact: ChangeImpact | null;
}

const STUB_PATTERNS: Array<{ re: RegExp; marker: string }> = [
  { re: /\bTODO\b/, marker: "TODO" },
  { re: /\bFIXME\b/, marker: "FIXME" },
  { re: /\bnot[ -]implemented\b/i, marker: "not implemented" },
  { re: /\bunimplemented\b/i, marker: "unimplemented" },
  { re: /\bthrow new Error\(\s*["'`](?:not |un)implemented/i, marker: "throw not-implemented" },
  { re: /\bpass\s*#\s*implement/i, marker: "python stub pass" },
  { re: /\bcoming soon\b/i, marker: "coming soon" },
];

const CODE_EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs)$/;

function keywords(text: string): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "when", "then",
    "user", "users", "must", "should", "shall", "will", "can", "cannot", "cant",
    "able", "any", "all", "are", "was", "were", "has", "have", "had", "not",
    "display", "displayed", "saved", "save", "appear", "appears",
  ]);
  return [...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !stop.has(w))
  )];
}

interface RequirementSurface {
  requirementId: string;
  title: string;
  keywords: string[];
  files: string[];
}

/** Map each requirement to the files its tasks declare plus keyword set. */
function requirementSurfaces(root: string, featureId: string): RequirementSurface[] {
  const tasks = listTasks(root, featureId);
  const requirements = listRequirements(root, featureId);
  return requirements
    .filter((r) => r.status === "accepted")
    .map((r) => {
      const serving = tasks.filter((t) => t.requirements.includes(r.id));
      return {
        requirementId: r.id,
        title: r.title,
        keywords: keywords(`${r.title} ${r.description} ${r.acceptance.join(" ")}`),
        files: [...new Set(serving.flatMap((t) => t.expectedFiles))],
      };
    });
}

/**
 * Search the index for implementation files whose name or content carries
 * the requirement's keywords (deterministic retrieval, guardian-scoped).
 */
function findImplementingFiles(
  root: string,
  surface: RequirementSurface,
  index: ReturnType<typeof ensureIndex>,
  map: DependencyMap
): string[] {
  const hits = new Set<string>();
  const changed = new Set(workingTreeChanges(root));
  for (const f of index.files) {
    if (f.isTest || !CODE_EXTS.test(f.path)) continue;
    const base = f.path.toLowerCase();
    let nameHit = surface.keywords.some((k) => base.includes(k));
    if (!nameHit && f.hash && f.bytes > 0 && f.bytes <= 200_000) {
      const abs = `${root}/${f.path}`;
      if (pathExists(abs)) {
        try {
          const content = fs.readFileSync(abs, "utf8").toLowerCase();
          let count = 0;
          for (const k of surface.keywords) if (content.includes(k)) count++;
          nameHit = count >= Math.min(2, surface.keywords.length);
        } catch {
          /* unreadable */
        }
      }
    }
    if (nameHit) {
      hits.add(f.path);
      // include direct dependents: a route/controller file often imports the impl
      for (const d of map.dependents[f.path] ?? []) {
        if (!fileByPath(index, d)?.isTest) hits.add(d);
      }
    }
  }
  // files explicitly declared by the requirement's tasks always count
  for (const file of surface.files) hits.add(toProjectRelative(root, file));
  void changed;
  return [...hits].sort();
}

function scanForStubs(root: string, files: string[]): GuardianReport["stubMarkers"] {
  const markers: GuardianReport["stubMarkers"] = [];
  for (const rel of files) {
    if (!CODE_EXTS.test(rel)) continue;
    const abs = `${root}/${rel}`;
    if (!pathExists(abs)) continue;
    try {
      const lines = fs.readFileSync(abs, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const { re, marker } of STUB_PATTERNS) {
          if (re.test(line)) {
            markers.push({ file: rel, line: i + 1, marker });
            break;
          }
        }
      });
    } catch {
      /* unreadable */
    }
  }
  return markers;
}

/** Analyze one feature for partially implemented requirements. */
export function guardFeature(root: string, featureId: string): GuardianReport {
  validateFeatureId(featureId);
  getFeature(root, featureId); // existence check
  const spec = readSpec(root, featureId);
  const tasks = listTasks(root, featureId);
  const index = ensureIndex(root);
  const map = buildDependencyMap(index);
  const surfaces = requirementSurfaces(root, featureId);
  const changed = workingTreeChanges(root);
  const changedSet = new Set(changed.map((c) => toProjectRelative(root, c)));

  const requirements: GuardianRequirement[] = surfaces.map((surface) => {
    const signals: string[] = [];
    const gaps: string[] = [];

    const serving = tasks.filter((t) => t.requirements.includes(surface.requirementId));
    if (serving.length === 0) {
      gaps.push("no task traces to this requirement");
    } else if (serving.every((t) => t.status === "DONE")) {
      signals.push("covered by DONE task(s)");
    } else {
      gaps.push(`serving task(s) not DONE: ${serving.filter((t) => t.status !== "DONE").map((t) => t.id).join(", ")}`);
    }

    if (surface.files.length === 0) {
      gaps.push("serving tasks declare no expected files");
    }
    const expectedMissing = surface.files.filter((f) => !pathExists(`${root}/${f}`));
    if (surface.files.length > 0 && expectedMissing.length === surface.files.length) {
      gaps.push(`none of the expected files exist: ${surface.files.join(", ")}`);
    } else if (expectedMissing.length > 0) {
      gaps.push(`expected files missing: ${expectedMissing.join(", ")}`);
    }

    const implFiles = findImplementingFiles(root, surface, index, map);
    const presentImpl = implFiles.filter((f) => pathExists(`${root}/${f}`) && !expectedMissing.includes(f));
    if (presentImpl.length === 0) {
      gaps.push("no implementation file matches this requirement's keywords");
    } else {
      signals.push(`implementation surface: ${presentImpl.slice(0, 3).join(", ")}`);
    }

    const tests = implFiles.flatMap((f) => {
      const dependents = map.dependents[f] ?? [];
      return dependents.filter((d) => fileByPath(index, d)?.isTest);
    });
    if (presentImpl.length > 0 && tests.length === 0) {
      gaps.push("no test imports the implementation surface");
    } else if (tests.length > 0) {
      signals.push(`tests: ${[...new Set(tests)].slice(0, 3).join(", ")}`);
    }

    const verdict: GuardianVerdict =
      gaps.length === 0 ? "IMPLEMENTED" : signals.length === 0 ? "MISSING" : "PARTIAL";
    const confidence = signals.length >= 3 && gaps.length === 0 ? "high" : signals.length >= 2 ? "medium" : "low";

    return { requirementId: surface.requirementId, title: surface.title, verdict, confidence, signals, gaps };
  });

  // spec-level gap: expected behavior items with no matching requirement text
  const findings: GuardianFinding[] = [];
  if (spec) {
    const reqText = surfaces.map((s) => s.keywords.join(" ")).join(" ");
    for (const behavior of spec.expectedBehavior) {
      const words = keywords(behavior);
      const covered = words.some((w) => reqText.includes(w));
      if (!covered && words.length > 0) {
        findings.push({
          requirementId: "-",
          severity: "WARNING",
          issue: `expected behavior may lack a requirement: "${behavior.slice(0, 80)}"`,
          file: "",
        });
      }
    }
  }

  const stubFiles = new Set<string>([...changed, ...surfaces.flatMap((s) => s.files)]);
  const stubMarkers = scanForStubs(root, [...stubSet(stubFiles)]);
  const hardStubs = new Set(stubMarkers.filter((s) => s.marker !== "TODO" && s.marker !== "FIXME").map((s) => s.file));

  // Stub markers demote the requirement verdict: a surface that says "not
  // implemented" is not implemented, no matter what the tests claim.
  for (const req of requirements) {
    const surfaceHit = req.signals
      .find((s) => s.startsWith("implementation surface:"))
      ?.split(": ")[1]
      ?.split(", ")
      .some((file) => hardStubs.has(file.trim()));
    const declaredHit = surfaces
      .find((s) => s.requirementId === req.requirementId)!
      .files.some((file) => hardStubs.has(toProjectRelative(root, file)));
    if (surfaceHit || declaredHit) {
      if (req.verdict === "IMPLEMENTED") req.verdict = "PARTIAL";
      req.gaps.push(`stub marker in implementation (${[...hardStubs].join(", ")})`);
    }
  }

  const partial = requirements.filter((r) => r.verdict !== "IMPLEMENTED");
  const impact = changed.length > 0 ? analyzeImpact(root, changed) : null;
  void partial;

  return {
    featureId,
    verdict: partial.length === 0 ? "SATISFIED" : "PARTIAL",
    requirements,
    findings,
    stubMarkers,
    impact,
  };
}

function stubSet(files: Set<string>): string[] {
  return [...files].filter((f) => !f.includes("..")).sort();
}
void stubSet;

function analyzeImpact(root: string, changed: string[]): ChangeImpact | null {
  try {
    return impactOfChangedFiles(root, changed);
  } catch {
    return null;
  }
}

/** Guardian report across all features (for `steward guardian`). */
export function guardAll(root: string): GuardianReport[] {
  return listFeatures(root)
    .filter((f) => !["COMPLETE", "REJECTED", "CANCELLED"].includes(f.state))
    .map((f) => {
      try {
        return guardFeature(root, f.id);
      } catch (err) {
        if (err instanceof StateError) throw err;
        return {
          featureId: f.id,
          verdict: "PARTIAL" as const,
          requirements: [],
          findings: [],
          stubMarkers: [],
          impact: null,
        };
      }
    });
}
