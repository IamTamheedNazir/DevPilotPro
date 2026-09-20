import * as fs from "node:fs";
import * as path from "node:path";
import { VERSION } from "../version.js";
import { sha256 } from "../util/hash.js";
import { classifyFile, type FileAction, type FileCandidate, type InstallTarget, type PlanOptions } from "./plan.js";
import { brainPaths } from "../brain/paths.js";
import { readIfExists, resolveWithin, writeFileSafe } from "../util/fs.js";
import { stripBlock } from "./managed.js";

export interface ManifestFile {
  file: string;
  hash: string;
  target: InstallTarget;
  mode: "file" | "block";
  blockId?: string;
}

export interface Manifest {
  schema: "steward.manifest.v1";
  version: string;
  installedAt: string;
  files: ManifestFile[];
}

const MANIFEST_SCHEMA = "steward.manifest.v1";

export class InstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallError";
  }
}

export function readManifest(root: string): Manifest | null {
  const raw = readIfExists(brainPaths(root).manifestJson);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Manifest;
    if (data.schema !== MANIFEST_SCHEMA || !Array.isArray(data.files)) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeManifest(root: string, manifest: Manifest): void {
  writeFileSafe(brainPaths(root).manifestJson, JSON.stringify(manifest, null, 2));
}

export function emptyManifest(): Manifest {
  return {
    schema: MANIFEST_SCHEMA,
    version: VERSION,
    installedAt: new Date().toISOString(),
    files: [],
  };
}

function manifestAdd(manifest: Manifest, action: FileAction, content: string): void {
  manifest.files = manifest.files.filter((f) => f.file !== action.file);
  manifest.files.push({
    file: action.file,
    hash: sha256(content),
    target: action.target,
    mode: action.mode,
    blockId: action.blockId,
  });
}

export interface ApplyResult {
  applied: FileAction[];
  skipped: FileAction[];
  blocked: FileAction[];
  backupDir: string | null;
}

function backupExisting(root: string, relFile: string): string | null {
  const existing = readIfExists(resolveWithin(root, relFile));
  if (existing === null) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(brainPaths(root).installDir, "backups", stamp, relFile);
  writeFileSafe(backupPath, existing);
  return backupPath;
}

export function planInstall(
  root: string,
  candidates: FileCandidate[],
  opts: PlanOptions
): FileAction[] {
  return candidates.map((c) =>
    classifyFile(c, readIfExists(resolveWithin(root, c.file)), opts)
  );
}

/** Execute a plan. Blocked (foreign) actions are never applied implicitly. */
export function applyPlan(root: string, plan: FileAction[], manifest: Manifest): ApplyResult {
  const applied: FileAction[] = [];
  const skipped: FileAction[] = [];
  const blocked: FileAction[] = [];
  let backupDir: string | null = null;

  for (const action of plan) {
    if (action.risk === "requires-confirmation") {
      blocked.push(action);
      continue;
    }
    if (action.kind === "skip") {
      skipped.push(action);
      continue;
    }
    const content = action.content ?? "";
    const backup = backupExisting(root, action.file);
    if (backup) backupDir = path.dirname(backup);
    writeFileSafe(resolveWithin(root, action.file), content);
    manifestAdd(manifest, action, content);
    applied.push(action);
  }

  writeManifest(root, manifest);
  return { applied, skipped, blocked, backupDir };
}

export interface UninstallOptions {
  dryRun?: boolean;
}

export interface UninstallResult {
  removed: string[];
  stripped: string[];
  kept: Array<{ file: string; reason: string }>;
}

/**
 * Remove everything Steward owns. Modified-by-user files are preserved and
 * reported, never deleted. Managed blocks are stripped; host docs survive.
 */
export function uninstallFiles(
  root: string,
  manifest: Manifest,
  opts: UninstallOptions = {}
): UninstallResult {
  const removed: string[] = [];
  const stripped: string[] = [];
  const kept: UninstallResult["kept"] = [];

  for (const entry of manifest.files) {
    const abs = resolveWithin(root, entry.file);
    const current = readIfExists(abs);
    if (current === null) {
      continue; // already gone
    }
    if (entry.mode === "block" && entry.blockId) {
      const next = stripBlock(current, entry.blockId);
      if (opts.dryRun) {
        if (next === null) removed.push(entry.file);
        else stripped.push(entry.file);
        continue;
      }
      if (next === null) {
        fs.rmSync(abs);
        removed.push(entry.file);
      } else {
        writeFileSafe(abs, next);
        stripped.push(entry.file);
      }
      continue;
    }
    if (sha256(current) !== entry.hash) {
      kept.push({ file: entry.file, reason: "modified since install; left untouched" });
      continue;
    }
    if (!opts.dryRun) fs.rmSync(abs);
    removed.push(entry.file);
  }

  return { removed, stripped, kept };
}

/**
 * Remove manifest entries that no longer belong to the current plan and are
 * still unmodified (stale profile/target changes). Modified files are kept.
 */
export function pruneStaleFiles(
  root: string,
  manifest: Manifest,
  plannedFiles: Set<string>
): { removed: string[]; kept: Array<{ file: string; reason: string }> } {
  const removed: string[] = [];
  const kept: Array<{ file: string; reason: string }> = [];
  const stale = manifest.files.filter((f) => !plannedFiles.has(f.file));
  const result = uninstallFiles(
    root,
    { ...manifest, files: stale },
    { dryRun: false }
  );
  removed.push(...result.removed);
  kept.push(...result.kept);
  const removedSet = new Set(removed);
  manifest.files = manifest.files.filter(
    (f) => plannedFiles.has(f.file) || !removedSet.has(f.file)
  );
  return { removed, kept };
}
