# DevPilot

**The vibe coding copilot. Divide work, assign agents, ship properly.**

Vibe coding is exploding. You describe what you want, agents build it, you ship fast. But there's a problem nobody's talking about:

> **You're giving one task to Claude Code, another to Codex, another to Cursor — and nothing connects.**

DevPilot fixes this. It divides your project into ordered tasks, assigns them to the right agents, and makes sure everything works together.

---

## The Problem Vibe Coders Face

### Scenario 1: Random Agent Chaos
```
You: "Build me a chat app"

Claude Code: *builds the UI*
Codex: *builds the API*
Cursor: *builds the database*

Result: 3 separate projects that don't connect
```

### Scenario 2: Wrong Order
```
You: "Add authentication"

Agent: *builds login page first*
Agent: *then tries to build auth API*
Agent: *realizes there's no user model*

Result: Broken code, wasted tokens, frustrated you
```

### Scenario 3: No Quality Checks
```
You: "Ship it"

Agent: *builds everything*
You: *deploy*
Users: *find 50 bugs*

Result: Broken product, bad reputation
```

### Scenario 4: Fragmented Workflow
```
Monday: Give task 1 to Claude Code
Tuesday: Give task 2 to Codex
Wednesday: Give task 3 to Cursor
Thursday: Realize tasks 1 and 2 conflict
Friday: Start over
```

**The core problem:** You're the project manager, but you don't have the tools to manage.

---

## How DevPilot Solves This

### 1. Divide Work Automatically

You describe your project once. DevPilot breaks it into ordered tasks:

```bash
devpilot create "A real-time chat app with rooms, reactions, file sharing"
```

**What DevPilot generates:**
```
Phase 1: Scaffold        (2 tasks)
Phase 2: Schema          (4 tasks)
Phase 3: Auth            (3 tasks)
Phase 4: API             (5 tasks)
Phase 5: UI              (4 tasks)
Phase 6: Tests           (2 tasks)
Phase 7: Docs            (1 task)

Total: 21 tasks with dependencies and priorities
```

### 2. Assign Agents to the Right Tasks

DevPilot knows which agent is best for each job:

```
Task: "Initialize React project"
  → Assigned to: Claude Code (best at scaffolding)

Task: "Create user database model"
  → Assigned to: Codex (best at schema)

Task: "Build login page UI"
  → Assigned to: Cursor (best at UI)

Task: "Refactor API routes"
  → Assigned to: Aider (best at refactoring)
```

### 3. Ensure Correct Order

Tasks are ordered by dependencies:

```
Task 1: Create user model (no deps)
  ↓
Task 2: Create auth API (depends on Task 1)
  ↓
Task 3: Build login page (depends on Task 2)
  ↓
Task 4: Add protected routes (depends on Task 2 and 3)
```

**Agents never build something before its dependencies are ready.**

### 4. Quality at Every Step

Each phase has a **gate** — checks that must pass before moving on:

```
Phase 1 Gate:
  ✅ TypeScript compiles
  ✅ Dev server starts

Phase 3 Gate (Auth):
  🔒 No hardcoded secrets
  🔒 Input validation present
  🔒 Token validation works

Phase 5 Gate (UI):
  ♿ ARIA labels present
  📱 Responsive on mobile
  ⚡ No unnecessary re-renders
```

---

## The Vibe Coder Workflow

### Before DevPilot
```
You → Agent → Broken code → Debug → Fix → Debug → Fix → Give up
```

### With DevPilot
```
You → DevPilot → Roadmap → Tasks → Agent → Working code → Ship
```

---

## Quick Start

### Install

```bash
npm install -g devpilot
```

Works on **Windows**, **Mac**, and **Linux**. No compilation needed.

### One-Command Magic

```bash
# Describe your project, DevPilot does the rest
devpilot quick
```

### Step by Step

```bash
# 1. Create a spec from natural language
devpilot create "A task management app with drag-and-drop"

# 2. Generate a roadmap with ordered tasks
devpilot roadmap my-task-app.spec.md --framework react

# 3. Orchestrate everything: scaffold + tasks + agent prompts
devpilot orchestrate my-task-app.spec.md --framework react --agents claude-code codex cursor

# 4. Hand off to your coding agent
cd projects/my-task-app
# Claude Code reads .claude/CLAUDE.md and knows exactly what to build
```

---

## Commands

| Command | What it does |
|---------|-------------|
| `devpilot quick` | Full wizard: describe → plan → build |
| `devpilot create <prompt>` | Generate spec from natural language |
| `devpilot init` | Create spec template |
| `devpilot validate` | Check spec is complete |
| `devpilot roadmap` | Generate phased roadmap with dependencies |
| `devpilot orchestrate` | Full pipeline: spec → tasks → agent prompts |
| `devpilot generate` | Scaffold project with framework files |
| `devpilot agents` | List supported coding agents |
| `devpilot push` | Push to GitHub |

---

## Multi-Agent Orchestration

### The Problem
```
You: Give task to Claude Code
You: Give different task to Codex
You: Give another task to Cursor
Result: 3 disconnected codebases
```

### The DevPilot Solution
```
DevPilot: "Here's the plan. Task 1 goes to Claude Code. Task 2 goes to Codex.
           Task 3 goes to Cursor. Each agent gets full context."
Result: One cohesive project built by the right agents
```

### How Agent Assignment Works

| Agent | Best For | Why |
|-------|----------|-----|
| **Claude Code** | Full-stack, complex features | Understands entire codebase |
| **Codex** | Scaffolding, schema, config | Fast at generating boilerplate |
| **Cursor** | UI, refactoring, tests | Great at visual components |
| **Windsurf** | UI, API integration | Good at connecting pieces |
| **Copilot** | Scaffolding, API routes | Quick code generation |
| **Aider** | Refactoring, debugging | Excellent at fixing code |

### Each Agent Gets
- **Full context** — phase, framework, type, priority, effort
- **Dependencies** — what's already built
- **Files to create** — exactly which files to modify
- **Acceptance criteria** — checklist for completion
- **Quality checks** — automated + manual

---

## Roadmap Engine

DevPilot automatically decomposes your project into phases:

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

---

## Task Decomposition

### Without DevPilot
```
"Build a chat app" → Agent builds random files in random order
```

### With DevPilot
```
"Build a chat app" → 21 atomic tasks with dependencies:

⬜ Task 1: Initialize React project [small] — critical
   ⬜ Task 2: Configure tooling [tiny] — depends on Task 1
   ⬜ Task 3: Create user model [tiny] — high
   ⬜ Task 4: Create auth endpoints [small] — depends on Task 3
   ⬜ Task 5: Build login page [medium] — depends on Task 4
   ...
```

---

## Audit Strategy

Every phase has quality checks:

| Category | Automated | Manual |
|----------|-----------|--------|
| **Code Quality** | `npm run lint`, `tsc --noEmit` | Code review |
| **Security** | — | No hardcoded secrets, input validation |
| **Accessibility** | — | ARIA labels, responsive layout |
| **Performance** | — | No N+1 queries, no unnecessary re-renders |
| **Testing** | `npm test`, coverage report | Test completeness |

---

## Framework Support

| Framework | Language | Best For |
|-----------|----------|----------|
| React (Vite) | TypeScript | SPAs, dashboards |
| Next.js | TypeScript | Full-stack apps |
| Vue 3 | TypeScript | Reactive UIs |
| SvelteKit | TypeScript | Lightweight apps |
| Express | TypeScript | REST APIs |
| Fastify | TypeScript | High-perf APIs |
| Django | Python | Full-stack apps |
| Flask | Python | Lightweight APIs |
| Go | Go | Microservices |
| Rust | Rust | Systems programming |
| Vanilla | JS/HTML | Simple sites |

---

## AI-Powered Spec Generation

```bash
# Offline (no API key) — generates structured spec
devpilot create "A social network for developers with profiles, repos, and follows"

# AI-powered (needs OpenAI key) — generates detailed spec
devpilot create "A social network for developers" --ai
```

---

## GitHub Integration

```bash
# Set your token
devpilot config --github-token ghp_xxx

# Generate and push in one command
devpilot orchestrate my-spec.md --github myuser/myrepo --private
```

---

## Configuration

```bash
devpilot config --list                    # View settings
devpilot config --framework nextjs        # Set default framework
devpilot config --agents claude-code codex  # Set default agents
devpilot config --github-token ghp_xxx   # Set GitHub token
devpilot config --openai-key sk-xxx      # Set OpenAI key
```

---

## Comparison

| Feature | Manual Vibe Coding | **DevPilot** |
|---------|-------------------|-------------|
| Work division | ❌ You figure it out | ✅ Automatic task decomposition |
| Agent assignment | ❌ Random | ✅ Best agent for each job |
| Task ordering | ❌ Wrong order | ✅ Dependency-aware |
| Quality checks | ❌ Hope it works | ✅ Gates at every phase |
| Multi-agent coordination | ❌ Fragmented | ✅ Unified pipeline |
| Effort estimation | ❌ No idea | ✅ tiny/small/medium/large |
| Reusability | ❌ Start over each time | ✅ Config persistence |

---

## Why This Matters

Vibe coding is the future of software development. But without structure, it's chaos.

**DevPilot brings the structure.** It takes your natural language idea and turns it into an ordered plan with quality checks, so your coding agents build the right thing in the right order.

It's not just a spec tool — it's a **workflow engine** for vibe coders.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

## Built By

DevPilot was built by an AI coding agent (Claude) as a demonstration of what's possible when AI understands the full lifecycle of software development — from idea to working product.

## License

MIT
