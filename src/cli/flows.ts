// DevPilot CLI - User Flow Mapper
// Traces how users actually use the app, from entry to completion

import { ProjectIntent, UserAction, UserPersona } from "./intent.js";

// ─── User Flow Types ────────────────────────────────────────────────────

export interface UserFlow {
  id: string;
  name: string;
  persona: string;
  steps: FlowStep[];
  entryPoint: string;
  goal: string;
  features: string[];
  data: string[];
}

export interface FlowStep {
  order: number;
  action: string;
  ui: string; // What the user sees
  backend: string; // What happens on the server
  data: string; // What data is involved
  validation: string; // What gets validated
  error: string; // What happens on error
}

export interface FlowMap {
  flows: UserFlow[];
  entryPoints: string[];
  criticalPaths: string[];
  sharedSteps: string[];
}

// ─── Flow Mapper ────────────────────────────────────────────────────────

export class FlowMapper {
  private intent: ProjectIntent;

  constructor(intent: ProjectIntent) {
    this.intent = intent;
  }

  map(): FlowMap {
    const flows = this.generateFlows();
    const entryPoints = this.findEntryPoints(flows);
    const criticalPaths = this.findCriticalPaths(flows);
    const sharedSteps = this.findSharedSteps(flows);

    return {
      flows,
      entryPoints,
      criticalPaths,
      sharedSteps,
    };
  }

  private generateFlows(): UserFlow[] {
    const flows: UserFlow[] = [];

    // Generate flows from user actions
    for (const action of this.intent.coreActions) {
      const flow = this.actionToFlow(action);
      if (flow) flows.push(flow);
    }

    // Generate flows from personas
    for (const persona of this.intent.users) {
      const personaFlows = this.personaToFlows(persona);
      flows.push(...personaFlows);
    }

    // Add critical system flows
    flows.push(...this.generateSystemFlows());

    return flows;
  }

  private actionToFlow(action: UserAction): UserFlow | null {
    if (!action.action) return null;

    const id = action.action
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return {
      id,
      name: action.action,
      persona: "user",
      steps: [
        {
          order: 1,
          action: action.trigger,
          ui: "User interacts with UI",
          backend: "Request received",
          data: action.data.join(", ") || "user input",
          validation: "Input validated",
          error: "Error message shown",
        },
        {
          order: 2,
          action: action.action,
          ui: "Loading state shown",
          backend: "Business logic executed",
          data: action.data.join(", ") || "data processed",
          validation: "Business rules enforced",
          error: "Graceful error handling",
        },
        {
          order: 3,
          action: `Show result of ${action.action}`,
          ui: "Result displayed to user",
          backend: "Response sent",
          data: "Updated data",
          validation: "Output validated",
          error: "Fallback behavior",
        },
      ],
      entryPoint: action.trigger,
      goal: action.result,
      features: action.features,
      data: action.data,
    };
  }

  private personaToFlows(persona: UserPersona): UserFlow[] {
    const flows: UserFlow[] = [];

    for (const goal of persona.goals) {
      const id = `persona-${persona.role}-${goal
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}`;

      flows.push({
        id,
        name: `${persona.name}: ${goal}`,
        persona: persona.role,
        steps: this.generateStepsForGoal(goal),
        entryPoint: "Login / Dashboard",
        goal,
        features: [],
        data: [],
      });
    }

    return flows;
  }

  private generateStepsForGoal(goal: string): FlowStep[] {
    return [
      {
        order: 1,
        action: "Navigate to relevant section",
        ui: "User clicks navigation",
        backend: "Route resolved",
        data: "Navigation state",
        validation: "Route exists",
        error: "404 page shown",
      },
      {
        order: 2,
        action: `Initiate: ${goal}`,
        ui: "Form or action displayed",
        backend: "Data fetched if needed",
        data: "Existing data loaded",
        validation: "Permissions checked",
        error: "Access denied message",
      },
      {
        order: 3,
        action: `Execute: ${goal}`,
        ui: "Progress indicator",
        backend: "Business logic runs",
        data: "Data transformed",
        validation: "Input validated",
        error: "Retry option shown",
      },
      {
        order: 4,
        action: "Confirm completion",
        ui: "Success message shown",
        backend: "Audit log updated",
        data: "Final state saved",
        validation: "Data integrity check",
        error: "Rollback if needed",
      },
    ];
  }

  private generateSystemFlows(): UserFlow[] {
    return [
      {
        id: "auth-login",
        name: "User Login",
        persona: "user",
        steps: [
          {
            order: 1,
            action: "Enter credentials",
            ui: "Login form displayed",
            backend: "Waiting for input",
            data: "Email/password entered",
            validation: "Format validation",
            error: "Invalid format message",
          },
          {
            order: 2,
            action: "Submit login",
            ui: "Loading spinner",
            backend: "Credentials verified",
            data: "Credentials checked against DB",
            validation: "Authentication check",
            error: "Invalid credentials message",
          },
          {
            order: 3,
            action: "Session created",
            ui: "Redirect to dashboard",
            backend: "JWT/token generated",
            data: "Session stored",
            validation: "Token valid",
            error: "Session creation failed",
          },
        ],
        entryPoint: "Login page",
        goal: "Authenticated user session",
        features: ["auth", "session"],
        data: ["credentials", "token", "session"],
      },
      {
        id: "data-persistence",
        name: "Data Save Flow",
        persona: "user",
        steps: [
          {
            order: 1,
            action: "User edits data",
            ui: "Form/input updated",
            backend: "Waiting for save",
            data: "Draft state",
            validation: "Client-side validation",
            error: "Validation errors shown",
          },
          {
            order: 2,
            action: "Save triggered",
            ui: "Saving indicator",
            backend: "Data received",
            data: "New data validated",
            validation: "Server-side validation",
            error: "Validation error response",
          },
          {
            order: 3,
            action: "Data persisted",
            ui: "Success confirmation",
            backend: "Database updated",
            data: "Data stored permanently",
            validation: "Integrity check",
            error: "Retry mechanism",
          },
        ],
        entryPoint: "Any data entry point",
        goal: "Data saved successfully",
        features: ["database", "validation"],
        data: ["user input", "validated data", "stored data"],
      },
    ];
  }

  private findEntryPoints(flows: UserFlow[]): string[] {
    const entryPoints = new Set<string>();
    for (const flow of flows) {
      entryPoints.add(flow.entryPoint);
    }
    return Array.from(entryPoints);
  }

  private findCriticalPaths(flows: UserFlow[]): string[] {
    // Critical paths are flows that affect core functionality
    const criticalKeywords = ["auth", "login", "payment", "save", "create", "delete", "submit"];
    const criticalPaths: string[] = [];

    for (const flow of flows) {
      const isCritical = criticalKeywords.some(
        (kw) =>
          flow.name.toLowerCase().includes(kw) ||
          flow.goal.toLowerCase().includes(kw)
      );
      if (isCritical) {
        criticalPaths.push(flow.id);
      }
    }

    return criticalPaths;
  }

  private findSharedSteps(flows: UserFlow[]): string[] {
    // Find steps that appear in multiple flows
    const stepCounts = new Map<string, number>();

    for (const flow of flows) {
      for (const step of flow.steps) {
        const key = step.action;
        stepCounts.set(key, (stepCounts.get(key) || 0) + 1);
      }
    }

    const shared: string[] = [];
    for (const [action, count] of stepCounts) {
      if (count > 1) shared.push(action);
    }

    return shared;
  }
}
