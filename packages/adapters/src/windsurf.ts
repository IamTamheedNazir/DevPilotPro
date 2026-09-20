import * as fs from "node:fs";
import * as path from "node:path";
import { rulePointerBody } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Windsurf adapter.
 * Confidence "unverified": the .windsurf/rules/*.md format (frontmatter with
 * a `trigger` field) is widely documented but was not verified against
 * official docs at authoring time. See docs/SUPPORT_MATRIX.md before
 * promoting this adapter.
 */
export const windsurfAdapter: HarnessAdapter = {
  id: "windsurf" as InstallTarget,
  label: "Windsurf",
  homepage: "https://docs.windsurf.com/windsurf/cascada/memories",
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
