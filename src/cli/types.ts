// DevPilot CLI - Type Definitions

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
  | "django"
  | "flask"
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
  openaiApiKey?: string;
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

// ─── Roadmap & Task Orchestration ───────────────────────────────────────

export interface Roadmap {
  specName: string;
  phases: Phase[];
  totalTasks: number;
  estimatedComplexity: "low" | "medium" | "high" | "very-high";
  createdAt: string;
}

export interface Phase {
  id: string;
  name: string;
  description: string;
  order: number;
  tasks: MiniTask[];
  auditStrategy: AuditStrategy;
  gate: PhaseGate;
}

export interface MiniTask {
  id: string;
  phaseId: string;
  title: string;
  description: string;
  type: TaskType;
  priority: "critical" | "high" | "medium" | "low";
  dependencies: string[]; // task IDs
  assignedAgent?: Agent;
  estimatedEffort: "tiny" | "small" | "medium" | "large";
  status: TaskStatus;
  files: string[]; // files to create/modify
  acceptanceCriteria: string[];
  auditChecks: string[];
  prompt: string; // generated prompt for the agent
}

export type TaskType =
  | "scaffold"
  | "schema"
  | "api"
  | "ui"
  | "auth"
  | "integration"
  | "test"
  | "docs"
  | "config"
  | "deploy"
  | "refactor";

export type TaskStatus =
  | "pending"
  | "in-progress"
  | "review"
  | "testing"
  | "done"
  | "blocked";

export interface AuditStrategy {
  phaseId: string;
  checklist: AuditCheck[];
  testPlan: TestPlan;
  reviewGuidelines: string[];
}

export interface AuditCheck {
  id: string;
  category: "code-quality" | "security" | "performance" | "accessibility" | "testing";
  description: string;
  automated: boolean;
  command?: string; // e.g. "npm run lint", "npm test"
}

export interface TestPlan {
  unitTests: string[];
  integrationTests: string[];
  e2eTests: string[];
  coverageTarget: number; // percentage
}

export interface PhaseGate {
  description: string;
  requiredChecks: string[];
  autoPassCriteria: string[];
}

export interface OrchestrationResult {
  roadmap: Roadmap;
  projectPath: string;
  agentPrompts: AgentPromptBundle[];
  auditReport: AuditReport;
}

export interface AgentPromptBundle {
  agent: Agent;
  taskId: string;
  phaseId: string;
  prompt: string;
  context: string;
}

export interface AuditReport {
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  details: AuditCheckResult[];
}

export interface AuditCheckResult {
  checkId: string;
  status: "pass" | "fail" | "skip" | "pending";
  message?: string;
}

