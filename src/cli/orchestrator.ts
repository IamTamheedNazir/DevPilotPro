// SpecForge CLI - Agent Orchestrator
// Assigns tasks to agents and generates ordered execution prompts

import {
  Roadmap,
  Phase,
  MiniTask,
  TaskType,
  Agent,
  AgentPromptBundle,
  Framework,
  SpecFile,
} from "./types.js";

// ─── Agent Capability Matrix ────────────────────────────────────────────

const AGENT_STRENGTHS: Record<Agent, TaskType[]> = {
  "claude-code": [
    "scaffold",
    "schema",
    "api",
    "ui",
    "auth",
    "integration",
    "test",
    "docs",
    "config",
    "refactor",
  ],
  codex: ["scaffold", "api", "schema", "config", "test"],
  cursor: ["ui", "api", "refactor", "test", "schema"],
  windsurf: ["ui", "api", "refactor", "test"],
  copilot: ["scaffold", "api", "test", "config"],
  aider: ["refactor", "api", "test", "schema"],
};

// ─── Orchestrator ───────────────────────────────────────────────────────

export class AgentOrchestrator {
  private roadmap: Roadmap;
  private agents: Agent[];
  private framework: Framework;
  private spec: SpecFile;

  constructor(
    roadmap: Roadmap,
    agents: Agent[],
    framework: Framework,
    spec: SpecFile
  ) {
    this.roadmap = roadmap;
    this.agents = agents;
    this.framework = framework;
    this.spec = spec;
  }

  /**
   * Assign agents to all tasks based on capabilities and generate
   * ordered prompt bundles for execution.
   */
  orchestrate(): AgentPromptBundle[] {
    const bundles: AgentPromptBundle[] = [];

    // Assign agents to tasks
    for (const phase of this.roadmap.phases) {
      for (const task of phase.tasks) {
        task.assignedAgent = this.assignAgent(task);
      }
    }

    // Generate prompt bundles in execution order
    for (const phase of this.roadmap.phases) {
      // Sort tasks within phase: independent first, then by dependency chain
      const sorted = this.topologicalSort(phase.tasks);

      for (const task of sorted) {
        const agent = task.assignedAgent || this.agents[0];
        const context = this.buildContext(phase, task);
        const prompt = this.buildExecutionPrompt(phase, task, context);

        bundles.push({
          agent,
          taskId: task.id,
          phaseId: phase.id,
          prompt,
          context,
        });
      }
    }

    return bundles;
  }

  /**
   * Get the ordered execution plan as a readable string.
   */
  getExecutionPlan(bundles: AgentPromptBundle[]): string {
    const lines: string[] = [];
    lines.push("# SpecForge Execution Plan\n");
    lines.push(
      `Project: ${this.roadmap.specName}`
    );
    lines.push(
      `Complexity: ${this.roadmap.estimatedComplexity}`
    );
    lines.push(
      `Total tasks: ${this.roadmap.totalTasks}`
    );
    lines.push(`Phases: ${this.roadmap.phases.length}\n`);

    let currentPhase = "";
    let taskNum = 0;

    for (const bundle of bundles) {
      if (bundle.phaseId !== currentPhase) {
        currentPhase = bundle.phaseId;
        const phase = this.roadmap.phases.find((p) => p.id === currentPhase);
        if (phase) {
          lines.push(`\n## Phase ${phase.order + 1}: ${phase.name}`);
          lines.push(`${phase.description}\n`);

          // Show audit strategy
          lines.push(`**Audit checks:**`);
          for (const check of phase.auditStrategy.checklist) {
            const auto = check.automated ? " [auto]" : " [manual]";
            lines.push(`- ${check.description}${auto}`);
          }
          lines.push(
            `\n**Gate:** ${phase.gate.description}`
          );
          lines.push("");
        }
      }

      taskNum++;
      // Find the task from roadmap
      let foundTask: MiniTask | undefined;
      for (const p of this.roadmap.phases) {
        foundTask = p.tasks.find((t) => t.id === bundle.taskId);
        if (foundTask) break;
      }
      const taskTitle = foundTask?.title || bundle.taskId;
      const taskPriority = foundTask?.priority || "medium";
      const taskEffort = foundTask?.estimatedEffort || "medium";
      const taskDeps = foundTask?.dependencies || [];
      const status = foundTask?.status === "done" ? "✅" : "⬜";
      lines.push(
        `${status} Task ${taskNum}: ${taskTitle} [${taskEffort}]`
      );
      lines.push(
        `   Agent: ${bundle.agent} | Priority: ${taskPriority}`
      );
      if (taskDeps.length > 0) {
        lines.push(`   Depends on: ${taskDeps.join(", ")}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private assignAgent(task: MiniTask): Agent {
    // Find best agent for this task type
    let bestAgent = this.agents[0];
    let bestScore = -1;

    for (const agent of this.agents) {
      const strengths = AGENT_STRENGTHS[agent] || [];
      const score = strengths.includes(task.type) ? 10 : 0;

      // Bonus for primary agents
      if (agent === this.agents[0]) score + 1;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  private buildContext(phase: Phase, task: MiniTask): string {
    const deps = task.dependencies
      .map((depId) => {
        for (const p of this.roadmap.phases) {
          const dep = p.tasks.find((t) => t.id === depId);
          if (dep) return `- ${dep.title} (${dep.status})`;
        }
        return null;
      })
      .filter(Boolean);

    const frameworkLabel =
      this.framework === "nextjs"
        ? "Next.js"
        : this.framework.charAt(0).toUpperCase() + this.framework.slice(1);

    return [
      `Project: ${this.roadmap.specName}`,
      `Phase: ${phase.name} (Phase ${phase.order + 1}/${this.roadmap.phases.length})`,
      `Framework: ${frameworkLabel}`,
      `Task: ${task.title}`,
      `Type: ${task.type}`,
      `Priority: ${task.priority}`,
      `Effort: ${task.estimatedEffort}`,
      deps.length > 0 ? `Dependencies:\n${deps.join("\n")}` : "No dependencies",
      `Files to create/modify: ${task.files.join(", ")}`,
    ].join("\n");
  }

  private buildExecutionPrompt(
    phase: Phase,
    task: MiniTask,
    context: string
  ): string {
    const frameworkLabel =
      this.framework === "nextjs"
        ? "Next.js"
        : this.framework.charAt(0).toUpperCase() + this.framework.slice(1);

    // Build dependency context
    const depContext = task.dependencies
      .map((depId) => {
        for (const p of this.roadmap.phases) {
          const dep = p.tasks.find((t) => t.id === depId);
          if (dep) {
            return `### Completed: ${dep.title}\n${dep.description}\nFiles: ${dep.files.join(", ")}`;
          }
        }
        return null;
      })
      .filter(Boolean)
      .join("\n\n");

    return `# Execute Task: ${task.title}

## Context
${context}

${depContext ? `## Completed Dependencies\n${depContext}\n` : ""}## Your Task
${task.description}

## Implementation Requirements
1. Create/modify these files: ${task.files.join(", ")}
2. Follow ${frameworkLabel} conventions and patterns
3. Handle errors gracefully
4. Use proper TypeScript types
5. Write clean, self-documenting code

## Acceptance Criteria
${task.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")}

## Quality Checks
${task.auditChecks.map((c) => `- [ ] ${c}`).join("\n")}

## When Done
- Verify no TypeScript errors
- Verify code follows project conventions
- Update task status to "review"
`;
  }

  private topologicalSort(tasks: MiniTask[]): MiniTask[] {
    const sorted: MiniTask[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (task: MiniTask) => {
      if (visited.has(task.id)) return;
      if (visiting.has(task.id)) return; // cycle detection

      visiting.add(task.id);

      for (const depId of task.dependencies) {
        const dep = tasks.find((t) => t.id === depId);
        if (dep) visit(dep);
      }

      visiting.delete(task.id);
      visited.add(task.id);
      sorted.push(task);
    };

    for (const task of tasks) {
      visit(task);
    }

    return sorted;
  }
}
