// DevPilot CLI - Logic Connection Mapper
// Links frontend to backend to database with data flow tracing

import { ProjectIntent, DataFlow, FeatureConnection } from "./intent.js";

// ─── Connection Types ───────────────────────────────────────────────────

export interface LogicLayer {
  name: string;
  type: "ui" | "api" | "service" | "database" | "external";
  components: LogicComponent[];
  connections: LayerConnection[];
}

export interface LogicComponent {
  id: string;
  name: string;
  layer: string;
  responsibility: string;
  inputs: string[];
  outputs: string[];
  dependsOn: string[];
}

export interface LayerConnection {
  from: string;
  to: string;
  protocol: string; // HTTP, WebSocket, database query, function call
  data: string;
  description: string;
}

export interface DataPath {
  id: string;
  name: string;
  steps: DataPathStep[];
  startLayer: string;
  endLayer: string;
}

export interface DataPathStep {
  layer: string;
  component: string;
  action: string;
  dataIn: string;
  dataOut: string;
}

// ─── Connection Mapper ──────────────────────────────────────────────────

export class ConnectionMapper {
  private intent: ProjectIntent;

  constructor(intent: ProjectIntent) {
    this.intent = intent;
  }

  map(): LogicLayer[] {
    const layers: LogicLayer[] = [];

    // UI Layer
    layers.push(this.mapUILayer());

    // API Layer
    layers.push(this.mapAPILayer());

    // Service Layer
    layers.push(this.mapServiceLayer());

    // Database Layer
    layers.push(this.mapDatabaseLayer());

    // External Services
    if (this.intent.integrations.length > 0) {
      layers.push(this.mapExternalLayer());
    }

    return layers;
  }

  mapDataPaths(): DataPath[] {
    const paths: DataPath[] = [];

    // Generate paths from data flows
    for (const flow of this.intent.dataFlow) {
      paths.push(this.flowToPath(flow));
    }

    // Generate standard CRUD paths
    paths.push(...this.generateCRUDPaths());

    // Generate auth paths
    paths.push(...this.generateAuthPaths());

    return paths;
  }

  private mapUILayer(): LogicLayer {
    const components: LogicComponent[] = [];

    // Extract UI components from spec sections
    for (const section of this.intent.connections) {
      if (section.type === "enhances" || section.from.toLowerCase().includes("ui")) {
        components.push({
          id: `ui-${section.from.toLowerCase().replace(/\s+/g, "-")}`,
          name: section.from,
          layer: "ui",
          responsibility: `Display ${section.from} to users`,
          inputs: ["user interaction", "state updates"],
          outputs: ["API calls", "state changes"],
          dependsOn: [],
        });
      }
    }

    // Add standard UI components
    components.push({
      id: "ui-navigation",
      name: "Navigation",
      layer: "ui",
      responsibility: "Route users to correct views",
      inputs: ["URL", "user clicks"],
      outputs: ["route changes", "page renders"],
      dependsOn: [],
    });

    return {
      name: "UI Layer",
      type: "ui",
      components,
      connections: this.generateUIConnections(components),
    };
  }

  private mapAPILayer(): LogicLayer {
    const components: LogicComponent[] = [];

    // Extract API endpoints from spec
    for (const section of this.intent.connections) {
      if (section.type === "requires" || section.from.toLowerCase().includes("api")) {
        components.push({
          id: `api-${section.from.toLowerCase().replace(/\s+/g, "-")}`,
          name: section.from,
          layer: "api",
          responsibility: `Handle ${section.from} requests`,
          inputs: ["HTTP requests", "WebSocket messages"],
          outputs: ["HTTP responses", "Database queries"],
          dependsOn: [],
        });
      }
    }

    // Add standard API components
    components.push(
      {
        id: "api-router",
        name: "API Router",
        layer: "api",
        responsibility: "Route requests to handlers",
        inputs: ["HTTP requests"],
        outputs: ["handler invocations"],
        dependsOn: [],
      },
      {
        id: "api-middleware",
        name: "Middleware",
        layer: "api",
        responsibility: "Auth, validation, logging",
        inputs: ["requests"],
        outputs: ["validated requests"],
        dependsOn: [],
      }
    );

    return {
      name: "API Layer",
      type: "api",
      components,
      connections: this.generateAPIConnections(components),
    };
  }

  private mapServiceLayer(): LogicLayer {
    const components: LogicComponent[] = [];

    // Extract services from spec
    for (const section of this.intent.connections) {
      if (
        section.from.toLowerCase().includes("service") ||
        section.from.toLowerCase().includes("business") ||
        section.from.toLowerCase().includes("logic")
      ) {
        components.push({
          id: `service-${section.from.toLowerCase().replace(/\s+/g, "-")}`,
          name: section.from,
          layer: "service",
          responsibility: `Implement ${section.from} business logic`,
          inputs: ["API requests", "other services"],
          outputs: ["database queries", "API responses"],
          dependsOn: [],
        });
      }
    }

    // Add standard services
    components.push(
      {
        id: "service-auth",
        name: "Authentication Service",
        layer: "service",
        responsibility: "Handle user authentication and authorization",
        inputs: ["credentials", "tokens"],
        outputs: ["session", "permissions"],
        dependsOn: ["database"],
      },
      {
        id: "service-validation",
        name: "Validation Service",
        layer: "service",
        responsibility: "Validate all input data",
        inputs: ["raw input"],
        outputs: ["validated data", "errors"],
        dependsOn: [],
      }
    );

    return {
      name: "Service Layer",
      type: "service",
      components,
      connections: this.generateServiceConnections(components),
    };
  }

  private mapDatabaseLayer(): LogicLayer {
    const components: LogicComponent[] = [];

    // Extract data models from spec
    for (const section of this.intent.connections) {
      if (
        section.from.toLowerCase().includes("data") ||
        section.from.toLowerCase().includes("model") ||
        section.from.toLowerCase().includes("schema")
      ) {
        components.push({
          id: `db-${section.from.toLowerCase().replace(/\s+/g, "-")}`,
          name: section.from,
          layer: "database",
          responsibility: `Store and retrieve ${section.from}`,
          inputs: ["queries"],
          outputs: ["results"],
          dependsOn: [],
        });
      }
    }

    // Add standard database components
    components.push(
      {
        id: "db-connection",
        name: "Database Connection",
        layer: "database",
        responsibility: "Manage database connections and pooling",
        inputs: ["connection requests"],
        outputs: ["connection pool"],
        dependsOn: [],
      },
      {
        id: "db-migrations",
        name: "Migrations",
        layer: "database",
        responsibility: "Schema versioning and migrations",
        inputs: ["migration files"],
        outputs: ["schema changes"],
        dependsOn: [],
      }
    );

    return {
      name: "Database Layer",
      type: "database",
      components,
      connections: this.generateDBConnections(components),
    };
  }

  private mapExternalLayer(): LogicLayer {
    const components: LogicComponent[] = [];

    for (const integration of this.intent.integrations) {
      components.push({
        id: `ext-${integration.service.toLowerCase().replace(/\s+/g, "-")}`,
        name: integration.service,
        layer: "external",
        responsibility: integration.purpose,
        inputs: [integration.dataIn],
        outputs: [integration.dataOut],
        dependsOn: [],
      });
    }

    return {
      name: "External Services",
      type: "external",
      components,
      connections: components.map((c) => ({
        from: "service",
        to: c.id,
        protocol: "HTTP/REST",
        data: c.inputs.join(", "),
        description: `Call ${c.name}`,
      })),
    };
  }

  private flowToPath(flow: DataFlow): DataPath {
    return {
      id: `path-${flow.from.toLowerCase().replace(/\s+/g, "-")}-${flow.to.toLowerCase().replace(/\s+/g, "-")}`,
      name: `${flow.from} → ${flow.to}`,
      steps: [
        {
          layer: "ui",
          component: flow.from,
          action: "User initiates action",
          dataIn: "user input",
          dataOut: "request data",
        },
        {
          layer: "api",
          component: "API Router",
          action: "Route request",
          dataIn: "request data",
          dataOut: "validated request",
        },
        {
          layer: "service",
          component: "Business Logic",
          action: "Process data",
          dataIn: "validated request",
          dataOut: "processed data",
        },
        {
          layer: "database",
          component: flow.to,
          action: "Persist data",
          dataIn: "processed data",
          dataOut: "stored data",
        },
      ],
      startLayer: "ui",
      endLayer: "database",
    };
  }

  private generateCRUDPaths(): DataPath[] {
    const paths: DataPath[] = [];

    for (const action of this.intent.coreActions) {
      const actionLower = action.action.toLowerCase();

      if (actionLower.includes("create") || actionLower.includes("add")) {
        paths.push({
          id: `path-create-${actionLower.replace(/\s+/g, "-")}`,
          name: `Create: ${action.action}`,
          steps: [
            { layer: "ui", component: "Form", action: "Display form", dataIn: "none", dataOut: "form data" },
            { layer: "api", component: "POST endpoint", action: "Receive data", dataIn: "form data", dataOut: "validated data" },
            { layer: "service", component: "Create handler", action: "Create entity", dataIn: "validated data", dataOut: "new entity" },
            { layer: "database", component: "INSERT", action: "Persist entity", dataIn: "new entity", dataOut: "stored entity" },
          ],
          startLayer: "ui",
          endLayer: "database",
        });
      }

      if (actionLower.includes("read") || actionLower.includes("view") || actionLower.includes("see")) {
        paths.push({
          id: `path-read-${actionLower.replace(/\s+/g, "-")}`,
          name: `Read: ${action.action}`,
          steps: [
            { layer: "ui", component: "List/Detail", action: "Request data", dataIn: "none", dataOut: "query params" },
            { layer: "api", component: "GET endpoint", action: "Fetch data", dataIn: "query params", dataOut: "filters" },
            { layer: "service", component: "Read handler", action: "Query entities", dataIn: "filters", dataOut: "results" },
            { layer: "database", component: "SELECT", action: "Fetch entities", dataIn: "query", dataOut: "entities" },
          ],
          startLayer: "ui",
          endLayer: "database",
        });
      }

      if (actionLower.includes("update") || actionLower.includes("edit")) {
        paths.push({
          id: `path-update-${actionLower.replace(/\s+/g, "-")}`,
          name: `Update: ${action.action}`,
          steps: [
            { layer: "ui", component: "Edit Form", action: "Display form", dataIn: "existing entity", dataOut: "changes" },
            { layer: "api", component: "PUT endpoint", action: "Receive changes", dataIn: "changes", dataOut: "validated changes" },
            { layer: "service", component: "Update handler", action: "Apply changes", dataIn: "validated changes", dataOut: "updated entity" },
            { layer: "database", component: "UPDATE", action: "Persist changes", dataIn: "updated entity", dataOut: "stored entity" },
          ],
          startLayer: "ui",
          endLayer: "database",
        });
      }

      if (actionLower.includes("delete") || actionLower.includes("remove")) {
        paths.push({
          id: `path-delete-${actionLower.replace(/\s+/g, "-")}`,
          name: `Delete: ${action.action}`,
          steps: [
            { layer: "ui", component: "Confirm Dialog", action: "Confirm deletion", dataIn: "entity id", dataOut: "confirmation" },
            { layer: "api", component: "DELETE endpoint", action: "Receive request", dataIn: "entity id", dataOut: "validated request" },
            { layer: "service", component: "Delete handler", action: "Delete entity", dataIn: "entity id", dataOut: "deleted entity" },
            { layer: "database", component: "DELETE", action: "Remove entity", dataIn: "entity id", dataOut: "success" },
          ],
          startLayer: "ui",
          endLayer: "database",
        });
      }
    }

    return paths;
  }

  private generateAuthPaths(): DataPath[] {
    return [
      {
        id: "path-auth-register",
        name: "User Registration",
        steps: [
          { layer: "ui", component: "Register Form", action: "Display form", dataIn: "none", dataOut: "registration data" },
          { layer: "api", component: "POST /register", action: "Receive data", dataIn: "registration data", dataOut: "validated data" },
          { layer: "service", component: "Auth Service", action: "Create user", dataIn: "validated data", dataOut: "new user" },
          { layer: "database", component: "INSERT users", action: "Store user", dataIn: "new user", dataOut: "stored user" },
        ],
        startLayer: "ui",
        endLayer: "database",
      },
      {
        id: "path-auth-login",
        name: "User Login",
        steps: [
          { layer: "ui", component: "Login Form", action: "Display form", dataIn: "none", dataOut: "credentials" },
          { layer: "api", component: "POST /login", action: "Receive credentials", dataIn: "credentials", dataOut: "validated credentials" },
          { layer: "service", component: "Auth Service", action: "Verify credentials", dataIn: "validated credentials", dataOut: "session token" },
          { layer: "database", component: "SELECT users", action: "Find user", dataIn: "email", dataOut: "user record" },
        ],
        startLayer: "ui",
        endLayer: "database",
      },
    ];
  }

  private generateUIConnections(components: LogicComponent[]): LayerConnection[] {
    return components.map((c) => ({
      from: c.id,
      to: "api-router",
      protocol: "HTTP/REST",
      data: "user requests",
      description: `Send ${c.name} requests to API`,
    }));
  }

  private generateAPIConnections(components: LogicComponent[]): LayerConnection[] {
    const connections: LayerConnection[] = [];

    for (const c of components) {
      connections.push({
        from: "api-router",
        to: c.id,
        protocol: "function call",
        data: "request data",
        description: `Route to ${c.name}`,
      });
      connections.push({
        from: c.id,
        to: "service-auth",
        protocol: "function call",
        data: "request context",
        description: `Check auth for ${c.name}`,
      });
    }

    return connections;
  }

  private generateServiceConnections(components: LogicComponent[]): LayerConnection[] {
    return components.map((c) => ({
      from: c.id,
      to: "db-connection",
      protocol: "database query",
      data: "query data",
      description: `${c.name} queries database`,
    }));
  }

  private generateDBConnections(components: LogicComponent[]): LayerConnection[] {
    return components.map((c) => ({
      from: "db-connection",
      to: c.id,
      protocol: "SQL/ORM",
      data: "entities",
      description: `Connect to ${c.name}`,
    }));
  }
}
