import type { CanonicalSkill, InstallTarget } from "@steward/core";

/**
 * Declared capabilities of a harness. Confidence values are evidence-backed:
 *  - verified  : format confirmed against current official documentation
 *  - partial   : confirmed for some of the surface claimed here
 *  - unverified: plausible but not yet confirmed; see docs/SUPPORT_MATRIX.md
 */
export interface HarnessCapabilities {
  projectCommands: "supported" | "unsupported";
  userCommands: "supported" | "unsupported";
  nativeSkills: boolean;
  rules: boolean;
  /** Memory/context doc the harness always reads, if any. */
  memoryDoc: string | null;
  hooks: boolean;
  mcp: boolean;
  confidence: "verified" | "partial" | "unverified";
}

export interface Detection {
  id: InstallTarget;
  label: string;
  detected: boolean;
  signals: string[];
}

export interface Artifact {
  file: string;
  content: string;
  mode: "file" | "block";
  blockId?: string;
}

export interface HarnessAdapter {
  id: InstallTarget;
  label: string;
  homepage: string;
  capabilities: HarnessCapabilities;
  detect(root: string): Detection;
  /** Compile one canonical skill into harness-specific artifacts. */
  artifacts(skill: CanonicalSkill): Artifact[];
  /** One managed index block injected into the harness memory doc (or null). */
  indexBlock(skills: CanonicalSkill[]): Artifact | null;
}
