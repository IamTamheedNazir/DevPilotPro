# Contributing to DevPilot

Thanks for your interest in contributing to DevPilot! This guide will help you get started.

## What is DevPilot?

DevPilot is a CLI tool that helps vibe coders build projects properly. It takes natural language ideas and turns them into roadmaps, tasks, and agent prompts for coding agents like Claude Code, Codex, Cursor, Windsurf, Copilot, and Aider.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/yourusername/devpilot.git
cd devpilot

# Install dependencies
npm install

# Run the CLI
npx tsx src/cli/index.ts --help

# Test a command
npx tsx src/cli/index.ts init test-project
npx tsx src/cli/index.ts validate test-project.spec.md
npx tsx src/cli/index.ts roadmap test-project.spec.md
```

## Project Structure

```
devpilot/
├── bin/
│   └── devpilot.js          # CLI entry point (bootstraps tsx)
├── src/cli/
│   ├── index.ts             # Main CLI with all commands
│   ├── types.ts             # All TypeScript type definitions
│   ├── spec-parser.ts       # Markdown/YAML spec parser
│   ├── roadmap.ts           # Roadmap engine + task decomposition
│   ├── orchestrator.ts      # Agent assignment + prompt generation
│   ├── project-generator.ts # Framework scaffolding (11 frameworks)
│   ├── ai-generator.ts      # AI-powered spec generation
│   ├── interactive.ts       # Interactive prompts (inquirer)
│   ├── github.ts            # GitHub API integration
│   └── config.ts            # Config management (~/.devpilot.json)
├── package.json
├── tsconfig.json
└── README.md
```

## How It Works

### The Pipeline

```
User Input → Spec Parser → Roadmap Generator → Task Decomposer → Orchestrator → Agent Prompts
```

1. **Spec Parser** (`spec-parser.ts`) — Reads markdown/YAML spec files, extracts metadata, sections, requirements, constraints
2. **Roadmap Generator** (`roadmap.ts`) — Decomposes spec into ordered phases (scaffold → schema → auth → api → ui → tests → docs)
3. **Task Decomposer** — Breaks phases into atomic mini-tasks with dependencies, priorities, effort estimates
4. **Orchestrator** (`orchestrator.ts`) — Assigns tasks to agents based on their strengths, generates context-rich prompts
5. **Project Generator** (`project-generator.ts`) — Scaffolds framework-specific files (React, Next.js, Django, etc.)

### Key Concepts

- **Phase**: A group of related tasks (e.g., "Authentication", "API Layer")
- **MiniTask**: An atomic unit of work with dependencies, priority, and effort estimate
- **Audit Strategy**: Quality checks (automated + manual) for each phase
- **Phase Gate**: Quality bar that must be met before proceeding to the next phase
- **Agent Prompt Bundle**: A complete prompt for a coding agent with context, requirements, and acceptance criteria

## Adding a New Framework

1. Add the framework to the `Framework` type in `types.ts`:
   ```typescript
   export type Framework =
     | "react"
     | "nextjs"
     // ... existing frameworks
     | "your-framework";
   ```

2. Add a generator method in `project-generator.ts`:
   ```typescript
   private generateYourFrameworkFiles(): GeneratedFile[] {
     return [
       {
         path: "package.json",
         content: JSON.stringify({ /* ... */ }, null, 2),
         description: "Project dependencies",
       },
       // ... more files
     ];
   }
   ```

3. Add the case to `generateFrameworkFiles()`:
   ```typescript
   case "your-framework":
     files.push(...this.generateYourFrameworkFiles());
     break;
   ```

4. Update the framework choices in `interactive.ts`:
   ```typescript
   const FRAMEWORK_CHOICES = [
     // ... existing choices
     { name: "Your Framework", value: "your-framework" },
   ];
   ```

5. Update the README with the new framework.

## Adding a New Agent

1. Add the agent to the `Agent` type in `types.ts`:
   ```typescript
   export type Agent =
     | "claude-code"
     // ... existing agents
     | "your-agent";
   ```

2. Add the agent's config file in `project-generator.ts`:
   ```typescript
   private getAgentConfigFile(agent: Agent): GeneratedFile {
     const configs: Record<Agent, GeneratedFile> = {
       // ... existing agents
       "your-agent": {
         path: ".your-agent/config.md",
         content: `# ${this.config.name}\n\n## Project Overview\n${this.config.description}\n\n`,
         description: "Your Agent instructions",
       },
     };
     return configs[agent];
   }
   ```

3. Add the agent's strengths in `orchestrator.ts`:
   ```typescript
   const AGENT_STRENGTHS: Record<Agent, TaskType[]> = {
     // ... existing agents
     "your-agent": ["scaffold", "api", "test"],
   };
   ```

4. Add the agent to the choices in `interactive.ts`.

5. Add instructions to the `printSuccess` function in `index.ts`.

## Adding a New Command

1. Add the command in `index.ts`:
   ```typescript
   program
     .command("your-command")
     .description("What it does")
     .argument("<file>", "Path to file")
     .option("-f, --flag", "Description")
     .action((file: string, options: { flag: boolean }) => {
       // Your logic here
     });
   ```

2. Update the help text if needed.

3. Test with `npx tsx src/cli/index.ts your-command --help`.

## Code Style

- **TypeScript strict mode** — No `any` types unless absolutely necessary
- **ESM modules** — Use `import`/`export`, not `require`
- **Descriptive names** — Variables and functions should be self-documenting
- **Error handling** — Always catch errors and provide helpful messages
- **No external UI** — This is a CLI tool, keep it terminal-friendly

## Testing

```bash
# Type check
npx tsc -b --noEmit

# Test a command
npx tsx src/cli/index.ts init test-project
npx tsx src/cli/index.ts validate test-project.spec.md
npx tsx src/cli/index.ts roadmap test-project.spec.md --framework react
npx tsx src/cli/index.ts orchestrate test-project.spec.md --framework react --agents claude-code
```

## Pull Request Process

1. **Fork** the repo and create a branch from `main`
2. **Make your changes** — Follow the code style above
3. **Type check** — Run `npx tsc -b --noEmit` and fix any errors
4. **Test** — Run the commands you changed to make sure they work
5. **Update docs** — If you added a feature, update the README
6. **Submit PR** — Describe what you changed and why

### PR Title Format

```
feat: add SvelteKit framework support
fix: handle empty spec files gracefully
docs: update README with new commands
refactor: extract audit strategy into separate module
```

## Reporting Issues

When reporting a bug, please include:
- What you were trying to do
- What command you ran
- What happened (error message, unexpected behavior)
- What you expected to happen
- Your OS and Node.js version

## Feature Requests

We welcome feature requests! Please open an issue with:
- What you want to achieve
- Why it would be useful for vibe coders
- How you envision it working

## Questions?

Open a discussion on GitHub or reach out on Twitter.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
