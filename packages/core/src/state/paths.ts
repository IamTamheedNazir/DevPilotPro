import * as path from "node:path";

/**
 * Deterministic workflow state lives in `.steward/`. It is project-owned,
 * human-readable, diffable, and versionable. The Phase 1 `.vibe/` brain
 * (canonical skills, install manifest, hash-chained ledger) is unchanged;
 * the ledger at `.vibe/evidence/ledger.jsonl` remains the single
 * tamper-evident evidence index and is extended, not duplicated.
 */
export const STEWARD_DIR = ".steward";

export interface StewardPaths {
  root: string;
  dir: string;
  projectYaml: string;
  baselineYaml: string;
  debugDir: string;
  featuresDir: string;
  featureDir: (featureId: string) => string;
  featureYaml: (featureId: string) => string;
  specMd: (featureId: string) => string;
  requirementsYaml: (featureId: string) => string;
  planYaml: (featureId: string) => string;
  tasksDir: (featureId: string) => string;
  taskYaml: (featureId: string, taskId: string) => string;
  evidenceDir: (featureId: string) => string;
  reviewYaml: (featureId: string) => string;
  debugSessionsDir: (featureId: string | null) => string;
}

export const stewardPaths = (root: string): StewardPaths => {
  const dir = path.join(root, STEWARD_DIR);
  const featuresDir = path.join(dir, "features");
  const featureDir = (featureId: string) => path.join(featuresDir, featureId);
  return {
    root,
    dir,
    projectYaml: path.join(dir, "project.yaml"),
    baselineYaml: path.join(dir, "baseline.yaml"),
    debugDir: path.join(dir, "debug"),
    featuresDir,
    featureDir,
    featureYaml: (featureId) => path.join(featureDir(featureId), "feature.yaml"),
    specMd: (featureId) => path.join(featureDir(featureId), "spec.md"),
    requirementsYaml: (featureId) =>
      path.join(featureDir(featureId), "requirements.yaml"),
    planYaml: (featureId) => path.join(featureDir(featureId), "plan.yaml"),
    tasksDir: (featureId) => path.join(featureDir(featureId), "tasks"),
    taskYaml: (featureId, taskId) =>
      path.join(featureDir(featureId), "tasks", `${taskId}.yaml`),
    evidenceDir: (featureId) => path.join(featureDir(featureId), "evidence"),
    reviewYaml: (featureId) => path.join(featureDir(featureId), "review.yaml"),
    debugSessionsDir: (featureId) =>
      featureId
        ? path.join(featureDir(featureId), "debug")
        : path.join(dir, "debug"),
  };
};
