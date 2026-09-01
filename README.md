# DevPilot

**Turn specs into full projects with coding agents.**

DevPilot is a powerful CLI tool that takes your project specification and generates a complete, production-ready project scaffold — then hands it off to your favorite coding agent (Claude Code, Codex, Cursor, Windsurf, Copilot, Aider) to build the actual code.

More powerful than [spec-kit](https://github.com/github/spec-kit). One command to go from spec → project → code.

## Why DevPilot?

| Feature | spec-kit | DevPilot |
|---------|----------|-----------|
| Spec format | Markdown only | Markdown + YAML |
| AI spec generation | None | Generate specs from natural language |
| Interactive mode | None | Guided prompts for everything |
| Multi-agent support | None | Claude Code, Codex, Cursor, Windsurf, Copilot, Aider |
| GitHub integration | Manual | Auto-create repo + push |
| Framework scaffolding | Basic | React, Next.js, Vue, Svelte, Express, Fastify, Django, Flask, Go, Rust |
| Agent instructions | None | Auto-generated per agent |
| Spec validation | None | Full validation with warnings |
| Config persistence | None | Saves your defaults |

## Quick Start

### Install

```bash
# Install globally
npm install -g devpilot

# Or use without installing
npx devpilot
```

### Quick Start (Interactive Wizard)

```bash
devpilot quick
```

Describe your project in plain English → get an AI-generated spec → generate the project. All in one interactive session.

### Create a Spec from a Prompt

```bash
# Offline mode (no API key needed)
devpilot create "A task management app with real-time collaboration"

# AI-powered mode (needs OPENAI_API_KEY)
devpilot create "A social network for developers" --ai
```

### Or Create a Template Spec

```bash
devpilot init my-project
```

This creates a `my-project.spec.md` file with a template. Edit it with your project details.

### Generate a Project

```bash
# Non-interactive
devpilot generate my-project.spec.md --framework react --agents claude-code codex

# Interactive mode (prompts for framework, agents, etc.)
devpilot generate my-project.spec.md --interactive

# Or just run generate in a directory with spec files
devpilot generate
```

### Open with Your Coding Agent

```bash
cd projects/my-project
# Claude Code reads .claude/CLAUDE.md automatically
# Codex reads CODEX.md automatically
# Cursor reads .cursor/rules automatically
```

## Commands

### `devpilot quick`

Interactive wizard: describe project → AI generates spec → generate project.

```bash
devpilot quick
```

### `devpilot create [prompt]`

Generate a spec from a natural language description.

```bash
# Offline (no API key)
devpilot create "A task management app with drag-and-drop"

# AI-powered (needs OPENAI_API_KEY or devpilot config --openai-key)
devpilot create "A social network for developers" --ai
```

### `devpilot init [name]`

Create a new spec file from a template.

```bash
devpilot init my-app                    # Creates my-app.spec.md
devpilot init my-app --format yaml      # Creates my-app.spec.yaml
devpilot init my-app --interactive      # Guided spec creation
```

### `devpilot validate <file>`

Validate a spec file for completeness and correctness.

```bash
devpilot validate my-app.spec.md
```

### `devpilot generate <file> [options]`

Generate a project from a spec file.

```bash
# Basic generation
devpilot generate my-app.spec.md

# Interactive mode (prompts for framework, agents, etc.)
devpilot generate my-app.spec.md --interactive

# With specific framework and agents
devpilot generate my-app.spec.md \
  --framework nextjs \
  --language typescript \
  --agents claude-code codex cursor

# Dry run (preview without writing)
devpilot generate my-app.spec.md --dry-run

# With GitHub integration
devpilot generate my-app.spec.md \
  --github myuser/myrepo \
  --private

# Verbose output
devpilot generate my-app.spec.md --verbose
```

**Options:**
- `-f, --framework <name>` — Framework: react, nextjs, vue, svelte, express, fastify, django, flask, python, go, rust (default: react)
- `-l, --language <name>` — Language: typescript, javascript, python, go, rust (default: typescript)
- `-a, --agents <names...>` — Coding agents: claude-code, codex, cursor, windsurf, copilot, aider
- `-o, --output <dir>` — Output directory (default: ./projects)
- `-i, --interactive` — Use interactive prompts
- `--github <repo>` — GitHub repo (owner/repo) to push to
- `--private` — Make GitHub repo private
- `--dry-run` — Preview without writing files
- `-v, --verbose` — Show detailed output

### `devpilot agents`

List all supported coding agents and their config files.

```bash
devpilot agents
```

### `devpilot push <dir> <repo>`

Push an existing project to GitHub.

```bash
devpilot push ./my-project myuser/myrepo
devpilot push ./my-project https://github.com/myuser/myrepo --private
```

### `devpilot config`

View or update DevPilot configuration.

```bash
devpilot config --list                    # Show current config
devpilot config --framework nextjs        # Set default framework
devpilot config --agents claude-code codex  # Set default agents
devpilot config --github-token ghp_xxx   # Set GitHub token
```

### `devpilot parse <file>`

Parse and display a spec file's structure.

```bash
devpilot parse my-app.spec.md           # Human-readable output
devpilot parse my-app.spec.md --json    # JSON output
```

## Spec Format

### Markdown (recommended)

```markdown
---
name: my-app
description: A task management app
version: 1.0.0
author: Your Name
tags: [web, productivity]
---

# My App

A modern task management application.

## Features

### Core Features
- User authentication
- Task CRUD operations
- Drag-and-drop organization

### Advanced Features
- Real-time collaboration
- AI-powered suggestions
- Calendar integration

## Architecture

### Frontend
- React 18 with TypeScript
- Tailwind CSS
- Zustand state management

### Backend
- Node.js with Express
- PostgreSQL database
- Redis caching

## Requirements

- Node.js 18+
- PostgreSQL 14+
- Modern browser

## Constraints

- Must work offline
- <200ms response time
- WCAG 2.1 AA accessible
- GDPR compliant
```

### YAML

```yaml
name: my-app
description: A task management app
version: 1.0.0
author: Your Name
tags:
  - web
  - productivity

sections:
  - id: features
    title: Features
    content: |
      Core features include authentication, task CRUD, and drag-and-drop.
    subsections:
      - id: core
        title: Core Features
        content: User auth, task management
      - id: advanced
        title: Advanced Features
        content: Real-time collab, AI suggestions

requirements:
  - Node.js 18+
  - PostgreSQL 14+

constraints:
  - Must work offline
  - <200ms response time
```

## Coding Agent Integration

DevPilot generates agent-specific instruction files so your coding agent knows exactly what to build:

| Agent | Config File | How it Works |
|-------|------------|--------------|
| **Claude Code** | `.claude/CLAUDE.md` | Auto-read when you open the project |
| **OpenAI Codex** | `CODEX.md` | Auto-read when you run `codex` |
| **Cursor** | `.cursor/rules` | Auto-read in Cursor IDE |
| **Windsurf** | `.windsurfrules` | Auto-read in Windsurf IDE |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Auto-read in VS Code |
| **Aider** | `.aider.conf.yml` | Auto-read when you run `aider` |

Each agent gets the full spec context, feature breakdown, requirements, constraints, and step-by-step implementation instructions.

## GitHub Integration

DevPilot can create GitHub repos and push your generated project:

```bash
# Set your GitHub token
devpilot config --github-token ghp_your_token_here

# Generate and push in one command
devpilot generate my-app.spec.md --github myuser/myrepo

# Or push later
devpilot push ./projects/my-app myuser/myrepo
```

## Development

```bash
git clone https://github.com/yourusername/devpilot.git
cd devpilot
npm install
npm run dev -- init my-test
```

## License

MIT
