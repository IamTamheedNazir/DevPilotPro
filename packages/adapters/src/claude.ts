import * as fs from "node:fs";
import * as path from "node:path";
import {
  claudeSkillMd,
  commandStub,
} from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Claude Code adapter.
 * Formats verified 2026-09-20 against code.claude.com/docs/en/skills and the
 * custom slash-commands documentation:
 *  - project skills:  .claude/skills/<name>/SKILL.md (frontmatter: name, description)
 *  - project commands: .claude/commands/<name>.md (frontmatter: description, ...)
 */
export const claudeAdapter: HarnessAdapter = {
  id: "claude" as InstallTarget,
  label: "Claude Code",
  homepage: "https://code.claude.com/docs/en/skills",
  capabilities: {
    projectCommands: "supported",
    userCommands: "supported",
    nativeSkills: true,
    rules: false,
    memoryDoc: null,
    hooks: true,
    mcp: true,
    confidence: "verified",
  },
  detect(root: string): Detection {
    const signals: string[] = [];
    if (fs.existsSync(path.join(root, ".claude"))) signals.push(".claude/");
    if (fs.existsSync(path.join(root, "CLAUDE.md"))) signals.push("CLAUDE.md");
    return {
      id: this.id,
      label: this.label,
      detected: signals.length > 0,
      signals,
    };
  },
  artifacts(skill: CanonicalSkill): Artifact[] {
    const { front, body } = commandStub(skill);
    return [
      {
        file: `.claude/commands/${skill.front.id}.md`,
        content: `${front}${body}`,
        mode: "file",
      },
      {
        file: `.claude/skills/${skill.front.id}/SKILL.md`,
        content: claudeSkillMd(skill),
        mode: "file",
      },
    ];
  },
  indexBlock(): Artifact | null {
    // Claude Code already provides progressive disclosure via native skills;
    // an always-read CLAUDE.md index would add standing context cost.
    return null;
  },
};
