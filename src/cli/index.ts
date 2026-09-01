#!/usr/bin/env node

// DevPilot CLI - Main Entry Point
// A powerful spec-driven development tool that works with coding agents

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import inquirer from "inquirer";
import { SpecParser, createSampleSpec } from "./spec-parser.js";
import { ProjectGenerator } from "./project-generator.js";
import { GitHubIntegration, parseGitHubUrl } from "./github.js";
import { loadConfig, updateConfig } from "./config.js";
import { AISpecGenerator, createAISpecFromPrompt } from "./ai-generator.js";
import {
  promptForSpecCreation,
  promptForGeneration,
  promptForQuickStart,
  promptForGitHubPush,
} from "./interactive.js";
import { RoadmapGenerator } from "./roadmap.js";
import { AgentOrchestrator } from "./orchestrator.js";
import { Framework, Language, Agent, ProjectConfig, GenerationOptions, Roadmap } from "./types.js";

const VERSION = "1.0.0";

const program = new Command();

program
  .name("devpilot")
  .description("DevPilot - Turn specs into full projects with coding agents")
  .version(VERSION);

// ─── INIT ────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Create a new spec file with a template")
  .argument("[name]", "Spec name", "my-project")
  .option("-f, --format <format>", "Spec format (md|yaml)", "md")
  .option("-i, --interactive", "Use interactive prompts")
  .action(async (name: string, options: { format: string; interactive: boolean }) => {
    if (options.interactive) {
      const answers = await promptForSpecCreation();
      const ext = options.format === "yaml" ? ".spec.yaml" : ".spec.md";
      const filePath = path.join(process.cwd(), `${answers.name}${ext}`);

      const tags = `[web]`;
      const featureList = answers.features
        .split(",")
        .map((f: string) => f.trim())
        .filter(Boolean);

      const spec = `---\nname: ${answers.name}\ndescription: ${answers.description}\nversion: ${answers.version}\nauthor: ${answers.author}\ntags: ${tags}\n---\n\n# ${answers.name}\n\n${answers.description}\n\n## Features\n\n### Core Features\n${featureList.map((f: string) => `- ${f}`).join("\n")}\n\n### Advanced Features\n- Performance optimization\n- Accessibility (WCAG 2.1)\n- Mobile responsive\n\n## Architecture\n\n### Frontend\n- ${answers.framework} with ${answers.language}\n\n### Backend\n- REST API with authentication\n\n## Requirements\n\n- Node.js 18+\n- Modern browser\n\n## Constraints\n\n- <200ms response time\n- GDPR compliant\n`;

      fs.writeFileSync(filePath, spec);
      console.log(`\n  ✨ Created spec file: ${filePath}\n`);
      console.log("  Next steps:");
      console.log(`    1. Review and edit ${filePath}`);
      console.log(`    2. Run: specforge generate ${filePath}`);
      console.log(`    3. Open the project with your coding agent\n`);
      return;
    }

    const ext = options.format === "yaml" ? ".spec.yaml" : ".spec.md";
    const filePath = path.join(process.cwd(), `${name}${ext}`);

    if (fs.existsSync(filePath)) {
      console.error(`Spec file already exists: ${filePath}`);
      process.exit(1);
    }

    const content = createSampleSpec().replace("my-awesome-app", name);
    fs.writeFileSync(filePath, content);

    console.log(`\n  ✨ Created spec file: ${filePath}\n`);
    console.log("  Next steps:");
    console.log(`    1. Edit ${filePath} with your project details`);
    console.log(`    2. Run: specforge generate ${filePath}`);
    console.log(`    3. Open the generated project with your coding agent\n`);
  });

// ─── CREATE (AI-powered) ────────────────────────────────────────────────

program
  .command("create")
  .description("Generate a spec from a natural language prompt using AI")
  .argument("[prompt]", "Describe your project in natural language")
  .option("--no-ai", "Generate a basic spec without AI (works offline)")
  .action(async (prompt: string | undefined, options: { ai: boolean }) => {
    let projectPrompt: string = prompt || "";

    if (!projectPrompt) {
      const answers = await inquirer.prompt<{ prompt: string }> ([{
        type: "input",
        name: "prompt",
        message: "Describe your project:",
        validate: (input: string) =>
          input.trim().length > 10
            ? true
            : "Please describe your project in more detail (10+ characters)",
      }]);
      projectPrompt = answers.prompt as string;
    }

    try {
      let specFilePath: string;

      const finalPrompt: string = projectPrompt as string;

      if (options.ai) {
        const generator = new AISpecGenerator();
        specFilePath = await generator.generateAndSave(finalPrompt, process.cwd());
      } else {
        const specContent = createAISpecFromPrompt(finalPrompt);
        const name = finalPrompt
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        specFilePath = path.join(process.cwd(), `${name}.spec.md`);
        fs.writeFileSync(specFilePath, specContent);
        console.log(`\n  ✨ Created spec from prompt: ${specFilePath}\n`);
      }

      console.log("  Next steps:");
      console.log(`    1. Review ${specFilePath}`);
      console.log(`    2. Run: specforge generate ${specFilePath}`);
      console.log(`    3. Open with your coding agent\n`);
    } catch (error) {
      console.error(`\n  ❌ ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

// ─── QUICK (Interactive wizard) ─────────────────────────────────────────

program
  .command("quick")
  .description("Interactive wizard: describe project → get spec → generate project")
  .action(async () => {
    try {
      const answers = await promptForQuickStart();

      console.log("\n  📝 Generating spec from your description...\n");

      // Generate spec from prompt
      let specFilePath: string;
      try {
        const generator = new AISpecGenerator();
        specFilePath = await generator.generateAndSave(answers.prompt, process.cwd());
      } catch {
        // Fallback to offline mode
        const specContent = createAISpecFromPrompt(answers.prompt);
        const name = answers.prompt
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        specFilePath = path.join(process.cwd(), `${name}.spec.md`);
        fs.writeFileSync(specFilePath, specContent);
        console.log(`  ✨ Created spec (offline mode): ${specFilePath}\n`);
      }

      // Parse and validate
      const parser = new SpecParser(specFilePath);
      const spec = parser.parse();

      // Generate project
      console.log("\n  🚀 Generating project...\n");

      const projectConfig: ProjectConfig = {
        name: spec.metadata.name,
        description: spec.metadata.description || spec.overview,
        framework: answers.framework,
        language: (answers.framework === "django" || answers.framework === "flask" || answers.framework === "python"
          ? "python"
          : answers.framework === "go"
          ? "go"
          : answers.framework === "rust"
          ? "rust"
          : "typescript") as Language,
        features: spec.sections.map((s) => s.title),
        agents: answers.agents,
      };

      const generator = new ProjectGenerator(spec, projectConfig, "./projects");
      const result = generator.generate();

      printSuccess(result.name, result.path, projectConfig.agents);
    } catch (error) {
      console.error(`\n  ❌ ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

// ─── VALIDATE ────────────────────────────────────────────────────────────

program
  .command("validate")
  .description("Validate a spec file")
  .argument("<file>", "Path to spec file")
  .action((file: string) => {
    try {
      const parser = new SpecParser(file);
      const spec = parser.parse();
      const result = parser.validate(spec);

      if (result.errors.length > 0) {
        console.error("\n  ❌ Validation errors:");
        for (const err of result.errors) {
          console.error(`    - [${err.field}] ${err.message}`);
        }
        process.exit(1);
      }

      console.log(`\n  ✅ Spec is valid: ${spec.metadata.name} v${spec.metadata.version}`);
      console.log(`  📄 ${spec.sections.length} sections`);

      if (result.warnings.length > 0) {
        console.log("\n  ⚠️  Warnings:");
        for (const warn of result.warnings) {
          console.log(`    - [${warn.field}] ${warn.message}`);
        }
      }

      console.log("");
    } catch (error) {
      console.error(`\n  ❌ ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

// ─── GENERATE ────────────────────────────────────────────────────────────

program
  .command("generate")
  .description("Generate a project from a spec file")
  .argument("[file]", "Path to spec file (omit for interactive mode)")
  .option("-f, --framework <framework>", "Framework")
  .option("-l, --language <language>", "Language")
  .option("-a, --agents <agents...>", "Coding agents to generate instructions for")
  .option("-o, --output <dir>", "Output directory", "./projects")
  .option("--github <repo>", "GitHub repo (owner/repo or URL) to push to after generation")
  .option("--private", "Make GitHub repo private", false)
  .option("--dry-run", "Show what would be generated without writing files", false)
  .option("-i, --interactive", "Use interactive prompts")
  .option("-v, --verbose", "Verbose output", false)
  .action(
    async (
      file: string | undefined,
      options: {
        framework?: string;
        language?: string;
        agents?: string[];
        output: string;
        github?: string;
        private: boolean;
        dryRun: boolean;
        interactive: boolean;
        verbose: boolean;
      }
    ) => {
      try {
        const config = loadConfig();

        // Interactive mode if no file specified or --interactive flag
        if (!file || options.interactive) {
          const answers = await promptForGeneration();
          const parser = new SpecParser(file || ".");
          // Find first .spec.md file in current directory if no file given
          if (!file) {
            const specFiles = fs.readdirSync(process.cwd()).filter((f) => f.endsWith(".spec.md") || f.endsWith(".spec.yaml"));
            if (specFiles.length === 0) {
              console.error("\n  ❌ No spec files found in current directory.\n");
              process.exit(1);
            }
            file = specFiles[0];
            console.log(`  📖 Using spec: ${file}\n`);
          }

          options.framework = answers.framework;
          options.language = answers.language;
          options.agents = answers.agents;
          options.output = answers.output;

          if (answers.github) {
            options.github = answers.githubRepo;
            options.private = answers.githubPrivate;
          }
        }

        if (!file) {
          console.error("\n  ❌ No spec file specified.\n");
          process.exit(1);
        }

        console.log("\n  🔧 DevPilot - Generating Project\n");

        // Parse spec
        console.log(`  📖 Parsing spec: ${file}`);
        const parser = new SpecParser(file);
        const spec = parser.parse();
        const validation = parser.validate(spec);

        if (!validation.valid) {
          console.error("  ❌ Spec validation failed:");
          for (const err of validation.errors) {
            console.error(`    - [${err.field}] ${err.message}`);
          }
          process.exit(1);
        }

        console.log(`  ✅ Spec: ${spec.metadata.name} v${spec.metadata.version}`);

        // Parse GitHub config if provided
        let githubConfig;
        if (options.github) {
          const parsed = parseGitHubUrl(options.github);
          if (!parsed) {
            console.error(`  ❌ Invalid GitHub URL: ${options.github}`);
            process.exit(1);
          }
          githubConfig = {
            owner: parsed.owner,
            repo: parsed.repo,
            private: options.private,
            branch: "main",
          };
        }

        // Build project config
        const projectConfig: ProjectConfig = {
          name: spec.metadata.name,
          description: spec.metadata.description || spec.overview,
          framework: (options.framework || config.defaultFramework) as Framework,
          language: (options.language || config.defaultLanguage) as Language,
          features: spec.sections.map((s) => s.title),
          agents: (options.agents || config.defaultAgents) as Agent[],
          github: githubConfig,
        };

        console.log(`  🏗️  Framework: ${projectConfig.framework}`);
        console.log(`  📝 Language: ${projectConfig.language}`);
        console.log(`  🤖 Agents: ${projectConfig.agents.join(", ")}`);

        if (options.dryRun) {
          console.log("\n  📋 Dry run - would generate:");
          console.log(`    - Project at: ${path.join(options.output, projectConfig.name)}`);
          console.log(`    - ${spec.sections.length} spec sections as docs`);
          for (const agent of projectConfig.agents) {
            console.log(`    - ${agent} instruction files`);
          }
          console.log("");
          return;
        }

        // Generate project
        console.log(`\n  🚀 Generating project...`);
        const generator = new ProjectGenerator(spec, projectConfig, options.output);
        const result = generator.generate();

        console.log(`  ✅ Generated ${result.files.length} files at: ${result.path}`);
        if (options.verbose) {
          for (const file of result.files) {
            console.log(`    📄 ${file.path} - ${file.description}`);
          }
        }

        // Push to GitHub if configured
        if (githubConfig) {
          console.log("\n  📤 Pushing to GitHub...");
          const github = new GitHubIntegration();

          if (!github.isAuthenticated()) {
            console.error("  ❌ GitHub not authenticated. Set GITHUB_TOKEN env variable.");
            console.log("  💡 Run: specforge config --github-token <your-token>\n");
            process.exit(1);
          }

          github
            .createRepo(
              githubConfig.owner,
              githubConfig.repo,
              spec.metadata.description || spec.metadata.name,
              githubConfig.private
            )
            .then(async (repoInfo) => {
              console.log(`  ✅ Created repo: ${repoInfo.url}`);
              await github.pushProject(result.path, githubConfig);
              console.log(`  ✅ Pushed to: ${repoInfo.url}\n`);
              printSuccess(result.name, result.path, projectConfig.agents);
            })
            .catch((err) => {
              console.error(`  ❌ GitHub error: ${(err as Error).message}\n`);
              process.exit(1);
            });
        } else {
          printSuccess(result.name, result.path, projectConfig.agents);
        }
      } catch (error) {
        console.error(`\n  ❌ ${(error as Error).message}\n`);
        process.exit(1);
      }
    }
  );

function printSuccess(name: string, projectPath: string, agents: Agent[]): void {
  console.log("\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  ✨ Project "${name}" generated successfully!\n`);
  console.log(`  📂 Location: ${projectPath}\n`);
  console.log("  🚀 Next steps:\n");
  console.log(`    cd ${projectPath}`);
  console.log("    npm install");
  console.log("    npm run dev\n");

  if (agents.length > 0) {
    console.log("  🤖 Coding agent instructions:\n");
    for (const agent of agents) {
      switch (agent) {
        case "claude-code":
          console.log("    Claude Code: Open the project folder in Claude Code");
          console.log("      It will read .claude/CLAUDE.md automatically.\n");
          break;
        case "codex":
          console.log("    Codex: Run `codex` in the project directory");
          console.log("      It will read CODEX.md automatically.\n");
          break;
        case "cursor":
          console.log("    Cursor: Open the project in Cursor IDE");
          console.log("      It will read .cursor/rules automatically.\n");
          break;
        case "windsurf":
          console.log("    Windsurf: Open the project in Windsurf IDE");
          console.log("      It will read .windsurfrules automatically.\n");
          break;
        case "copilot":
          console.log("    Copilot: Push to GitHub and use Copilot in VS Code");
          console.log("      It will read .github/copilot-instructions.md.\n");
          break;
        case "aider":
          console.log("    Aider: Run `aider` in the project directory");
          console.log("      It will read .aider.conf.yml automatically.\n");
          break;
      }
    }
  }

  console.log("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ─── AGENTS ──────────────────────────────────────────────────────────────

program
  .command("agents")
  .description("List supported coding agents and their config files")
  .action(() => {
    console.log("\n  🤖 Supported Coding Agents\n");
    console.log("  ┌─────────────────┬───────────────────────────────────────┐");
    console.log("  │ Agent           │ Config File                           │");
    console.log("  ├─────────────────┼───────────────────────────────────────┤");
    console.log("  │ Claude Code     │ .claude/CLAUDE.md                     │");
    console.log("  │ OpenAI Codex    │ CODEX.md                              │");
    console.log("  │ Cursor          │ .cursor/rules                         │");
    console.log("  │ Windsurf        │ .windsurfrules                        │");
    console.log("  │ GitHub Copilot  │ .github/copilot-instructions.md       │");
    console.log("  │ Aider           │ .aider.conf.yml                       │");
    console.log("  └─────────────────┴───────────────────────────────────────┘\n");
    console.log("  All agents receive the same spec context and instructions.");
    console.log("  Each config file is placed where the agent expects it.\n");
  });

// ─── CONFIG ──────────────────────────────────────────────────────────────

program
  .command("config")
  .description("View or update DevPilot configuration")
  .option("--list", "Show current configuration")
  .option("--framework <framework>", "Set default framework")
  .option("--language <language>", "Set default language")
  .option("--agents <agents...>", "Set default agents")
  .option("--output <dir>", "Set default output directory")
  .option("--github-token <token>", "Set GitHub personal access token")
  .option("--openai-key <key>", "Set OpenAI API key for AI spec generation")
  .action(
    (options: {
      list?: boolean;
      framework?: string;
      language?: string;
      agents?: string[];
      output?: string;
      githubToken?: string;
      openaiKey?: string;
    }) => {
      if (options.list || (!options.framework && !options.language && !options.agents && !options.output && !options.githubToken && !options.openaiKey)) {
        const config = loadConfig();
        console.log("\n  ⚙️  DevPilot Configuration\n");
        console.log(`    Framework:    ${config.defaultFramework}`);
        console.log(`    Language:     ${config.defaultLanguage}`);
        console.log(`    Agents:       ${config.defaultAgents.join(", ")}`);
        console.log(`    Output Dir:   ${config.outputDir}`);
        console.log(`    GitHub Token: ${config.githubToken ? "••••••••" + config.githubToken.slice(-4) : "Not set"}`);
        console.log(`    OpenAI Key:   ${config.openaiApiKey ? "••••••••" + config.openaiApiKey.slice(-4) : "Not set (needed for AI spec generation)"}`);
        console.log("");
        return;
      }

      const updates: Record<string, unknown> = {};
      if (options.framework) updates.defaultFramework = options.framework;
      if (options.language) updates.defaultLanguage = options.language;
      if (options.agents) updates.defaultAgents = options.agents;
      if (options.output) updates.outputDir = options.output;
      if (options.githubToken) updates.githubToken = options.githubToken;
      if (options.openaiKey) updates.openaiApiKey = options.openaiKey;

      updateConfig(updates as Partial<import("./types.js").CLIConfig>);
      console.log("\n  ✅ Configuration updated\n");
    }
  );

// ─── PUSH ────────────────────────────────────────────────────────────────

program
  .command("push")
  .description("Push an existing project to GitHub")
  .argument("<dir>", "Project directory to push")
  .argument("<repo>", "GitHub repo (owner/repo or URL)")
  .option("-m, --message <msg>", "Commit message", "Project from DevPilot")
  .option("--private", "Make repo private", false)
  .action(
    async (
      dir: string,
      repo: string,
      options: { message: string; private: boolean }
    ) => {
      const parsed = parseGitHubUrl(repo);
      if (!parsed) {
        console.error(`\n  ❌ Invalid GitHub URL: ${repo}\n`);
        process.exit(1);
      }

      const projectPath = path.resolve(dir);
      if (!fs.existsSync(projectPath)) {
        console.error(`\n  ❌ Directory not found: ${projectPath}\n`);
        process.exit(1);
      }

      const github = new GitHubIntegration();
      if (!github.isAuthenticated()) {
        console.error("\n  ❌ GitHub not authenticated.");
        console.log("  💡 Set GITHUB_TOKEN env variable or run: specforge config --github-token <token>\n");
        process.exit(1);
      }

      const config = {
        owner: parsed.owner,
        repo: parsed.repo,
        private: options.private,
        branch: "main",
      };

      try {
        console.log("\n  📤 Pushing to GitHub...\n");

        const repoInfo = await github.createRepo(
          config.owner,
          config.repo,
          `Project from DevPilot`,
          config.private
        );
        console.log(`  ✅ Created repo: ${repoInfo.url}`);

        await github.pushProject(projectPath, config, options.message);
        console.log(`  ✅ Pushed to: ${repoInfo.url}\n`);
      } catch (error) {
        console.error(`\n  ❌ ${(error as Error).message}\n`);
        process.exit(1);
      }
    }
  );

// ─── PARSE (preview) ────────────────────────────────────────────────────

program
  .command("parse")
  .description("Parse and display a spec file's structure")
  .argument("<file>", "Path to spec file")
  .option("--json", "Output as JSON", false)
  .action((file: string, options: { json: boolean }) => {
    try {
      const parser = new SpecParser(file);
      const spec = parser.parse();

      if (options.json) {
        console.log(JSON.stringify(spec, null, 2));
        return;
      }

      console.log(`\n  📖 Spec: ${spec.metadata.name} v${spec.metadata.version}`);
      console.log(`  📝 ${spec.metadata.description}\n`);

      if (spec.requirements) {
        console.log("  📋 Requirements:");
        for (const r of spec.requirements) {
          console.log(`    - ${r}`);
        }
        console.log("");
      }

      console.log(`  📑 Sections (${spec.sections.length}):\n`);
      for (const section of spec.sections) {
        console.log(`    ## ${section.title}`);
        const preview = section.content.trim().substring(0, 150);
        if (preview) {
          console.log(`       ${preview}${section.content.trim().length > 150 ? "..." : ""}`);
        }
        if (section.subsections && section.subsections.length > 0) {
          for (const sub of section.subsections) {
            console.log(`       ### ${sub.title}`);
          }
        }
        console.log("");
      }
    } catch (error) {
      console.error(`\n  ❌ ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

// ─── ROADMAP ────────────────────────────────────────────────────────────

program
  .command("roadmap")
  .description("Generate a development roadmap from a spec file")
  .argument("<file>", "Path to spec file")
  .option("-f, --framework <framework>", "Framework", "react")
  .option("-a, --agents <agents...>", "Agents", ["claude-code"])
  .option("--save", "Save roadmap to .specforge/roadmap.json", false)
  .action((file: string, options: { framework: string; agents: string[]; save: boolean }) => {
    try {
      console.log("\n  🗺️  DevPilot - Roadmap Generator\n");

      const parser = new SpecParser(file);
      const spec = parser.parse();
      const validation = parser.validate(spec);

      if (!validation.valid) {
        console.error("  ❌ Spec validation failed:");
        for (const err of validation.errors) {
          console.error(`    - [${err.field}] ${err.message}`);
        }
        process.exit(1);
      }

      const generator = new RoadmapGenerator(
        spec,
        options.framework as Framework,
        options.agents as Agent[]
      );
      const roadmap = generator.generate();

      console.log(`  📖 Spec: ${spec.metadata.name}`);
      console.log(`  🎯 Complexity: ${roadmap.estimatedComplexity}`);
      console.log(`  📋 Total tasks: ${roadmap.totalTasks}`);
      console.log(`  📊 Phases: ${roadmap.phases.length}\n`);

      for (const phase of roadmap.phases) {
        console.log(`  Phase ${phase.order + 1}: ${phase.name}`);
        console.log(`    ${phase.description}`);
        console.log(`    Tasks: ${phase.tasks.length}`);
        for (const task of phase.tasks) {
          const dep = task.dependencies.length > 0 ? ` (depends: ${task.dependencies.length})` : "";
          console.log(`      ⬜ ${task.title} [${task.estimatedEffort}]${dep}`);
        }
        console.log(`    Gate: ${phase.gate.description}`);
        console.log("");
      }

      if (options.save) {
        const outDir = path.join(process.cwd(), ".specforge");
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, "roadmap.json");
        fs.writeFileSync(outPath, JSON.stringify(roadmap, null, 2));
        console.log(`  ✅ Roadmap saved to: ${outPath}\n`);
      }
    } catch (error) {
      console.error(`\n  ❌ ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

// ─── ORCHESTRATE ────────────────────────────────────────────────────────

program
  .command("orchestrate")
  .description("Full pipeline: spec → roadmap → tasks → agent prompts → project")
  .argument("<file>", "Path to spec file")
  .option("-f, --framework <framework>", "Framework", "react")
  .option("-a, --agents <agents...>", "Agents", ["claude-code"])
  .option("-o, --output <dir>", "Output directory", "./projects")
  .option("--save", "Save all artifacts to .specforge/", false)
  .option("-v, --verbose", "Verbose output", false)
  .action(async (file: string, options: { framework: string; agents: string[]; output: string; save: boolean; verbose: boolean }) => {
    try {
      console.log("\n  🧠 DevPilot - Orchestration Engine\n");
      console.log("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      // Step 1: Parse spec
      console.log("  Step 1/5: Parsing spec...");
      const parser = new SpecParser(file);
      const spec = parser.parse();
      const validation = parser.validate(spec);

      if (!validation.valid) {
        console.error("  ❌ Spec validation failed:");
        for (const err of validation.errors) {
          console.error(`    - [${err.field}] ${err.message}`);
        }
        process.exit(1);
      }
      console.log(`  ✅ Parsed: ${spec.metadata.name} v${spec.metadata.version}\n`);

      // Step 2: Generate roadmap
      console.log("  Step 2/5: Generating roadmap...");
      const roadmapGen = new RoadmapGenerator(
        spec,
        options.framework as Framework,
        options.agents as Agent[]
      );
      const roadmap = roadmapGen.generate();
      console.log(`  ✅ Roadmap: ${roadmap.phases.length} phases, ${roadmap.totalTasks} tasks (${roadmap.estimatedComplexity})\n`);

      // Step 3: Generate project scaffold
      console.log("  Step 3/5: Generating project scaffold...");
      const projectConfig: ProjectConfig = {
        name: spec.metadata.name,
        description: spec.metadata.description || spec.overview,
        framework: options.framework as Framework,
        language: (options.framework === "django" || options.framework === "flask" ? "python" : options.framework === "go" ? "go" : options.framework === "rust" ? "rust" : "typescript") as Language,
        features: spec.sections.map((s) => s.title),
        agents: options.agents as Agent[],
      };
      const projectGen = new ProjectGenerator(spec, projectConfig, options.output);
      const project = projectGen.generate();
      console.log(`  ✅ Scaffolded: ${project.files.length} files at ${project.path}\n`);

      // Step 4: Assign agents and generate prompts
      console.log("  Step 4/5: Orchestrating agents...");
      const orchestrator = new AgentOrchestrator(
        roadmap,
        options.agents as Agent[],
        options.framework as Framework,
        spec
      );
      const bundles = orchestrator.orchestrate();
      console.log(`  ✅ Generated ${bundles.length} agent prompts\n`);

      // Step 5: Write execution plan
      console.log("  Step 5/5: Writing execution plan...");
      const executionPlan = orchestrator.getExecutionPlan(bundles);

      if (options.save) {
        const outDir = path.join(process.cwd(), ".specforge");
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "roadmap.json"), JSON.stringify(roadmap, null, 2));
        fs.writeFileSync(path.join(outDir, "execution-plan.md"), executionPlan);
        fs.writeFileSync(path.join(outDir, "prompts.json"), JSON.stringify(bundles, null, 2));
        console.log(`  ✅ Saved to .specforge/\n`);
      }

      // Print execution plan
      console.log(executionPlan);

      // Print agent-specific instructions
      console.log("\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("  🤖 Agent Assignment Summary\n");

      const agentCounts: Record<string, number> = {};
      for (const b of bundles) {
        agentCounts[b.agent] = (agentCounts[b.agent] || 0) + 1;
      }
      for (const [agent, count] of Object.entries(agentCounts)) {
        console.log(`    ${agent}: ${count} tasks assigned`);
      }

      console.log("\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("  ✨ Orchestration complete!\n");
      console.log("  The project scaffold is ready. Hand off tasks to your");
      console.log("  coding agents in order. Each agent prompt includes:");
      console.log("    - Full context (phase, dependencies, files)");
      console.log("    - Implementation requirements");
      console.log("    - Acceptance criteria");
      console.log("    - Quality audit checks\n");
    } catch (error) {
      console.error(`\n  ❌ ${(error as Error).message}\n`);
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
