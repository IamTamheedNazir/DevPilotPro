import * as path from "node:path";
import type { FileEntry, RepoIndex } from "./index.js";

/**
 * Repository Intelligence, part 2: the dependency map.
 *
 * Directed graph over project files derived from the index (imports). Pure
 * graph math: no heuristics, no AI — same index, same map.
 */

export interface DependencyMap {
  /** file → files it imports */
  dependencies: Record<string, string[]>;
  /** file → files that import it */
  dependents: Record<string, string[]>;
}

export function buildDependencyMap(index: RepoIndex): DependencyMap {
  const dependencies: Record<string, string[]> = {};
  const dependents: Record<string, string[]> = {};
  for (const f of index.files) {
    dependencies[f.path] = f.imports;
    dependents[f.path] = dependents[f.path] ?? [];
    for (const dep of f.imports) {
      (dependents[dep] = dependents[dep] ?? []).push(f.path);
    }
  }
  for (const key of Object.keys(dependents)) {
    dependents[key].sort();
  }
  return { dependencies, dependents };
}

/** Files directly imported by `file`. */
export function dependenciesOf(map: DependencyMap, file: string): string[] {
  return map.dependencies[file] ?? [];
}

/** Files that directly import `file`. */
export function dependentsOf(map: DependencyMap, file: string): string[] {
  return map.dependents[file] ?? [];
}

/** Transitive dependents (BFS), excluding the file itself. */
export function transitiveDependents(map: DependencyMap, file: string): string[] {
  const seen = new Set<string>();
  const queue = [file];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dependent of map.dependents[current] ?? []) {
      if (!seen.has(dependent)) {
        seen.add(dependent);
        queue.push(dependent);
      }
    }
  }
  seen.delete(file);
  return [...seen].sort();
}

export function fileByPath(index: RepoIndex, file: string): FileEntry | undefined {
  return index.files.find((f) => f.path === file);
}

/** Tests that directly or transitively exercise `file` — by import path only. */
export function associatedTests(index: RepoIndex, map: DependencyMap, file: string): string[] {
  const candidates = new Set<string>([file, ...transitiveDependents(map, file)]);
  return index.files
    .filter((f) => f.isTest && f.imports.some((i) => candidates.has(i)))
    .map((f) => f.path)
    .sort();
}

/** Normalize any path (absolute or relative, any separator) to project-relative POSIX. */
export function toProjectRelative(root: string, file: string): string {
  const abs = path.isAbsolute(file) ? file : path.resolve(root, file);
  const rel = path.relative(root, abs).split(path.sep).join("/");
  return rel.startsWith("..") ? file : rel;
}
