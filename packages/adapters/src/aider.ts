import * as fs from "node:fs";
import * as path from "node:path";
import { memoryIndexMarkdown } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Aider adapter.
 * Verified 2026-09-20 against the official conventions docs
 * (aider.chat/docs/usage/conventions.html):
 *  - conventions are a markdown file (e.g. CONVENTIONS.md) loaded with
 *    `aider --read CONVENTIONS.md` or `read: CONVENTIONS.md` in
 *    .aider.conf.yml
 * Aider has no project-scope command files, hooks, or MCP, so this adapter
 * contributes a single managed skill index inside CONVENTIONS.md and no
 * per-skill artifacts.
 */
export const aiderAdapter: HarnessAdapter = {
  id: "aider" as InstallTarget,
  label: "Aider",
  homepage: "https://aider.chat/docs/usage/conventions.html",
  capabilities: {
    projectCommands: "unsupported",
    userCommands: "unsupported",
    nativeSkills: false,
    rules: false,
    memoryDoc: "CONVENTIONS.md",
    hooks: false,
    mcp: false,
    confidence: "verified",
  },
  detect(root: string): Detection {
    const signals: string[] = [];
    if (fs.existsSync(path.join(root, "CONVENTIONS.md"))) signals.push("CONVENTIONS.md");
    if (fs.existsSync(path.join(root, ".aider.conf.yml"))) signals.push(".aider.conf.yml");
    if (fs.existsSync(path.join(root, ".aiderignore"))) signals.push(".aiderignore");
    return {
      id: this.id,
      label: this.label,
      detected: signals.length > 0,
      signals,
    };
  },
  artifacts(_skill: CanonicalSkill): Artifact[] {
    return [];
  },
  indexBlock(skills): Artifact {
    return {
      file: "CONVENTIONS.md",
      content: memoryIndexMarkdown(skills, "Aider"),
      mode: "block",
      blockId: "skills-index",
    };
  },
};
