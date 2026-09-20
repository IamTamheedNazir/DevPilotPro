import * as fs from "node:fs";
import * as path from "node:path";

/** Resolve `target` inside `root`, refusing path traversal outside the root. */
export function resolveWithin(root: string, target: string): string {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, target);
  const rel = path.relative(absRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`refusing path outside project root: ${target}`);
  }
  return abs;
}

export function pathExists(target: string): boolean {
  try {
    fs.statSync(target);
    return true;
  } catch {
    return false;
  }
}

export function readIfExists(target: string): string | null {
  try {
    return fs.readFileSync(target, "utf8");
  } catch {
    return null;
  }
}

export function ensureDir(target: string): void {
  fs.mkdirSync(target, { recursive: true });
}

/** Write a file, creating parent directories. */
export function writeFileSafe(target: string, content: string): void {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content, "utf8");
}
