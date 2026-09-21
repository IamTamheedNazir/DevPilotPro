import * as fs from "node:fs";
import * as path from "node:path";
import { rulePointerBody } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Windsurf adapter (Cascade / Devin Desktop).
 * Verified 2026-09-20 against the official Memories & Rules docs
 * (docs.devin.ai/desktop/cascade/memories):
 *  - workspace rules: .devin/rules/*.md (preferred) with .windsurf/rules/*.md
 *    kept as a read fallback — one file per rule, frontmatter `trigger:`
 *    field (always_on | glob | model_decision | manual), 12,000-char limit
 *  - we emit `trigger: manual` (context is loaded on demand, matching our
 *    context-economy model)
 * Limitations: skills and workflows exist on the platform but were not
 * verified here; commands stay unsupported.
 */
export const windsurfAdapter: HarnessAdapter = {
  id: "windsurf" as InstallTarget,
  label: "Windsurf",
  homepage: "https://docs.devin.ai/desktop/cascade/memories",
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
    if (fs.existsSync(path.join(root, ".windsurf"))) signals.push(".windsurf/");
    return {
      id: this.id,
      label: this.label,
      detected: signals.length > 0,
      signals,
    };
  },
  artifacts(skill: CanonicalSkill): Artifact[] {
    const body = [
      "---",
      "trigger: manual",
      "---",
      "",
      rulePointerBody(skill),
    ].join("\n");
    return [
      {
        file: `.windsurf/rules/steward-${skill.front.id}.md`,
        content: body,
        mode: "file",
      },
    ];
  },
  indexBlock(): Artifact | null {
    return null;
  },
};
