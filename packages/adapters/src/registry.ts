import type { InstallTarget } from "@steward/core";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { cursorAdapter } from "./cursor.js";
import { geminiAdapter } from "./gemini.js";
import { opencodeAdapter } from "./opencode.js";
import { windsurfAdapter } from "./windsurf.js";
import { clineAdapter } from "./cline.js";
import { rooAdapter } from "./roo.js";
import { copilotAdapter } from "./copilot.js";
import { aiderAdapter } from "./aider.js";
import type { Detection, HarnessAdapter } from "./types.js";

export const ADAPTERS: HarnessAdapter[] = [
  claudeAdapter,
  codexAdapter,
  cursorAdapter,
  opencodeAdapter,
  geminiAdapter,
  windsurfAdapter,
  clineAdapter,
  rooAdapter,
  copilotAdapter,
  aiderAdapter,
];

export function getAdapter(id: InstallTarget): HarnessAdapter {
  const adapter = ADAPTERS.find((a) => a.id === id);
  if (!adapter) {
    throw new Error(
      `unknown target '${id}'; supported: ${ADAPTERS.map((a) => a.id).join(", ")}`
    );
  }
  return adapter;
}

export function isAdapterId(value: string): value is InstallTarget {
  return ADAPTERS.some((a) => a.id === value);
}

export function detectAll(root: string): Detection[] {
  return ADAPTERS.map((a) => a.detect(root));
}
