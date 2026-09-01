// SpecForge CLI - Interactive Mode
// Guided prompts for spec creation and project generation

import inquirer from "inquirer";
import { Framework, Language, Agent } from "./types.js";

interface InteractiveSpecAnswers {
  name: string;
  description: string;
  framework: Framework;
  language: Language;
  features: string;
  agents: Agent[];
  author: string;
  version: string;
}

interface InteractiveGenerateAnswers {
  framework: Framework;
  language: Language;
  agents: Agent[];
  output: string;
  github: boolean;
  githubRepo?: string;
  githubPrivate: boolean;
}

const FRAMEWORK_CHOICES = [
  { name: "React (Vite + TypeScript)", value: "react" },
  { name: "Next.js (React + SSR)", value: "nextjs" },
  { name: "Vue 3 (Vite)", value: "vue" },
  { name: "SvelteKit", value: "svelte" },
  { name: "Express (Node.js)", value: "express" },
  { name: "Fastify (Node.js)", value: "fastify" },
  { name: "Django (Python)", value: "django" },
  { name: "Flask (Python)", value: "flask" },
  { name: "Go (net/http)", value: "go" },
  { name: "Rust (Actix Web)", value: "rust" },
  { name: "Vanilla HTML/CSS/JS", value: "vanilla" },
];

const LANGUAGE_CHOICES = [
  { name: "TypeScript", value: "typescript" },
  { name: "JavaScript", value: "javascript" },
  { name: "Python", value: "python" },
  { name: "Go", value: "go" },
  { name: "Rust", value: "rust" },
];

const AGENT_CHOICES = [
  { name: "Claude Code (.claude/CLAUDE.md)", value: "claude-code", checked: true },
  { name: "OpenAI Codex (CODEX.md)", value: "codex" },
  { name: "Cursor (.cursor/rules)", value: "cursor" },
  { name: "Windsurf (.windsurfrules)", value: "windsurf" },
  { name: "GitHub Copilot (.github/copilot-instructions.md)", value: "copilot" },
  { name: "Aider (.aider.conf.yml)", value: "aider" },
];

export async function promptForSpecCreation(): Promise<InteractiveSpecAnswers> {
  console.log("\n  🔮 SpecForge Interactive Mode - Create Spec\n");

  const answers = await inquirer.prompt<InteractiveSpecAnswers>([
    {
      type: "input",
      name: "name",
      message: "Project name:",
      validate: (input: string) => {
        if (!input.trim()) return "Project name is required";
        if (!/^[a-z0-9][a-z0-9-]*$/.test(input.trim())) {
          return "Name must be lowercase, alphanumeric, with hyphens (e.g., my-app)";
        }
        return true;
      },
    },
    {
      type: "input",
      name: "description",
      message: "Short description (one sentence):",
      validate: (input: string) => (input.trim() ? true : "Description is required"),
    },
    {
      type: "list",
      name: "framework",
      message: "Choose a framework:",
      choices: FRAMEWORK_CHOICES,
    },
    {
      type: "list",
      name: "language",
      message: "Choose a language:",
      choices: LANGUAGE_CHOICES,
    },
    {
      type: "input",
      name: "features",
      message: "Key features (comma-separated):",
      validate: (input: string) =>
        input.trim() ? true : "Enter at least one feature (comma-separated)",
      filter: (input: string) => input,
    },
    {
      type: "checkbox",
      name: "agents",
      message: "Select coding agents:",
      choices: AGENT_CHOICES,
      validate: (input: string[]) =>
        input.length > 0 ? true : "Select at least one agent",
    },
    {
      type: "input",
      name: "author",
      message: "Author name (optional):",
      default: "",
    },
  ]);

  return {
    ...answers,
    version: "1.0.0",
    features: answers.features,
  };
}

export async function promptForGeneration(): Promise<InteractiveGenerateAnswers> {
  console.log("\n  🔮 SpecForge Interactive Mode - Generate Project\n");

  const answers = await inquirer.prompt<InteractiveGenerateAnswers>([
    {
      type: "list",
      name: "framework",
      message: "Choose a framework:",
      choices: FRAMEWORK_CHOICES,
    },
    {
      type: "list",
      name: "language",
      message: "Choose a language:",
      choices: LANGUAGE_CHOICES,
    },
    {
      type: "checkbox",
      name: "agents",
      message: "Select coding agents for instructions:",
      choices: AGENT_CHOICES,
      validate: (input: string[]) =>
        input.length > 0 ? true : "Select at least one agent",
    },
    {
      type: "input",
      name: "output",
      message: "Output directory:",
      default: "./projects",
    },
    {
      type: "confirm",
      name: "github",
      message: "Push to GitHub after generation?",
      default: false,
    },
  ]);

  if (answers.github) {
    const githubAnswers = await inquirer.prompt([
      {
        type: "input",
        name: "githubRepo",
        message: "GitHub repo (owner/repo):",
        validate: (input: string) => {
          if (!input.trim()) return "Repo is required";
          if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(input.trim())) {
            return "Use format: owner/repo";
          }
          return true;
        },
      },
      {
        type: "confirm",
        name: "githubPrivate",
        message: "Make repo private?",
        default: true,
      },
    ]);

    return {
      ...answers,
      githubRepo: githubAnswers.githubRepo,
      githubPrivate: githubAnswers.githubPrivate,
    };
  }

  return {
    ...answers,
    githubPrivate: false,
  };
}

export async function promptForQuickStart(): Promise<{
  prompt: string;
  framework: Framework;
  agents: Agent[];
}> {
  console.log("\n  ⚡ SpecForge Quick Start\n");
  console.log("  Describe your project in a few words and we'll generate everything.\n");

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "prompt",
      message: "Describe your project:",
      validate: (input: string) =>
        input.trim().length > 10
          ? true
          : "Please describe your project in more detail (10+ characters)",
    },
    {
      type: "list",
      name: "framework",
      message: "Choose a framework:",
      choices: FRAMEWORK_CHOICES,
    },
    {
      type: "checkbox",
      name: "agents",
      message: "Select coding agents:",
      choices: AGENT_CHOICES,
      validate: (input: string[]) =>
        input.length > 0 ? true : "Select at least one agent",
    },
  ]);

  return answers;
}

export async function promptForGitHubPush(): Promise<{
  repo: string;
  private: boolean;
  message: string;
}> {
  return inquirer.prompt([
    {
      type: "input",
      name: "repo",
      message: "GitHub repo (owner/repo or URL):",
      validate: (input: string) => {
        if (!input.trim()) return "Repo is required";
        return true;
      },
    },
    {
      type: "confirm",
      name: "private",
      message: "Make repo private?",
      default: true,
    },
    {
      type: "input",
      name: "message",
      message: "Commit message:",
      default: "Initial commit from SpecForge",
    },
  ]);
}
