import * as fs from "node:fs";
import * as path from "node:path";
import { memoryIndexMarkdown } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Aider adapter.
 * Confidence "unverified": aider's --read CONVENTIONS.md convention is widely
 * documented but was not verified against official docs at authoring time.
 * Aider has no project-scope command files, so this adapter contributes a
 * single managed skill index inside CONVENTIONS.md and no per-skill artifacts.
 */
export const aiderAdapter: HarnessAdapter = {
  id: "aider" as InstallTarget,
  label: "Aider",
  homepage: "https://aider.chat/docs/config/conventions.html",
  capabilities: {
    projectCommands: "unsupported",
    userCommands: "unsupported",
    nativeSkills: false,
    rules: false,
    memoryDoc: "CONVENTIONS.md",
    hooks: false,
    mcp: false,
    confidence: "unverified",
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
