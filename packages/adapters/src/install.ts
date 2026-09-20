import {
  VERSION,
  applyBlock,
  applyPlan,
  brainPaths,
  emptyManifest,
  Ledger,
  planInstall,
  pruneStaleFiles,
  readIfExists,
  readManifest,
  readProjectBrain,
  resolveWithin,
  sha256,
  skillsForProfile,
  uninstallFiles,
  writeManifest,
  type ApplyResult,
  type FileAction,
  type FileCandidate,
  type InstallProfile,
  type InstallTarget,
  type Manifest,
} from "@steward/core";
import { ADAPTERS, getAdapter, isAdapterId } from "./registry.js";
import type { HarnessAdapter } from "./types.js";

export interface InstallOptions {
  /** Adapter ids, or "all". Defaults to all. */
  targets?: InstallTarget[] | "all";
  /** Defaults to the profile persisted in the project brain. */
  profile?: InstallProfile;
  dryRun?: boolean;
  /** Defaults to true: managed files are regenerated on install/update/repair. */
  updateManaged?: boolean;
}

export interface InstallPlan {
  plan: FileAction[];
  skills: string[];
  targets: InstallTarget[];
  profile: InstallProfile;
  blocked: number;
}

export interface InstallOutcome extends InstallPlan {
  dryRun: boolean;
  result?: ApplyResult;
  pruned?: string[];
  backupDir?: string | null;
}

export function resolveAdapters(
  targets: InstallTarget[] | "all" | undefined
): HarnessAdapter[] {
  if (targets === undefined || targets === "all") return ADAPTERS;
  const unknown = targets.filter((t) => !isAdapterId(t));
  if (unknown.length > 0) {
    throw new Error(
      `unknown target(s): ${unknown.join(", ")}; supported: ${ADAPTERS.map((a) => a.id).join(", ")}`
    );
  }
  return targets.map((t) => getAdapter(t));
}

export function planProjectInstall(
  root: string,
  opts: InstallOptions = {}
): InstallPlan {
  const brain = readProjectBrain(root);
  const profile = opts.profile ?? brain.profile;
  const skills = skillsForProfile(profile);
  if (skills.length === 0) {
    throw new Error(`profile '${profile}' selects no skills`);
  }
  const adapters = resolveAdapters(opts.targets);

  const candidates: FileCandidate[] = [];
  for (const skill of skills) {
    candidates.push({
      file: `.vibe/skills/${skill.front.id}.md`,
      content: skill.raw,
      target: "core",
    });
  }
  for (const adapter of adapters) {
    for (const skill of skills) {
      for (const artifact of adapter.artifacts(skill)) {
        candidates.push({
          file: artifact.file,
          content: artifact.content,
          target: adapter.id,
        });
      }
    }
  }
  // Index blocks: one per host doc. If two adapters share a doc (AGENTS.md),
  // their block content is identical, so dedupe by file. The candidate's
  // content is the FULL merged doc (existing user content + managed block),
  // computed from current disk state.
  const blockByFile = new Map<string, FileCandidate>();
  for (const adapter of adapters) {
    const block = adapter.indexBlock(skills);
    if (!block || !block.blockId) continue;
    if (blockByFile.has(block.file)) continue;
    const current = readIfExists(resolveWithin(root, block.file));
    blockByFile.set(block.file, {
      file: block.file,
      content: applyBlock(current, block.blockId, block.content),
      target: adapter.id,
      mode: "block",
      blockId: block.blockId,
    });
  }
  candidates.push(...blockByFile.values());

  const plan = planInstall(root, candidates, {
    updateManaged: opts.updateManaged ?? true,
  });
  return {
    plan,
    skills: skills.map((s) => s.front.id),
    targets: adapters.map((a) => a.id),
    profile,
    blocked: plan.filter((a) => a.risk === "requires-confirmation").length,
  };
}

export function runInstall(root: string, opts: InstallOptions = {}): InstallOutcome {
  const p = planProjectInstall(root, opts);
  if (opts.dryRun) {
    return { ...p, dryRun: true };
  }
  const manifest: Manifest = readManifest(root) ?? emptyManifest();
  const result = applyPlan(root, p.plan, manifest);
  const plannedFiles = new Set(
    result.applied.concat(result.skipped).map((a) => a.file)
  );
  const pruned = pruneStaleFiles(root, manifest, plannedFiles);
  new Ledger(brainPaths(root).ledgerJsonl).append(
    "skills.install",
    `steward-cli@${VERSION}`,
    p.profile,
    {
      targets: p.targets,
      applied: result.applied.length,
      blocked: result.blocked.length,
      pruned: pruned.removed.length,
    }
  );
  return {
    ...p,
    dryRun: false,
    result,
    pruned: pruned.removed,
    backupDir: result.backupDir,
  };
}

export interface UninstallOptions {
  dryRun?: boolean;
}

export interface UninstallOutcome {
  removed: string[];
  stripped: string[];
  kept: Array<{ file: string; reason: string }>;
}

/** Remove Steward artifacts. The project brain (project truth) is preserved. */
export function runUninstall(
  root: string,
  opts: UninstallOptions = {}
): UninstallOutcome {
  const manifest = readManifest(root);
  if (!manifest) {
    throw new Error("nothing to uninstall: no install manifest found");
  }
  const result = uninstallFiles(root, manifest, { dryRun: opts.dryRun });
  if (!opts.dryRun) {
    manifest.files = [];
    writeManifest(root, manifest);
    new Ledger(brainPaths(root).ledgerJsonl).append(
      "skills.uninstall",
      `steward-cli@${VERSION}`,
      undefined,
      {
        removed: result.removed.length,
        stripped: result.stripped.length,
        kept: result.kept.length,
      }
    );
  }
  return result;
}

export interface ProjectStatus {
  brain: { name: string; profile: InstallProfile; autonomy: string } | null;
  manifest: { version: string; files: number } | null;
  drift: { missing: string[]; modified: string[] };
  perTarget: Record<string, number>;
}

export function statusOf(root: string): ProjectStatus {
  let brain: ProjectStatus["brain"] = null;
  try {
    const b = readProjectBrain(root);
    brain = { name: b.name, profile: b.profile, autonomy: b.autonomy };
  } catch {
    brain = null;
  }
  const manifest = readManifest(root);
  const drift = { missing: [] as string[], modified: [] as string[] };
  const perTarget: Record<string, number> = {};
  if (manifest) {
    for (const entry of manifest.files) {
      perTarget[entry.target] = (perTarget[entry.target] ?? 0) + 1;
      const current = readIfExists(resolveWithin(root, entry.file));
      if (current === null) drift.missing.push(entry.file);
      else if (sha256(current) !== entry.hash) drift.modified.push(entry.file);
    }
  }
  return {
    brain,
    manifest: manifest
      ? { version: manifest.version, files: manifest.files.length }
      : null,
    drift,
    perTarget,
  };
}
