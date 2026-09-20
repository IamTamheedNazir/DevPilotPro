import * as fs from "node:fs";
import * as path from "node:path";
import { geminiToml } from "./shared.js";
import { memoryIndexMarkdown } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";
import type { CanonicalSkill } from "@steward/core";

/**
 * Gemini CLI adapter.
 * Verified 2026-09-20 against the Gemini CLI custom-commands docs and the
 * Google Cloud announcement: project-scope custom commands are TOML files at
 * .gemini/commands/<name>.toml with `description` and `prompt` fields;
 * GEMINI.md is the context file.
 */
export const geminiAdapter: HarnessAdapter = {
  id: "gemini",
  label: "Gemini CLI",
  homepage: "https://geminicli.com/docs/cli/custom-commands/",
  capabilities: {
    projectCommands: "supported",
    userCommands: "supported",
    nativeSkills: false,
    rules: false,
    memoryDoc: "GEMINI.md",
    hooks: false,
    mcp: true,
    confidence: "verified",
  },
  detect(root: string): Detection {
    const signals: string[] = [];
    if (fs.existsSync(path.join(root, ".gemini"))) signals.push(".gemini/");
    if (fs.existsSync(path.join(root, "GEMINI.md"))) signals.push("GEMINI.md");
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
        file: `.gemini/commands/${skill.front.id}.toml`,
        content: geminiToml(skill),
        mode: "file",
      },
    ];
  },
  indexBlock(skills): Artifact {
    return {
      file: "GEMINI.md",
      content: memoryIndexMarkdown(skills, "Gemini CLI"),
      mode: "block",
      blockId: "skills-index",
    };
  },
};
