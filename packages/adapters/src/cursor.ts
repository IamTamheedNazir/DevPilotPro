import * as fs from "node:fs";
import * as path from "node:path";
import { cursorRuleBody } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill } from "@steward/core";

/**
 * Cursor adapter.
 * Rules verified 2026-09-20 against cursor.com/docs/rules: .cursor/rules/*.mdc
 * with frontmatter description/globs/alwaysApply; agent-requested rules use
 * the description for relevance matching. Cursor slash-commands were not
 * verifiable at authoring time and are not claimed.
 */
export const cursorAdapter: HarnessAdapter = {
  id: "cursor",
  label: "Cursor",
  homepage: "https://cursor.com/docs/rules",
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
    if (fs.existsSync(path.join(root, ".cursor"))) signals.push(".cursor/");
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
        file: `.cursor/rules/steward-${skill.front.id}.mdc`,
        content: cursorRuleBody(skill),
        mode: "file",
      },
    ];
  },
  indexBlock(): Artifact | null {
    return null;
  },
};
