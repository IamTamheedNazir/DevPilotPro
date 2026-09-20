import * as fs from "node:fs";
import * as path from "node:path";
import { applyBlock } from "@steward/core";
import { memoryIndexMarkdown } from "./shared.js";
import type { Artifact, Detection, HarnessAdapter } from "./types.js";

/**
 * OpenAI Codex CLI adapter.
 * AGENTS.md is Codex's project instruction file (verified 2026-09-20).
 * User-scope custom prompts (~/.codex/prompts/*.md) exist but are documented
 * as deprecated upstream; the project-scope AGENTS.md index is the stable
 * primitive, so this adapter ships no command stubs in Phase 1.
 */
export const codexAdapter: HarnessAdapter = {
  id: "codex",
  label: "OpenAI Codex CLI",
  homepage: "https://developers.openai.com/codex",
  capabilities: {
    projectCommands: "unsupported",
    userCommands: "supported",
    nativeSkills: false,
    rules: false,
    memoryDoc: "AGENTS.md",
    hooks: false,
    mcp: true,
    confidence: "partial",
  },
  detect(root: string): Detection {
    const signals: string[] = [];
    if (fs.existsSync(path.join(root, "AGENTS.md"))) signals.push("AGENTS.md");
    if (fs.existsSync(path.join(root, ".codex"))) signals.push(".codex/");
    return {
      id: this.id,
      label: this.label,
      detected: signals.length > 0,
      signals,
    };
  },
  artifacts(): Artifact[] {
    return [];
  },
  indexBlock(skills): Artifact {
    return {
      file: "AGENTS.md",
      content: memoryIndexMarkdown(skills, "Codex"),
      mode: "block",
      blockId: "skills-index",
    };
  },
};
