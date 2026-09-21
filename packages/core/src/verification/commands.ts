import * as fs from "node:fs";
import * as path from "node:path";
import { readIfExists } from "../util/fs.js";
import { readYaml, writeYaml } from "../state/store.js";
import { ProjectStateConfig, type ProjectState } from "../state/schema.js";
import { stewardPaths } from "../state/paths.js";

/**
 * Project command discovery — conservative by design. Steward only maps a
 * category to a command when the project itself declares one (package.json
 * script, Makefile target) or when `.steward/project.yaml` overrides it.
 * Commands are never invented.
 */

export type CommandCategory = "test" | "typecheck" | "lint" | "build" | "custom";

export interface DiscoveredCommand {
  category: CommandCategory;
  command: string;
  source: "config" | "package.json" | "Makefile";
}

export function readProjectState(root: string): ProjectState | null {
  const file = stewardPaths(root).projectYaml;
  const state = readYaml(file, ProjectStateConfig);
  return state;
}

export function saveProjectState(root: string, state: ProjectState): void {
  writeYaml(stewardPaths(root).projectYaml, { ...state, updatedAt: new Date().toISOString() });
}

function fromPackageJson(root: string): DiscoveredCommand[] {
  const raw = readIfExists(path.join(root, "package.json"));
  if (!raw) return [];
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(raw);
  } catch {
    return [];
  }
  const scripts = pkg.scripts ?? {};
  const map: Array<[CommandCategory, string]> = [
    ["test", "test"],
    ["typecheck", "typecheck"],
    ["lint", "lint"],
    ["build", "build"],
  ];
  const out: DiscoveredCommand[] = [];
  for (const [category, script] of map) {
    if (typeof scripts[script] === "string" && scripts[script].length > 0) {
      out.push({ category, command: `npm run ${script}`, source: "package.json" });
    }
  }
  return out;
}

function fromMakefile(root: string): DiscoveredCommand[] {
  const raw = readIfExists(path.join(root, "Makefile"));
  if (!raw) return [];
  const out: DiscoveredCommand[] = [];
  const targets = new Set(
    raw
      .split("\n")
      .filter((l) => /^[a-zA-Z0-9_-]+:/.test(l) && !l.startsWith("\t"))
      .map((l) => l.split(":")[0].trim())
  );
  for (const [category, target] of [
    ["test", "test"],
    ["lint", "lint"],
    ["build", "build"],
    ["typecheck", "typecheck"],
  ] as Array<[CommandCategory, string]>) {
    if (targets.has(target)) {
      out.push({ category, command: `make ${target}`, source: "Makefile" });
    }
  }
  return out;
}

/**
 * Resolve the commands per category. Order of authority:
 *   1. `.steward/project.yaml` verification overrides (explicit, incl. disabling by omitting)
 *   2. package.json scripts
 *   3. Makefile targets
 */
export function resolveCommands(root: string): {
  commands: DiscoveredCommand[];
  config: ProjectState | null;
} {
  const config = readProjectState(root);
  const discovered: DiscoveredCommand[] = [];
  const overrides = config?.verification ?? {};
  const pkg = fromPackageJson(root);
  const make = fromMakefile(root);

  for (const category of ["test", "typecheck", "lint", "build"] as const) {
    const override = overrides[category];
    if (override) {
      discovered.push({ category, command: override, source: "config" });
      continue;
    }
    const found = pkg.find((c) => c.category === category) ?? make.find((c) => c.category === category);
    if (found) discovered.push(found);
  }
  return { commands: discovered, config };
}
