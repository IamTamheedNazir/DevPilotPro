// SpecForge CLI - Roadmap Engine
// Decomposes specs into phased roadmaps with ordered mini-tasks

import {
  SpecFile,
  Roadmap,
  Phase,
  MiniTask,
  TaskType,
  AuditStrategy,
  AuditCheck,
  TestPlan,
  PhaseGate,
  Framework,
  Agent,
} from "./types.js";

// ─── Task Type Detection ────────────────────────────────────────────────

const TASK_PATTERNS: Record<TaskType, RegExp[]> = {
  scaffold: [/scaffold|setup|project structure|init|boilerplate/i],
  schema: [/schema|database|model|entity|migration/i],
  api: [/api|endpoint|route|rest|graphql|controller/i],
  ui: [/ui|interface|component|page|layout|design|frontend|view/i],
  auth: [/auth|login|signup|session|token|permission|role/i],
  integration: [/integrat|webhook|external|third-party|sdk/i],
  test: [/test|spec|coverage|assert/i],
  docs: [/doc|readme|comment|guide|tutorial/i],
  config: [/config|env|setting|environment/i],
  deploy: [/deploy|ci|cd|docker|build|release/i],
  refactor: [/refactor|optimize|clean|improve|restructur/i],
};

function detectTaskType(text: string): TaskType {
  for (const [type, patterns] of Object.entries(TASK_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) return type as TaskType;
  }
  return "scaffold";
}

function detectPriority(
  text: string,
  sectionTitle: string
): MiniTask["priority"] {
  const combined = `${sectionTitle} ${text}`.toLowerCase();
  if (/critical|must|required|essential|core|auth|security/i.test(combined))
    return "critical";
  if (/important|should|needed|primary/i.test(combined)) return "high";
  if (/nice|optional|secondary|advanced/i.test(combined)) return "medium";
  return "low";
}

function estimateEffort(text: string): MiniTask["estimatedEffort"] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length <= 2) return "tiny";
  if (lines.length <= 5) return "small";
  if (lines.length <= 12) return "medium";
  return "large";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Roadmap Generator ─────────────────────────────────────────────────

export class RoadmapGenerator {
  private spec: SpecFile;
  private framework: Framework;
  private agents: Agent[];

  constructor(spec: SpecFile, framework: Framework, agents: Agent[]) {
    this.spec = spec;
    this.framework = framework;
    this.agents = agents;
  }

  generate(): Roadmap {
    const phases = this.buildPhases();
    const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);

    return {
      specName: this.spec.metadata.name,
      phases,
      totalTasks,
      estimatedComplexity: this.assessComplexity(totalTasks, phases),
      createdAt: new Date().toISOString(),
    };
  }

  private buildPhases(): Phase[] {
    const phases: Phase[] = [];
    let globalTaskIndex = 0;

    // Phase 1: Project Scaffolding (always first)
    const scaffoldTasks = this.buildScaffoldPhase(globalTaskIndex);
    globalTaskIndex += scaffoldTasks.length;
    phases.push({
      id: "phase-scaffold",
      name: "Project Scaffolding",
      description:
        "Set up project structure, dependencies, configuration, and base files",
      order: 0,
      tasks: scaffoldTasks,
      auditStrategy: this.buildAuditStrategy("phase-scaffold", "scaffold"),
      gate: {
        description: "Project compiles and runs hello world",
        requiredChecks: ["project compiles", "dev server starts"],
        autoPassCriteria: [
          "npm install succeeds",
          "no TypeScript errors",
          "dev server responds",
        ],
      },
    });

    // Phase 2: Schema / Data Layer
    const schemaTasks = this.extractTasksFromSections(
      ["schema", "database", "data", "model", "entity"],
      "schema",
      globalTaskIndex
    );
    if (schemaTasks.length > 0) {
      globalTaskIndex += schemaTasks.length;
      phases.push({
        id: "phase-schema",
        name: "Data Layer & Schema",
        description: "Database schema, models, migrations, and data access layer",
        order: phases.length,
        tasks: schemaTasks,
        auditStrategy: this.buildAuditStrategy("phase-schema", "schema"),
        gate: {
          description: "Database schema is defined and models are testable",
          requiredChecks: ["schema compiles", "migrations run"],
          autoPassCriteria: ["no SQL errors", "models export correctly"],
        },
      });
    }

    // Phase 3: Auth (if mentioned in spec)
    const authTasks = this.extractTasksFromSections(
      ["auth", "authentication", "authorization", "login", "permission"],
      "auth",
      globalTaskIndex
    );
    if (authTasks.length > 0) {
      globalTaskIndex += authTasks.length;
      phases.push({
        id: "phase-auth",
        name: "Authentication & Authorization",
        description: "User auth, sessions, permissions, and security",
        order: phases.length,
        tasks: authTasks,
        auditStrategy: this.buildAuditStrategy("phase-auth", "auth"),
        gate: {
          description: "Auth flow works end-to-end",
          requiredChecks: ["login works", "protected routes work"],
          autoPassCriteria: ["token validation", "session management"],
        },
      });
    }

    // Phase 4: API Layer
    const apiTasks = this.extractTasksFromSections(
      ["api", "endpoint", "route", "rest", "graphql", "backend", "server"],
      "api",
      globalTaskIndex
    );
    if (apiTasks.length > 0) {
      globalTaskIndex += apiTasks.length;
      phases.push({
        id: "phase-api",
        name: "API Layer",
        description: "REST/GraphQL endpoints, middleware, request handling",
        order: phases.length,
        tasks: apiTasks,
        auditStrategy: this.buildAuditStrategy("phase-api", "api"),
        gate: {
          description: "All API endpoints respond correctly",
          requiredChecks: ["endpoints return 200", "error handling works"],
          autoPassCriteria: ["response format correct", "status codes right"],
        },
      });
    }

    // Phase 5: UI Layer
    const uiTasks = this.extractTasksFromSections(
      ["ui", "frontend", "component", "page", "layout", "interface", "view"],
      "ui",
      globalTaskIndex
    );
    if (uiTasks.length > 0) {
      globalTaskIndex += uiTasks.length;
      phases.push({
        id: "phase-ui",
        name: "UI & Frontend",
        description: "Components, pages, layouts, styling, interactions",
        order: phases.length,
        tasks: uiTasks,
        auditStrategy: this.buildAuditStrategy("phase-ui", "ui"),
        gate: {
          description: "All pages render and navigate correctly",
          requiredChecks: [
            "pages render",
            "navigation works",
            "responsive layout",
          ],
          autoPassCriteria: ["no runtime errors", "styles load"],
        },
      });
    }

    // Phase 6: Integration
    const integrationTasks = this.extractTasksFromSections(
      ["integrat", "webhook", "external", "third-party"],
      "integration",
      globalTaskIndex
    );
    if (integrationTasks.length > 0) {
      globalTaskIndex += integrationTasks.length;
      phases.push({
        id: "phase-integration",
        name: "Integrations",
        description: "External services, webhooks, third-party APIs",
        order: phases.length,
        tasks: integrationTasks,
        auditStrategy: this.buildAuditStrategy(
          "phase-integration",
          "integration"
        ),
        gate: {
          description: "Integrations are wired and testable",
          requiredChecks: ["API keys load", "webhooks fire"],
          autoPassCriteria: ["mock mode works", "error handling present"],
        },
      });
    }

    // Phase 7: Tests
    const testTasks = this.buildTestPhase(globalTaskIndex);
    if (testTasks.length > 0) {
      globalTaskIndex += testTasks.length;
      phases.push({
        id: "phase-tests",
        name: "Testing & Quality",
        description: "Unit tests, integration tests, code review",
        order: phases.length,
        tasks: testTasks,
        auditStrategy: this.buildAuditStrategy("phase-tests", "test"),
        gate: {
          description: "All tests pass and coverage meets target",
          requiredChecks: ["tests pass", "coverage > 70%"],
          autoPassCriteria: ["npm test exits 0", "no flaky tests"],
        },
      });
    }

    // Phase 8: Documentation & Polish
    const docsTasks = this.buildDocsPhase(globalTaskIndex);
    if (docsTasks.length > 0) {
      phases.push({
        id: "phase-docs",
        name: "Documentation & Polish",
        description: "README, inline docs, final polish, deployment prep",
        order: phases.length,
        tasks: docsTasks,
        auditStrategy: this.buildAuditStrategy("phase-docs", "docs"),
        gate: {
          description: "Project is documented and deployment-ready",
          requiredChecks: ["README exists", "no console.logs"],
          autoPassCriteria: ["docs are complete", "build succeeds"],
        },
      });
    }

    return phases;
  }

  private buildScaffoldPhase(startIndex: number): MiniTask[] {
    const tasks: MiniTask[] = [];
    const frameworkLabel =
      this.framework === "nextjs"
        ? "Next.js"
        : this.framework.charAt(0).toUpperCase() + this.framework.slice(1);

    tasks.push({
      id: `task-scaffold-${startIndex}`,
      phaseId: "phase-scaffold",
      title: `Initialize ${frameworkLabel} project`,
      description: `Set up the ${frameworkLabel} project with proper directory structure, configuration files, and base setup`,
      type: "scaffold",
      priority: "critical",
      dependencies: [],
      estimatedEffort: "small",
      status: "pending",
      files: ["package.json", "tsconfig.json", ".gitignore"],
      acceptanceCriteria: [
        "Project has correct directory structure",
        "Dependencies are installed",
        "Dev server starts without errors",
      ],
      auditChecks: ["npm install exits 0", "TypeScript compiles"],
      prompt: `Set up a ${frameworkLabel} project with TypeScript.\n\nCreate the complete directory structure:\n- src/ directory with proper modules\n- Configuration files (tsconfig, package.json)\n- .gitignore with standard exclusions\n- Base entry point file\n\nMake sure the project compiles and dev server starts.`,
    });

    tasks.push({
      id: `task-config-${startIndex + 1}`,
      phaseId: "phase-scaffold",
      title: "Configure tooling and environment",
      description: "Set up linting, formatting, environment variables, and development tools",
      type: "config",
      priority: "high",
      dependencies: [`task-scaffold-${startIndex}`],
      estimatedEffort: "tiny",
      status: "pending",
      files: [".env.example", ".eslintrc*", ".prettierrc*"],
      acceptanceCriteria: [
        "Linting works",
        "Format on save configured",
        "Environment template exists",
      ],
      auditChecks: ["npm run lint exits 0"],
      prompt: `Configure the project's development tooling:\n\n1. ESLint configuration for ${this.framework}\n2. Prettier configuration\n3. .env.example with required variables\n4. Any framework-specific config (vite.config, next.config, etc.)\n\nMake sure linting passes cleanly.`,
    });

    return tasks;
  }

  private extractTasksFromSections(
    keywords: string[],
    taskType: TaskType,
    startIndex: number
  ): MiniTask[] {
    const tasks: MiniTask[] = [];
    let taskIdx = startIndex;

    for (const section of this.spec.sections) {
      const titleMatch = keywords.some((k) =>
        section.title.toLowerCase().includes(k)
      );
      const contentMatch = keywords.some((k) =>
        section.content.toLowerCase().includes(k)
      );

      if (!titleMatch && !contentMatch) continue;

      // Extract sub-features from bullet points
      const bullets = section.content
        .split("\n")
        .filter((l) => /^\s*[-*]/.test(l))
        .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
        .filter(Boolean);

      if (bullets.length > 0) {
        for (const bullet of bullets) {
          const id = `task-${taskType}-${taskIdx}`;
          tasks.push({
            id,
            phaseId: `phase-${taskType}`,
            title: bullet.substring(0, 80),
            description: bullet,
            type: taskType,
            priority: detectPriority(bullet, section.title),
            dependencies: tasks.length > 0 ? [tasks[tasks.length - 1].id] : [],
            estimatedEffort: estimateEffort(bullet),
            status: "pending",
            files: this.inferFiles(bullet, taskType),
            acceptanceCriteria: [`${bullet} is implemented and working`],
            auditChecks: this.getAuditChecks(taskType),
            prompt: this.buildTaskPrompt(bullet, section.title, taskType),
          });
          taskIdx++;
        }
      } else {
        // Whole section as one task
        const id = `task-${taskType}-${taskIdx}`;
        tasks.push({
          id,
          phaseId: `phase-${taskType}`,
          title: section.title,
          description: section.content.trim(),
          type: taskType,
          priority: detectPriority(section.content, section.title),
          dependencies: tasks.length > 0 ? [tasks[tasks.length - 1].id] : [],
          estimatedEffort: estimateEffort(section.content),
          status: "pending",
          files: this.inferFiles(section.title, taskType),
          acceptanceCriteria: [
            `${section.title} is fully implemented`,
            `All subsections are complete`,
          ],
          auditChecks: this.getAuditChecks(taskType),
          prompt: this.buildTaskPrompt(
            section.content.trim(),
            section.title,
            taskType
          ),
        });
        taskIdx++;
      }
    }

    return tasks;
  }

  private buildTestPhase(startIndex: number): MiniTask[] {
    const tasks: MiniTask[] = [];

    tasks.push({
      id: `task-test-unit-${startIndex}`,
      phaseId: "phase-tests",
      title: "Write unit tests for core logic",
      description: "Create unit tests for all business logic, utilities, and core functions",
      type: "test",
      priority: "high",
      dependencies: [],
      estimatedEffort: "medium",
      status: "pending",
      files: ["**/*.test.*", "**/*.spec.*"],
      acceptanceCriteria: [
        "All core functions have unit tests",
        "Tests pass",
        "Coverage > 70%",
      ],
      auditChecks: ["npm test exits 0", "coverage report generated"],
      prompt: `Write unit tests for the project's core logic.\n\nFor each module in src/:\n1. Create a corresponding test file\n2. Test happy paths and error cases\n3. Mock external dependencies\n4. Aim for >70% line coverage\n\nUse the project's testing framework (jest, vitest, pytest, etc.).`,
    });

    tasks.push({
      id: `task-test-integration-${startIndex + 1}`,
      phaseId: "phase-tests",
      title: "Write integration tests",
      description: "Test end-to-end flows, API endpoints, and component interactions",
      type: "test",
      priority: "medium",
      dependencies: [`task-test-unit-${startIndex}`],
      estimatedEffort: "medium",
      status: "pending",
      files: ["**/integration/**", "**/__tests__/**"],
      acceptanceCriteria: [
        "API endpoints tested",
        "User flows tested",
        "Error scenarios covered",
      ],
      auditChecks: ["integration tests pass"],
      prompt: `Write integration tests for the project.\n\n1. Test API endpoints with real/ mocked HTTP calls\n2. Test user flows end-to-end\n3. Test error scenarios and edge cases\n4. Ensure tests are isolated and repeatable`,
    });

    return tasks;
  }

  private buildDocsPhase(startIndex: number): MiniTask[] {
    return [
      {
        id: `task-docs-readme-${startIndex}`,
        phaseId: "phase-docs",
        title: "Write comprehensive README",
        description: "Create a detailed README with setup, usage, API docs, and architecture overview",
        type: "docs",
        priority: "high",
        dependencies: [],
        estimatedEffort: "small",
        status: "pending",
        files: ["README.md"],
        acceptanceCriteria: [
          "README has setup instructions",
          "API is documented",
          "Architecture is explained",
        ],
        auditChecks: ["README renders correctly"],
        prompt: `Write a comprehensive README.md for this project.\n\nInclude:\n1. Project name and description\n2. Quick start / installation\n3. Usage examples\n4. API documentation\n5. Architecture overview\n6. Contributing guidelines\n7. License`,
      },
    ];
  }

  private buildTaskPrompt(
    content: string,
    sectionTitle: string,
    taskType: TaskType
  ): string {
    const frameworkLabel =
      this.framework === "nextjs"
        ? "Next.js"
        : this.framework.charAt(0).toUpperCase() + this.framework.slice(1);

    return `## Task: ${sectionTitle}

### What to build
${content}

### Context
- Project uses ${frameworkLabel} with TypeScript
- Task type: ${taskType}
- Follow existing project patterns and conventions

### Requirements
1. Implement the feature as described
2. Handle errors gracefully
3. Follow TypeScript best practices
4. Add appropriate types
5. Write self-documenting code

### Acceptance criteria
- The feature works as described
- No TypeScript errors
- Follows project code style
- Handles edge cases`;
  }

  private inferFiles(text: string, taskType: TaskType): string[] {
    const lower = text.toLowerCase();
    const files: string[] = [];

    if (lower.includes("component") || lower.includes("ui"))
      files.push("src/components/**");
    if (lower.includes("page") || lower.includes("route"))
      files.push("src/pages/**", "src/routes/**");
    if (lower.includes("api") || lower.includes("endpoint"))
      files.push("src/api/**", "src/routes/**");
    if (lower.includes("model") || lower.includes("schema"))
      files.push("src/models/**", "src/schema/**");
    if (lower.includes("util") || lower.includes("helper"))
      files.push("src/utils/**");
    if (lower.includes("config"))
      files.push("src/config/**");

    if (files.length === 0) {
      switch (taskType) {
        case "ui":
          files.push("src/components/**");
          break;
        case "api":
          files.push("src/api/**");
          break;
        case "schema":
          files.push("src/models/**");
          break;
        case "auth":
          files.push("src/auth/**");
          break;
        case "test":
          files.push("**/*.test.*");
          break;
        default:
          files.push("src/**");
      }
    }

    return files;
  }

  private getAuditChecks(taskType: TaskType): string[] {
    const common = ["TypeScript compiles", "No lint errors"];
    switch (taskType) {
      case "api":
        return [...common, "Endpoints return correct status codes", "Input validation present"];
      case "ui":
        return [...common, "Components render", "No console errors"];
      case "auth":
        return [...common, "No hardcoded secrets", "Token validation works"];
      case "schema":
        return [...common, "Migrations run cleanly", "Models are typed"];
      case "test":
        return ["All tests pass", "Coverage > 70%"];
      default:
        return common;
    }
  }

  private assessComplexity(
    totalTasks: number,
    phases: Phase[]
  ): Roadmap["estimatedComplexity"] {
    const score = totalTasks * 2 + phases.length * 5;
    if (score <= 15) return "low";
    if (score <= 30) return "medium";
    if (score <= 50) return "high";
    return "very-high";
  }

  private buildAuditStrategy(
    phaseId: string,
    taskType: TaskType
  ): AuditStrategy {
    const checks: AuditCheck[] = [];

    // Common checks
    checks.push({
      id: `${phaseId}-lint`,
      category: "code-quality",
      description: "Code passes linting",
      automated: true,
      command: "npm run lint",
    });
    checks.push({
      id: `${phaseId}-types`,
      category: "code-quality",
      description: "No TypeScript type errors",
      automated: true,
      command: "npx tsc --noEmit",
    });

    // Type-specific checks
    if (taskType === "api" || taskType === "auth") {
      checks.push({
        id: `${phaseId}-security`,
        category: "security",
        description: "No hardcoded secrets or credentials",
        automated: false,
      });
      checks.push({
        id: `${phaseId}-input-validation`,
        category: "security",
        description: "All inputs are validated and sanitized",
        automated: false,
      });
    }

    if (taskType === "ui") {
      checks.push({
        id: `${phaseId}-a11y`,
        category: "accessibility",
        description: "Components have proper ARIA labels",
        automated: false,
      });
      checks.push({
        id: `${phaseId}-responsive`,
        category: "accessibility",
        description: "Layout works on mobile and desktop",
        automated: false,
      });
    }

    if (taskType !== "test" && taskType !== "docs") {
      checks.push({
        id: `${phaseId}-perf`,
        category: "performance",
        description: "No unnecessary re-renders or N+1 queries",
        automated: false,
      });
    }

    const testPlan: TestPlan = {
      unitTests:
        taskType === "test"
          ? ["All functions tested"]
          : [`Tests exist for this phase`],
      integrationTests:
        taskType === "api"
          ? ["API endpoints tested"]
          : taskType === "ui"
          ? ["Component rendering tested"]
          : [],
      e2eTests: taskType === "ui" ? ["User flows tested"] : [],
      coverageTarget: 70,
    };

    return {
      phaseId,
      checklist: checks,
      testPlan,
      reviewGuidelines: [
        "Code follows project conventions",
        "No dead code or unused imports",
        "Error handling is comprehensive",
        "Types are explicit and accurate",
        "Functions are small and focused",
      ],
    };
  }
}
