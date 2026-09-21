import * as fs from "node:fs";
import * as path from "node:path";
import { rulePointerBody } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Roo Code adapter.
 * Verified 2026-09-20 against the official custom-instructions docs
 * (roocodeinc.github.io/Roo-Code/features/custom-instructions/):
 *  - workspace rules directory: .roo/rules/ (files read recursively,
 *    appended alphabetically; .roorules single-file is only a fallback)
 *  - mode-specific rules live in .roo/rules-<modeSlug>/, which we do not use
 * Limitations: custom modes/workflows exist but were not verified here, so
 * projectCommands stays "unsupported" (conservative).
 */
export const rooAdapter: HarnessAdapter = {
  id: "roo" as InstallTarget,
  label: "Roo Code",
  homepage: "https://roocodeinc.github.io/Roo-Code/features/custom-instructions/",
  capabilities: {
    projectCommands: "unsupported",
    userCommands: "unsupported",
    nativeSkills: false,
    rules: true,
    memoryDoc: null,
    hooks: false,
    mcp: true,
    confidence: "verified",
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
