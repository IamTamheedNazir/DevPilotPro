// DevPilot CLI - Intent Analysis Engine
// Understands what users really want, not just what they say

import { SpecFile, SpecSection } from "./types.js";

// ─── Intent Types ───────────────────────────────────────────────────────

export interface ProjectIntent {
  purpose: string; // What the project is for
  users: UserPersona[]; // Who will use it
  coreActions: UserAction[]; // What users will do
  dataFlow: DataFlow[]; // How data moves through the system
  connections: FeatureConnection[]; // How features relate to each other
  businessLogic: BusinessRule[]; // Core rules that govern the system
  integrations: Integration[]; // External services needed
  constraints: Constraint[]; // Non-functional requirements
}

export interface UserPersona {
  name: string;
  role: string;
  goals: string[];
  painPoints: string[];
}

export interface UserAction {
  action: string;
  trigger: string;
  result: string;
  features: string[]; // Which features are involved
  data: string[]; // What data is read/written
}

export interface DataFlow {
  from: string;
  to: string;
  data: string;
  method: string; // API, WebSocket, database, etc.
}

export interface FeatureConnection {
  from: string;
  to: string;
  type: "requires" | "enhances" | "shares-data" | "triggers";
  description: string;
}

export interface BusinessRule {
  rule: string;
  appliesTo: string[];
  consequence: string;
}

export interface Integration {
  service: string;
  purpose: string;
  dataIn: string;
  dataOut: string;
}

export interface Constraint {
  type: "performance" | "security" | "scalability" | "accessibility" | "compliance";
  requirement: string;
  impact: string; // What this affects
}

// ─── Intent Analyzer ────────────────────────────────────────────────────

export class IntentAnalyzer {
  private spec: SpecFile;

  constructor(spec: SpecFile) {
    this.spec = spec;
  }

  analyze(): ProjectIntent {
    const allText = this.getAllText();

    return {
      purpose: this.extractPurpose(allText),
      users: this.extractUsers(allText),
      coreActions: this.extractActions(allText),
      dataFlow: this.extractDataFlow(allText),
      connections: this.extractConnections(),
      businessLogic: this.extractBusinessLogic(allText),
      integrations: this.extractIntegrations(allText),
      constraints: this.extractConstraints(allText),
    };
  }

  private getAllText(): string {
    const sections = this.spec.sections.map((s) => {
      let text = `${s.title}\n${s.content}`;
      if (s.subsections) {
        text += "\n" + s.subsections.map((sub) => `${sub.title}\n${sub.content}`).join("\n");
      }
      return text;
    });
    return [
      this.spec.metadata.description,
      this.spec.overview,
      ...sections,
      ...(this.spec.requirements || []),
      ...(this.spec.constraints || []),
    ].join("\n");
  }

  private extractPurpose(text: string): string {
    // Extract the core purpose from the spec
    const purposePatterns = [
      /(?:purpose|goal|objective|aim|designed to|allows users to|enables|helps users)\s*[:\-]?\s*(.+)/i,
      /(?:this|the)\s+(?:app|application|platform|tool|system)\s+(.+)/i,
    ];

    for (const pattern of purposePatterns) {
      const match = text.match(pattern);
      if (match) return match[1].trim().substring(0, 200);
    }

    return this.spec.metadata.description || this.spec.overview || "No purpose identified";
  }

  private extractUsers(text: string): UserPersona[] {
    const personas: UserPersona[] = [];

    // Look for user types
    const userPatterns = [
      /(?:users?|customers?|admins?|moderators?|owners?|members?|guests?|visitors?)\s+(?:can|will|should|want to|need to)\s+(.+)/gi,
      /(?:as a|for)\s+(.+?)(?:,\s*|\s+)(?:I want|we want|they want|the user wants)\s+(.+)/gi,
    ];

    const foundRoles = new Set<string>();

    for (const pattern of userPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const role = (match[1] || match[0]).trim().toLowerCase();
        if (!foundRoles.has(role) && role.length < 50) {
          foundRoles.add(role);
          personas.push({
            name: role.charAt(0).toUpperCase() + role.slice(1),
            role,
            goals: [match[2] || "Use the application"],
            painPoints: [],
          });
        }
      }
    }

    // Default user if none found
    if (personas.length === 0) {
      personas.push({
        name: "Primary User",
        role: "user",
        goals: ["Use the application to accomplish their tasks"],
        painPoints: ["Current solutions are too complex"],
      });
    }

    return personas;
  }

  private extractActions(text: string): UserAction[] {
    const actions: UserAction[] = [];
    const actionPatterns = [
      /(?:users?|they|he|she)\s+(?:can|will|should|are able to)\s+(.+?)(?:\.|,|\n)/gi,
      /(?:create|add|edit|update|delete|remove|view|see|search|filter|sort|share|export|import|upload|download|send|receive|invite|join|leave|approve|reject|comment|like|follow|bookmark|report|flag)\s+(.+?)(?:\.|,|\n)/gi,
    ];

    const foundActions = new Set<string>();

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const action = match[1]?.trim();
        if (action && !foundActions.has(action) && action.length < 100) {
          foundActions.add(action);
          actions.push({
            action,
            trigger: "User interaction",
            result: "Data updated",
            features: [],
            data: [],
          });
        }
      }
    }

    return actions.slice(0, 20); // Limit to 20 actions
  }

  private extractDataFlow(text: string): DataFlow[] {
    const flows: DataFlow[] = [];

    // Look for data flow patterns
    const flowPatterns = [
      /(?:data|information|content|message|file|image|video|audio)\s+(?:flows?|moves?|goes?|sent|received|stored|cached|synced)\s+(?:from|to|through|via)\s+(.+?)(?:\.|,|\n)/gi,
      /(?:frontend|client|UI|interface)\s+(?:sends?|receives?|displays?|shows?)\s+(.+?)(?:\.|,|\n)/gi,
      /(?:backend|server|API|database)\s+(?:receives?|stores?|returns?|sends?)\s+(.+?)(?:\.|,|\n)/gi,
    ];

    for (const pattern of flowPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        flows.push({
          from: "source",
          to: "destination",
          data: match[1]?.trim() || "data",
          method: "API",
        });
      }
    }

    return flows.slice(0, 15);
  }

  private extractConnections(): FeatureConnection[] {
    const connections: FeatureConnection[] = [];
    const sections = this.spec.sections;

    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const sectionA = sections[i];
        const sectionB = sections[j];

        // Check if sections reference each other
        const aReferencesB = sectionA.content.toLowerCase().includes(sectionB.title.toLowerCase());
        const bReferencesA = sectionB.content.toLowerCase().includes(sectionA.title.toLowerCase());

        if (aReferencesB || bReferencesA) {
          connections.push({
            from: sectionA.title,
            to: sectionB.title,
            type: aReferencesB ? "requires" : "enhances",
            description: `${sectionA.title} ${aReferencesB ? "requires" : "enhances"} ${sectionB.title}`,
          });
        }
      }
    }

    return connections;
  }

  private extractBusinessLogic(text: string): BusinessRule[] {
    const rules: BusinessRule[] = [];
    const rulePatterns = [
      /(?:must|should|cannot|must not|shall not|required to|need to|have to)\s+(.+?)(?:\.|,|\n)/gi,
      /(?:if|when|unless|until|before|after)\s+(.+?)\s+(?:then|the system|the app|it)\s+(.+?)(?:\.|,|\n)/gi,
      /(?:validation|rule|constraint|requirement)\s*[:\-]?\s*(.+?)(?:\.|,|\n)/gi,
    ];

    const foundRules = new Set<string>();

    for (const pattern of rulePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const rule = match[0]?.trim();
        if (rule && !foundRules.has(rule) && rule.length < 200) {
          foundRules.add(rule);
          rules.push({
            rule,
            appliesTo: [],
            consequence: "System enforces this rule",
          });
        }
      }
    }

    return rules.slice(0, 15);
  }

  private extractIntegrations(text: string): Integration[] {
    const integrations: Integration[] = [];
    const integrationPatterns = [
      /(?:integrat(?:e|ion|ing)|connect(?:ed|ing)?|third.party|external)\s+(.+?)(?:\.|,|\n)/gi,
      /(?:using|via|through|with)\s+(Stripe|PayPal|Twilio|SendGrid|AWS|Google Cloud|Firebase|Supabase|Auth0|GitHub|GitLab|Slack|Discord|Twitter|Facebook|Google|Apple|Microsoft)\s+(.+?)(?:\.|,|\n)/gi,
    ];

    const foundServices = new Set<string>();

    for (const pattern of integrationPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const service = match[1]?.trim();
        if (service && !foundServices.has(service) && service.length < 50) {
          foundServices.add(service);
          integrations.push({
            service,
            purpose: match[2] || "External service integration",
            dataIn: "User data",
            dataOut: "Service response",
          });
        }
      }
    }

    return integrations;
  }

  private extractConstraints(text: string): Constraint[] {
    const constraints: Constraint[] = [];
    const constraintPatterns = [
      /(?:must be|should be|needs to be|required to be)\s+(?:fast|slow|secure|accessible|compliant|scalable|reliable|available)\s*(.+?)(?:\.|,|\n)/gi,
      /(?:response time|latency|uptime|availability|throughput)\s+(?:under|below|over|above|at least)\s+(.+?)(?:\.|,|\n)/gi,
      /(?:GDPR|HIPAA|SOC|PCI|WCAG|ISO)\s+(.+?)(?:\.|,|\n)/gi,
    ];

    const foundConstraints = new Set<string>();

    for (const pattern of constraintPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const constraint = match[0]?.trim();
        if (constraint && !foundConstraints.has(constraint) && constraint.length < 200) {
          foundConstraints.add(constraint);
          constraints.push({
            type: "performance",
            requirement: constraint,
            impact: "Affects architecture and implementation",
          });
        }
      }
    }

    return constraints;
  }
}

// ─── Feature Graph Builder ──────────────────────────────────────────────

export interface FeatureNode {
  id: string;
  name: string;
  type: "feature" | "data" | "ui" | "api" | "service";
  dependsOn: string[];
  enhances: string[];
  sharesDataWith: string[];
}

export class FeatureGraph {
  private nodes: Map<string, FeatureNode> = new Map();

  constructor(spec: SpecFile, intent: ProjectIntent) {
    this.buildGraph(spec, intent);
  }

  private buildGraph(spec: SpecFile, intent: ProjectIntent): void {
    // Add sections as feature nodes
    for (const section of spec.sections) {
      this.addNode({
        id: section.id,
        name: section.title,
        type: this.detectNodeType(section),
        dependsOn: [],
        enhances: [],
        sharesDataWith: [],
      });
    }

    // Add connections from intent
    for (const conn of intent.connections) {
      const fromId = this.findNodeId(conn.from);
      const toId = this.findNodeId(conn.to);
      if (fromId && toId) {
        this.addConnection(fromId, toId, conn.type);
      }
    }

    // Add data flow connections
    for (const flow of intent.dataFlow) {
      const fromId = this.findNodeId(flow.from);
      const toId = this.findNodeId(flow.to);
      if (fromId && toId) {
        this.addConnection(fromId, toId, "shares-data");
      }
    }
  }

  private addNode(node: FeatureNode): void {
    this.nodes.set(node.id, node);
  }

  private addConnection(fromId: string, toId: string, type: "requires" | "enhances" | "shares-data" | "triggers"): void {
    const from = this.nodes.get(fromId);
    const to = this.nodes.get(toId);
    if (!from || !to) return;

    switch (type) {
      case "requires":
        from.dependsOn.push(toId);
        break;
      case "enhances":
        from.enhances.push(toId);
        break;
      case "shares-data":
        from.sharesDataWith.push(toId);
        to.sharesDataWith.push(fromId);
        break;
      case "triggers":
        from.enhances.push(toId);
        break;
    }
  }

  private detectNodeType(section: SpecSection): FeatureNode["type"] {
    const title = section.title.toLowerCase();
    const content = section.content.toLowerCase();
    const combined = `${title} ${content}`;

    if (/api|endpoint|route|rest|graphql/i.test(combined)) return "api";
    if (/ui|component|page|layout|view|interface/i.test(combined)) return "ui";
    if (/database|schema|model|entity|migration/i.test(combined)) return "data";
    if (/service|worker|queue|cron|job/i.test(combined)) return "service";
    return "feature";
  }

  private findNodeId(name: string): string | undefined {
    const lower = name.toLowerCase();
    for (const [id, node] of this.nodes) {
      if (node.name.toLowerCase() === lower || id === lower.replace(/\s+/g, "-")) {
        return id;
      }
    }
    return undefined;
  }

  getOrderedFeatures(): FeatureNode[] {
    // Topological sort based on dependencies
    const sorted: FeatureNode[] = [];
    const visited = new Set<string>();

    const visit = (node: FeatureNode) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);

      for (const depId of node.dependsOn) {
        const dep = this.nodes.get(depId);
        if (dep) visit(dep);
      }

      sorted.push(node);
    };

    for (const node of this.nodes.values()) {
      visit(node);
    }

    return sorted;
  }

  getNodes(): FeatureNode[] {
    return Array.from(this.nodes.values());
  }

  getConnections(): Array<{ from: string; to: string; type: string }> {
    const connections: Array<{ from: string; to: string; type: string }> = [];

    for (const node of this.nodes.values()) {
      for (const depId of node.dependsOn) {
        connections.push({ from: node.id, to: depId, type: "requires" });
      }
      for (const enhId of node.enhances) {
        connections.push({ from: node.id, to: enhId, type: "enhances" });
      }
      for (const shareId of node.sharesDataWith) {
        connections.push({ from: node.id, to: shareId, type: "shares-data" });
      }
    }

    return connections;
  }
}
