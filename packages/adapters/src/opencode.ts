import * as fs from "node:fs";
import * as path from "node:path";
import { memoryIndexMarkdown, commandStub } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill } from "@steward/core";

/**
 * OpenCode adapter.
 * Verified 2026-09-20 against opencode.ai/docs/commands and /docs/rules:
 *  - per-project commands: .opencode/commands/<name>.md (frontmatter
 *    description/agent/model; $ARGUMENTS placeholder supported)
 *  - instructions: AGENTS.md
 */
export const opencodeAdapter: HarnessAdapter = {
  id: "opencode",
  label: "OpenCode",
  homepage: "https://opencode.ai/docs/commands/",
  capabilities: {
    projectCommands: "supported",
    userCommands: "supported",
    nativeSkills: false,
    rules: false,
    memoryDoc: "AGENTS.md",
    hooks: false,
    mcp: true,
    confidence: "verified",
  },
  detect(root: string): Detection {
    const signals: string[] = [];
    if (fs.existsSync(path.join(root, ".opencode"))) signals.push(".opencode/");
    if (fs.existsSync(path.join(root, "AGENTS.md"))) signals.push("AGENTS.md");
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
        file: `.opencode/commands/${skill.front.id}.md`,
        content: `${front}${body}`,
        mode: "file",
      },
    ];
  },
  indexBlock(skills): Artifact {
    return {
      file: "AGENTS.md",
      content: memoryIndexMarkdown(skills, "OpenCode"),
      mode: "block",
      blockId: "skills-index",
    };
  },
};
