import * as fs from "node:fs";
import * as path from "node:path";
import { rulePointerBody } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Cline adapter.
 * Confidence "unverified": the .clinerules/<name>.md directory convention is
 * widely documented but was not verified against official docs at authoring
 * time. See docs/SUPPORT_MATRIX.md before promoting this adapter.
 */
export const clineAdapter: HarnessAdapter = {
  id: "cline" as InstallTarget,
  label: "Cline",
  homepage: "https://docs.cline.bot/features/clinerules",
  capabilities: {
    projectCommands: "unsupported",
    userCommands: "unsupported",
    nativeSkills: false,
    rules: true,
    memoryDoc: null,
    hooks: false,
    mcp: true,
    confidence: "unverified",
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
