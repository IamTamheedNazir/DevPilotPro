# DevPilot

**The vibe coding copilot. Describe what you want → get a plan → build it right.**

You're a vibe coder. You describe projects in natural language, hand them to coding agents, and ship fast. But there's a gap: agents don't understand the **order** of things, the **dependencies**, or the **quality checks** needed to build a real product.

DevPilot fills that gap.

## The Problem

Vibe coding is powerful, but:
- You describe a project and the agent builds random files in random order
- There's no roadmap — no idea what to build first, what depends on what
- No audit strategy — no way to know if the code is actually good
- Agents don't know the full context — they build pieces without understanding the whole

## The Solution

DevPilot takes your natural language idea and turns it into:

```
Your Idea → Spec → Roadmap → Mini-Tasks → Audit Strategy → Agent Prompts
```

Then your coding agents build it in the right order, with the right context, and quality checks at every step.

## How It Works

### 1. You describe your project
```bash
devpilot create "A real-time chat app with rooms, reactions, file sharing"
```

### 2. DevPilot generates a spec and roadmap
```
📋 16 tasks across 6 phases
🏗️ Scaffold → Schema → Auth → API → UI → Tests
🔍 Audit strategy with automated + manual checks
🤖 Agent prompts with full context and acceptance criteria
```

### 3. Hand off to your coding agent
```bash
cd projects/my-chat-app
# Claude Code reads .claude/CLAUDE.md and knows exactly what to build
# Codex reads CODEX.md and follows the execution plan
# Cursor reads .cursor/rules and builds components in order
```

### 4. Quality at every step
Each phase has a **gate** — automated checks (lint, types) and manual checks (security, a11y) that must pass before moving to the next phase.

## Install

Works on **Windows**, **Mac**, and **Linux**.

```bash
# Install globally
npm install -g devpilot

# Or use without installing
npx devpilot
```

No compilation needed. It's a Node.js CLI that runs anywhere Node.js runs.

## Quick Start

```bash
# One command: describe → plan → build
devpilot quick

# Or step by step:
devpilot create "Your project idea here"
devpilot roadmap my-project.spec.md
devpilot orchestrate my-project.spec.md --framework react --agents claude-code
```

## Commands

| Command | What it does |
|---------|-------------|
| `devpilot quick` | Full interactive wizard — describe it, plan it, build it |
| `devpilot create <prompt>` | Generate a spec from natural language |
| `devpilot init` | Create a spec template to fill in |
| `devpilot validate` | Check your spec is complete |
| `devpilot roadmap` | Generate a phased roadmap with dependencies |
| `devpilot orchestrate` | Full pipeline: spec → roadmap → tasks → agent prompts |
| `devpilot generate` | Scaffold the project with framework files |
| `devpilot agents` | List supported coding agents |
| `devpilot push` | Push to GitHub |

## What Makes This Different

### Without DevPilot
```
You: "Build me a chat app"
Agent: *creates 50 files in random order, no tests, no structure*
Result: Broken code that doesn't work together
```

### With DevPilot
```
You: "Build me a chat app"
DevPilot: "Here's the roadmap, 16 tasks in 6 phases with audit checks"
Agent: *builds scaffold, then schema, then auth, then API, then UI, then tests*
Result: Working product with quality at every step
```

## Roadmap Engine

DevPilot automatically decomposes your spec into phases:

```
Phase 1: Project Scaffolding     → Project compiles, dev server starts
Phase 2: Data Layer & Schema     → Models defined, migrations run
Phase 3: Authentication          → Login works, protected routes work
Phase 4: API Layer               → Endpoints respond correctly
Phase 5: UI & Frontend           → Pages render, responsive layout
Phase 6: Testing & Quality       → All tests pass, coverage > 70%
Phase 7: Documentation           → README complete, build succeeds
```

Each phase has:
- **Tasks** with dependencies (what must be done first)
- **Effort estimates** (tiny, small, medium, large)
- **Priority levels** (critical, high, medium, low)
- **Audit checks** (automated: lint, types; manual: security, a11y)
- **Phase gates** (quality bar that must be met before proceeding)

## Agent Orchestration

DevPilot assigns tasks to agents based on their strengths:

| Agent | Best For |
|-------|----------|
| **Claude Code** | Full-stack, all task types |
| **Codex** | Scaffolding, schema, API, config |
| **Cursor** | UI, refactoring, tests |
| **Windsurf** | UI, API, refactoring |
| **Copilot** | Scaffolding, API, tests |
| **Aider** | Refactoring, API, tests |

Each agent gets a prompt with:
- Full project context (phase, framework, type, priority)
- Dependencies (what's already built)
- Files to create/modify
- Acceptance criteria (checklist)
- Quality checks (automated + manual)

## Framework Support

DevPilot scaffolds projects for any major framework:

| Framework | Language | Scaffolding |
|-----------|----------|-------------|
| React (Vite) | TypeScript | package.json, tsconfig, index.html |
| Next.js | TypeScript | App Router, package.json |
| Vue 3 | TypeScript | Vite, package.json |
| SvelteKit | TypeScript | SvelteKit config, routes |
| Express | TypeScript | Server, routes |
| Fastify | TypeScript | Server, routes |
| Django | Python | settings, manage.py, urls |
| Flask | Python | app.py, routes |
| Go | Go | go.mod, main.go |
| Rust | Rust | Cargo.toml, main.rs |
| Vanilla | JS/HTML | index.html |

## AI-Powered Spec Generation

```bash
# Offline (no API key needed) — generates a structured spec from your description
devpilot create "A social network for developers with profiles, repos, and follows"

# AI-powered (needs OpenAI API key) — generates a detailed spec with AI
devpilot create "A social network for developers" --ai
```

## GitHub Integration

```bash
# Set your token
devpilot config --github-token ghp_xxx

# Generate and push in one command
devpilot orchestrate my-spec.md --github myuser/myrepo --private
```

## Configuration

```bash
devpilot config --list                    # View all settings
devpilot config --framework nextjs        # Set default framework
devpilot config --agents claude-code codex  # Set default agents
devpilot config --github-token ghp_xxx   # Set GitHub token
devpilot config --openai-key sk-xxx      # Set OpenAI key for AI specs
```

## Development

```bash
git clone https://github.com/yourusername/devpilot.git
cd devpilot
npm install
npx tsx src/cli/index.ts --help
```

## License

MIT
