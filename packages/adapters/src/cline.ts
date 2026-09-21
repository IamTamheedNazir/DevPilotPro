import * as fs from "node:fs";
import * as path from "node:path";
import { rulePointerBody } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Cline adapter.
 * Partially verified 2026-09-20 against the official README
 * (github.com/cline/cline): "Define project-specific rules in `.clinerules`
 * files … picked up automatically by the CLI, VS Code extension, and JetBrains
 * plugin" — the .clinerules mechanism is confirmed, but the exact directory
 * layout (directory vs single file) was not fully confirmable at access time,
 * so confidence stays "partial". Skills exist on the platform but were not
 * verified here.
 */
export const clineAdapter: HarnessAdapter = {
  id: "cline" as InstallTarget,
  label: "Cline",
  homepage: "https://github.com/cline/cline",
  capabilities: {
    projectCommands: "unsupported",
    userCommands: "unsupported",
    nativeSkills: false,
    rules: true,
    memoryDoc: null,
    hooks: false,
    mcp: true,
    confidence: "partial",
  },
  detect(root: string): Detection {
    const signals: string[] = [];
    if (fs.existsSync(path.join(root, ".clinerules"))) signals.push(".clinerules");
    return {
      id: this.id,
      label: this.label,
      detected: signals.length > 0,
      signals,
    };
  },
  artifacts(skill: CanonicalSkill): Artifact[] {
    return [
      {
        file: `.clinerules/steward-${skill.front.id}.md`,
        content: rulePointerBody(skill),
        mode: "file",
      },
    ];
  },
  indexBlock(): Artifact | null {
    return null;
  },
};
