import * as fs from "node:fs";
import * as path from "node:path";
import { rulePointerBody } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Roo Code adapter.
 * Confidence "unverified": the .roo/rules/*.md project-rules convention is
 * widely documented but was not verified against official docs at authoring
 * time. See docs/SUPPORT_MATRIX.md before promoting this adapter.
 */
export const rooAdapter: HarnessAdapter = {
  id: "roo" as InstallTarget,
  label: "Roo Code",
  homepage: "https://docs.roocode.com/features/rules",
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
    if (fs.existsSync(path.join(root, ".roo"))) signals.push(".roo/");
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
        file: `.roo/rules/steward-${skill.front.id}.md`,
        content: rulePointerBody(skill),
        mode: "file",
      },
    ];
  },
  indexBlock(): Artifact | null {
    return null;
  },
};
