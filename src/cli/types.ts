// SpecForge CLI - Type Definitions

export interface SpecConfig {
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
}

export interface SpecMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SpecSection {
  id: string;
  title: string;
  content: string;
  subsections?: SpecSection[];
}

export interface SpecFile {
  metadata: SpecMetadata;
  overview: string;
  sections: SpecSection[];
  requirements?: string[];
  constraints?: string[];
  examples?: string[];
}

export interface ProjectConfig {
  name: string;
  description: string;
  framework: Framework;
  language: Language;
  features: string[];
  agents: Agent[];
  github?: GitHubConfig;
}

export type Framework =
  | "react"
  | "nextjs"
  | "vue"
  | "svelte"
  | "express"
  | "fastify"
  | "python"
  | "go"
  | "rust"
  | "vanilla";

export type Language = "typescript" | "javascript" | "python" | "go" | "rust";

export type Agent = "claude-code" | "codex" | "cursor" | "windsurf" | "copilot" | "aider";

export interface GitHubConfig {
  owner: string;
  repo: string;
  private: boolean;
  branch: string;
}

export interface GeneratedProject {
  name: string;
  path: string;
  framework: Framework;
  files: GeneratedFile[];
  agentInstructions: AgentInstruction[];
  github?: GitHubConfig;
}

export interface GeneratedFile {
  path: string;
  content: string;
  description: string;
}

export interface AgentInstruction {
  agent: Agent;
  file: string;
  prompt: string;
}

export interface CLIConfig {
  defaultFramework: Framework;
  defaultLanguage: Language;
  defaultAgents: Agent[];
  githubToken?: string;
  outputDir: string;
}

export interface GenerationOptions {
  framework?: Framework;
  language?: Language;
  agents?: Agent[];
  outputDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
}
