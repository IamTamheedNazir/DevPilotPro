import * as fs from "node:fs";
import * as path from "node:path";
import { memoryIndexMarkdown } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * GitHub Copilot adapter.
 * Verified 2026-09-20 against the official repository-instructions docs
 * (docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/
 * add-custom-instructions/add-repository-instructions):
 *  - repository-wide instructions: .github/copilot-instructions.md
 *  - path-specific instructions: .github/instructions/NAME.instructions.md
 *  - agents also read AGENTS.md (nearest file wins)
 * Copilot has no project-scope command files, so this adapter contributes a
 * single managed skill index inside its memory doc and no per-skill
 * artifacts. Hooks/MCP: MCP is supported by Copilot; hooks are not.
 */
export const copilotAdapter: HarnessAdapter = {
  id: "copilot" as InstallTarget,
  label: "GitHub Copilot",
  homepage: "https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions",
  capabilities: {
    projectCommands: "unsupported",
    userCommands: "supported",
    nativeSkills: false,
    rules: false,
    memoryDoc: ".github/copilot-instructions.md",
    hooks: false,
    mcp: true,
    confidence: "verified",
  },
  detect(root: string): Detection {
    const signals: string[] = [];
    if (fs.existsSync(path.join(root, ".github", "copilot-instructions.md")))
      signals.push(".github/copilot-instructions.md");
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
      file: ".github/copilot-instructions.md",
      content: memoryIndexMarkdown(skills, "GitHub Copilot"),
      mode: "block",
      blockId: "skills-index",
    };
  },
};
