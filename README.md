# SpecForge

**Turn specs into full projects with coding agents.**

SpecForge is a powerful CLI tool that takes your project specification and generates a complete, production-ready project scaffold — then hands it off to your favorite coding agent (Claude Code, Codex, Cursor, Windsurf, Copilot, Aider) to build the actual code.

More powerful than [spec-kit](https://github.com/github/spec-kit). One command to go from spec → project → code.

## Why SpecForge?

| Feature | spec-kit | SpecForge |
|---------|----------|-----------|
| Spec format | Markdown only | Markdown + YAML |
| Multi-agent support | None | Claude Code, Codex, Cursor, Windsurf, Copilot, Aider |
| GitHub integration | Manual | Auto-create repo + push |
| Framework scaffolding | Basic | React, Next.js, Vue, Express, Python, Go |
| Agent instructions | None | Auto-generated per agent |
| Spec validation | None | Full validation with warnings |
| Config persistence | None | Saves your defaults |

## Quick Start

### Install

```bash
# Install globally
npm install -g specforge

# Or use without installing
npx specforge
```

### Create a Spec

```bash
specforge init my-project
```

This creates a `my-project.spec.md` file with a template. Edit it with your project details.

### Generate a Project

```bash
specforge generate my-project.spec.md --framework react --agents claude-code codex
```

This generates a complete project scaffold and hands it off to your coding agents.

### Open with Your Coding Agent

```bash
cd projects/my-project
# Claude Code reads .claude/CLAUDE.md automatically
# Codex reads CODEX.md automatically
# Cursor reads .cursor/rules automatically
```

## Commands

### `specforge init [name]`

Create a new spec file from a template.

```bash
specforge init my-app                    # Creates my-app.spec.md
specforge init my-app --format yaml      # Creates my-app.spec.yaml
```

### `specforge validate <file>`

Validate a spec file for completeness and correctness.

```bash
specforge validate my-app.spec.md
```

### `specforge generate <file> [options]`

Generate a project from a spec file.

```bash
# Basic generation
specforge generate my-app.spec.md

# With specific framework and agents
specforge generate my-app.spec.md \
  --framework nextjs \
  --language typescript \
  --agents claude-code codex cursor

# Dry run (preview without writing)
specforge generate my-app.spec.md --dry-run

# With GitHub integration
specforge generate my-app.spec.md \
  --github myuser/myrepo \
  --private

# Verbose output
specforge generate my-app.spec.md --verbose
```

**Options:**
- `-f, --framework <name>` — Framework: react, nextjs, vue, express, python, go (default: react)
- `-l, --language <name>` — Language: typescript, javascript, python, go (default: typescript)
- `-a, --agents <names...>` — Coding agents: claude-code, codex, cursor, windsurf, copilot, aider
- `-o, --output <dir>` — Output directory (default: ./projects)
- `--github <repo>` — GitHub repo (owner/repo) to push to
- `--private` — Make GitHub repo private
- `--dry-run` — Preview without writing files
- `-v, --verbose` — Show detailed output

### `specforge agents`

List all supported coding agents and their config files.

```bash
specforge agents
```

### `specforge push <dir> <repo>`

Push an existing project to GitHub.

```bash
specforge push ./my-project myuser/myrepo
specforge push ./my-project https://github.com/myuser/myrepo --private
```

### `specforge config`

View or update SpecForge configuration.

```bash
specforge config --list                    # Show current config
specforge config --framework nextjs        # Set default framework
specforge config --agents claude-code codex  # Set default agents
specforge config --github-token ghp_xxx   # Set GitHub token
```

### `specforge parse <file>`

Parse and display a spec file's structure.

```bash
specforge parse my-app.spec.md           # Human-readable output
specforge parse my-app.spec.md --json    # JSON output
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

SpecForge generates agent-specific instruction files so your coding agent knows exactly what to build:

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

SpecForge can create GitHub repos and push your generated project:

```bash
# Set your GitHub token
specforge config --github-token ghp_your_token_here

# Generate and push in one command
specforge generate my-app.spec.md --github myuser/myrepo

# Or push later
specforge push ./projects/my-app myuser/myrepo
```

## Development

```bash
git clone https://github.com/yourusername/specforge.git
cd specforge
npm install
npm run dev -- init my-test
```

## License

MIT
