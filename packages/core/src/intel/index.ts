import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import * as z from "zod";
import { sha256 } from "../util/hash.js";
import { readYaml, writeYaml } from "../state/store.js";
import { resolveWithin, pathExists, ensureDir } from "../util/fs.js";
import { stewardPaths } from "../state/paths.js";
import { nowIso } from "../state/store.js";

/**
 * Repository Intelligence, part 1: the file index.
 *
 * A deterministic, content-hashed index of the project's own files. Steward
 * never invents analyses here: the index records what exists, what each file
 * contains (hash + imports), and how it changed. This is the substrate for
 * impact analysis, scope-drift detection, targeted retrieval, and evidence
 * freshness.
 */

// ─── source classification ───────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
  ".py", ".go", ".rs", ".java", ".kt", ".rb", ".php", ".cs",
  ".sql", ".sh", ".yaml", ".yml", ".toml", ".json",
]);

const TEST_FILE_RE = /(^|[./])(test|tests|__tests__|spec)([./])|(\.test|\.spec)\.[a-z]+$|(_test|_spec)\.(go|rs|py)$/i;

const DEFAULT_IGNORES = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage",
  ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache", "vendor",
  ".steward", ".vibe", ".venv", "__pycache__", "target",
]);

export interface FileEntry {
  /** Path relative to the project root, POSIX separators. */
  path: string;
  hash: string;
  bytes: number;
  isTest: boolean;
  /** Files this source file imports (project-relative, best effort). */
  imports: string[];
}

export interface RepoIndex {
  schema: "steward.intel.v1";
  indexedAt: string;
  revision: string;
  files: FileEntry[];
}

export const RepoIndexSchema = z.object({
  schema: z.literal("steward.intel.v1"),
  indexedAt: z.string().min(1),
  revision: z.string(),
  files: z.array(
    z.object({
      path: z.string().min(1),
      hash: z.string().length(64),
      bytes: z.number().int().nonnegative(),
      isTest: z.boolean(),
      imports: z.array(z.string()),
    })
  ),
});

// ─── import extraction (language-agnostic, conservative) ────────────────

const IMPORT_PATTERNS: RegExp[] = [
  // ts/js: import ... from "x", export ... from "x", require("x"), dynamic import("x")
  /(?:from\s+|require\s*\(\s*|import\s*\(\s*)["']([^"']+)["']/g,
  // python: import x, from x import y
  /^\s*from\s+([.\w]+)\s+import\s/m,
  /^\s*import\s+([.\w]+)(?:\s+as\s+\w+)?\s*$/m,
];

function resolveImportPath(fromFile: string, spec: string, allPaths: Set<string>): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("@/")) return null;
  const base = spec.startsWith("@/")
    ? path.posix.join("src", spec.slice(2))
    : path.posix.join(path.posix.dirname(fromFile), spec);
  const withoutExt = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
  const candidates = [
    base,
    withoutExt,
    `${withoutExt}.ts`, `${withoutExt}.tsx`, `${withoutExt}.js`, `${withoutExt}.jsx`,
    `${withoutExt}.mjs`, `${withoutExt}.cjs`,
    `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.jsx`,
  ];
  for (const c of candidates) {
    if (allPaths.has(c)) return c;
  }
  return null;
}

function extractImports(relPath: string, content: string, allPaths: Set<string>): string[] {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py)$/.test(relPath)) return [];
  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      const spec = m[1];
      if (!spec) continue;
      const resolved = resolveImportPath(relPath, spec, allPaths);
      if (resolved) found.add(resolved);
    }
  }
  return [...found].sort();
}

// ─── indexing ────────────────────────────────────────────────────────────

function currentRevision(root: string): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function listProjectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") && entry.name !== ".github") {
        if (DEFAULT_IGNORES.has(entry.name)) continue;
        if (entry.name !== ".steward" && entry.name !== ".vibe" && entry.name.startsWith(".")) continue;
      }
      if (DEFAULT_IGNORES.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        out.push(abs);
      }
    }
  };
  walk(root);
  return out.map((abs) => path.relative(root, abs).split(path.sep).join("/")).sort();
}

/**
 * Build (or rebuild) the repository index. Deterministic: same tree → same
 * index content (timestamps excepted). Skips files > 1MB and binary-ish
 * content for import extraction.
 */
export function buildIndex(root: string): RepoIndex {
  const allPaths = new Set(listProjectFiles(root));
  const files: FileEntry[] = [];
  for (const rel of allPaths) {
    const abs = resolveWithin(root, rel);
    try {
      const stat = fs.statSync(abs);
      if (stat.size > 1_000_000) {
        files.push({ path: rel, hash: sha256(`skip:${rel}:${stat.size}`), bytes: stat.size, isTest: TEST_FILE_RE.test(rel), imports: [] });
        continue;
      }
      const content = fs.readFileSync(abs, "utf8");
      files.push({
        path: rel,
        hash: sha256(content),
        bytes: stat.size,
        isTest: TEST_FILE_RE.test(rel),
        imports: extractImports(rel, content, allPaths),
      });
    } catch {
      // unreadable (deleted mid-walk, permission): record presence only
      files.push({ path: rel, hash: "", bytes: 0, isTest: TEST_FILE_RE.test(rel), imports: [] });
    }
  }
  const index: RepoIndex = {
    schema: "steward.intel.v1",
    indexedAt: nowIso(),
    revision: currentRevision(root),
    files: files.sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  saveIndex(root, index);
  return index;
}

function indexFile(root: string): string {
  return path.join(stewardPaths(root).dir, "intel", "index.json");
}

export function saveIndex(root: string, index: RepoIndex): void {
  ensureDir(path.dirname(indexFile(root)));
  fs.writeFileSync(indexFile(root), JSON.stringify(index, null, 2), "utf8");
}

export function readIndex(root: string): RepoIndex | null {
  const raw = readYaml(indexFile(root), RepoIndexSchema);
  return raw as RepoIndex | null;
}

/**
 * Load the index, rebuilding it if it may be stale. A cached index is only
 * trusted when the tree's revision matches AND the on-disk file set still
 * matches the index (new uncommitted files must be visible immediately —
 * WIP is exactly what Steward analyzes). Cost is one directory walk.
 */
export function ensureIndex(root: string): RepoIndex {
  const existing = readIndex(root);
  const revision = currentRevision(root);
  if (existing && existing.revision === revision && existing.files.length > 0) {
    const onDisk = listProjectFiles(root);
    const indexed = new Set(existing.files.map((f) => f.path));
    const same =
      onDisk.length === indexed.size && onDisk.every((p) => indexed.has(p));
    if (same) return existing;
  }
  return buildIndex(root);
}

/** Files that differ between two index snapshots (added/removed/modified). */
export interface IndexDelta {
  added: string[];
  removed: string[];
  modified: string[];
}

export function diffIndexes(before: RepoIndex, after: RepoIndex): IndexDelta {
  const beforeMap = new Map(before.files.map((f) => [f.path, f.hash]));
  const afterMap = new Map(after.files.map((f) => [f.path, f.hash]));
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  for (const [p, h] of afterMap) {
    const old = beforeMap.get(p);
    if (old === undefined) added.push(p);
    else if (old !== h) modified.push(p);
  }
  for (const p of beforeMap.keys()) {
    if (!afterMap.has(p)) removed.push(p);
  }
  return { added: added.sort(), removed: removed.sort(), modified: modified.sort() };
}
