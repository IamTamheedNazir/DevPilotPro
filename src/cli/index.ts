#!/usr/bin/env node

// SpecForge CLI - Main Entry Point
// A powerful spec-driven development tool that works with coding agents

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { SpecParser, createSampleSpec } from "./spec-parser.js";
import { ProjectGenerator } from "./project-generator.js";
import { GitHubIntegration, parseGitHubUrl } from "./github.js";
import { loadConfig, updateConfig } from "./config.js";
import { Framework, Language, Agent, ProjectConfig, GenerationOptions } from "./types.js";

const VERSION = "1.0.0";

const program = new Command();

program
  .name("specforge")
  .description("SpecForge - Turn specs into full projects with coding agents")
  .version(VERSION);

// ─── INIT ────────────────────────────────────────────────────────────────

program
  .command("init")
  .description("Create a new spec file with a template")
  .argument("[name]", "Spec name", "my-project")
  .option("-f, --format <format>", "Spec format (md|yaml)", "md")
  .action((name: string, options: { format: string }) => {
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
  .argument("<file>", "Path to spec file")
  .option("-f, --framework <framework>", "Framework (react|nextjs|vue|express|python|go)", "react")
  .option("-l, --language <language>", "Language (typescript|javascript|python|go)", "typescript")
  .option("-a, --agents <agents...>", "Coding agents to generate instructions for", ["claude-code"])
  .option("-o, --output <dir>", "Output directory", "./projects")
  .option("--github <repo>", "GitHub repo (owner/repo or URL) to push to after generation")
  .option("--private", "Make GitHub repo private", false)
  .option("--dry-run", "Show what would be generated without writing files", false)
  .option("-v, --verbose", "Verbose output", false)
  .action(
    (
      file: string,
      options: {
        framework: string;
        language: string;
        agents: string[];
        output: string;
        github?: string;
        private: boolean;
        dryRun: boolean;
        verbose: boolean;
      }
    ) => {
      try {
        const config = loadConfig();

        console.log("\n  🔧 SpecForge - Generating Project\n");

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
          framework: options.framework as Framework,
          language: options.language as Language,
          features: spec.sections.map((s) => s.title),
          agents: options.agents as Agent[],
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
  .description("View or update SpecForge configuration")
  .option("--list", "Show current configuration")
  .option("--framework <framework>", "Set default framework")
  .option("--language <language>", "Set default language")
  .option("--agents <agents...>", "Set default agents")
  .option("--output <dir>", "Set default output directory")
  .option("--github-token <token>", "Set GitHub personal access token")
  .action(
    (options: {
      list?: boolean;
      framework?: string;
      language?: string;
      agents?: string[];
      output?: string;
      githubToken?: string;
    }) => {
      if (options.list || (!options.framework && !options.language && !options.agents && !options.output && !options.githubToken)) {
        const config = loadConfig();
        console.log("\n  ⚙️  SpecForge Configuration\n");
        console.log(`    Framework:    ${config.defaultFramework}`);
        console.log(`    Language:     ${config.defaultLanguage}`);
        console.log(`    Agents:       ${config.defaultAgents.join(", ")}`);
        console.log(`    Output Dir:   ${config.outputDir}`);
        console.log(`    GitHub Token: ${config.githubToken ? "••••••••" + config.githubToken.slice(-4) : "Not set"}`);
        console.log("");
        return;
      }

      const updates: Record<string, unknown> = {};
      if (options.framework) updates.defaultFramework = options.framework;
      if (options.language) updates.defaultLanguage = options.language;
      if (options.agents) updates.defaultAgents = options.agents;
      if (options.output) updates.outputDir = options.output;
      if (options.githubToken) updates.githubToken = options.githubToken;

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
  .option("-m, --message <msg>", "Commit message", "Project from SpecForge")
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
          `Project from SpecForge`,
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

// Parse and execute
program.parse();
