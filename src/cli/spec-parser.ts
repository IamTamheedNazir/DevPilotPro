// DevPilot CLI - Spec Parser & Validator
// Parses markdown/YAML spec files into structured data

import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import { SpecFile, SpecMetadata, SpecSection } from "./types.js";

export class SpecParser {
  private filePath: string;
  private content: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    if (!fs.existsSync(filePath)) {
      throw new Error(`Spec file not found: ${filePath}`);
    }
    this.content = fs.readFileSync(filePath, "utf-8");
  }

  parse(): SpecFile {
    const ext = path.extname(this.filePath).toLowerCase();

    if (ext === ".yaml" || ext === ".yml") {
      return this.parseYaml();
    }

    return this.parseMarkdown();
  }

  private parseYaml(): SpecFile {
    const data = yaml.load(this.content) as Record<string, unknown>;

    if (!data || typeof data !== "object") {
      throw new Error("Invalid YAML spec file");
    }

    const metadata: SpecMetadata = {
      name: (data.name as string) || path.basename(this.filePath, path.extname(this.filePath)),
      description: (data.description as string) || "",
      version: (data.version as string) || "1.0.0",
      author: data.author as string,
      tags: data.tags as string[],
      createdAt: new Date().toISOString(),
    };

    const sections: SpecSection[] = [];

    if (data.sections && Array.isArray(data.sections)) {
      for (const section of data.sections as Record<string, unknown>[]) {
        sections.push({
          id: (section.id as string) || sections.length.toString(),
          title: (section.title as string) || "Untitled",
          content: (section.content as string) || "",
          subsections: this.parseSubsections(section.subsections as Record<string, unknown>[]),
        });
      }
    }

    return {
      metadata,
      overview: (data.overview as string) || "",
      sections,
      requirements: data.requirements as string[],
      constraints: data.constraints as string[],
      examples: data.examples as string[],
    };
  }

  private parseSubsections(subs: Record<string, unknown>[] | undefined): SpecSection[] | undefined {
    if (!subs || !Array.isArray(subs)) return undefined;
    return subs.map((sub, i) => ({
      id: (sub.id as string) || i.toString(),
      title: (sub.title as string) || "Untitled",
      content: (sub.content as string) || "",
    }));
  }

  private parseMarkdown(): SpecFile {
    const lines = this.content.split("\n");
    const metadata: SpecMetadata = {
      name: "",
      description: "",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
    };
    const sections: SpecSection[] = [];
    const requirements: string[] = [];
    const constraints: string[] = [];
    const examples: string[] = [];

    let currentSection: SpecSection | null = null;
    let currentSubsection: SpecSection | null = null;
    let inFrontmatter = false;
    let frontmatterLines: string[] = [];
    let collectingList: "requirements" | "constraints" | "examples" | null = null;

    for (const line of lines) {
      // Handle YAML frontmatter
      if (line.trim() === "---") {
        if (!inFrontmatter && frontmatterLines.length === 0) {
          inFrontmatter = true;
          continue;
        }
        if (inFrontmatter) {
          inFrontmatter = false;
          const frontmatter = yaml.load(frontmatterLines.join("\n")) as Record<string, unknown>;
          if (frontmatter) {
            metadata.name = (frontmatter.name as string) || metadata.name;
            metadata.description = (frontmatter.description as string) || metadata.description;
            metadata.version = (frontmatter.version as string) || metadata.version;
            metadata.author = frontmatter.author as string;
            metadata.tags = frontmatter.tags as string[];
          }
          frontmatterLines = [];
          continue;
        }
      }

      if (inFrontmatter) {
        frontmatterLines.push(line);
        continue;
      }

      // Parse headings
      const h1Match = line.match(/^#\s+(.+)/);
      const h2Match = line.match(/^##\s+(.+)/);
      const h3Match = line.match(/^###\s+(.+)/);

      if (h1Match) {
        if (!metadata.name) metadata.name = h1Match[1].trim();
        continue;
      }

      if (h2Match) {
        if (currentSection && currentSubsection) {
          currentSection.subsections = currentSection.subsections || [];
          currentSection.subsections.push(currentSubsection);
          currentSubsection = null;
        }
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          id: h2Match[1].trim().toLowerCase().replace(/\s+/g, "-"),
          title: h2Match[1].trim(),
          content: "",
        };
        collectingList = null;
        continue;
      }

      if (h3Match && currentSection) {
        if (currentSubsection) {
          currentSection.subsections = currentSection.subsections || [];
          currentSection.subsections.push(currentSubsection);
        }
        currentSubsection = {
          id: h3Match[1].trim().toLowerCase().replace(/\s+/g, "-"),
          title: h3Match[1].trim(),
          content: "",
        };
        collectingList = null;
        continue;
      }

      // Detect list sections
      const lowerLine = line.toLowerCase().trim();
      if (lowerLine.startsWith("## requirements") || lowerLine.startsWith("##功能")) {
        collectingList = "requirements";
        continue;
      }
      if (lowerLine.startsWith("## constraints") || lowerLine.startsWith("## constraints")) {
        collectingList = "constraints";
        continue;
      }
      if (lowerLine.startsWith("## examples")) {
        collectingList = "examples";
        continue;
      }

      // Collect list items
      const listMatch = line.match(/^\s*[-*]\s+(.+)/);
      if (listMatch && collectingList) {
        const item = listMatch[1].trim();
        switch (collectingList) {
          case "requirements":
            requirements.push(item);
            break;
          case "constraints":
            constraints.push(item);
            break;
          case "examples":
            examples.push(item);
            break;
        }
        continue;
      }

      // Reset collecting if we hit a non-list line
      if (collectingList && line.trim() && !listMatch) {
        collectingList = null;
      }

      // Append content to current section
      if (currentSubsection) {
        currentSubsection.content += line + "\n";
      } else if (currentSection) {
        currentSection.content += line + "\n";
      } else if (!metadata.description && line.trim()) {
        metadata.description = line.trim();
      }
    }

    // Push remaining sections
    if (currentSection && currentSubsection) {
      currentSection.subsections = currentSection.subsections || [];
      currentSection.subsections.push(currentSubsection);
    }
    if (currentSection) {
      sections.push(currentSection);
    }

    return {
      metadata,
      overview: metadata.description,
      sections,
      requirements: requirements.length > 0 ? requirements : undefined,
      constraints: constraints.length > 0 ? constraints : undefined,
      examples: examples.length > 0 ? examples : undefined,
    };
  }

  validate(spec: SpecFile): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required fields
    if (!spec.metadata.name) {
      errors.push({ field: "metadata.name", message: "Spec name is required" });
    }
    if (!spec.metadata.description && !spec.overview) {
      errors.push({ field: "metadata.description", message: "Spec description is required" });
    }
    if (spec.sections.length === 0) {
      errors.push({ field: "sections", message: "At least one section is required" });
    }

    // Warnings
    if (!spec.metadata.version) {
      warnings.push({ field: "metadata.version", message: "Version defaults to 1.0.0" });
    }
    if (!spec.requirements || spec.requirements.length === 0) {
      warnings.push({ field: "requirements", message: "No requirements section found" });
    }
    if (!spec.constraints || spec.constraints.length === 0) {
      warnings.push({ field: "constraints", message: "No constraints section found" });
    }

    // Section validation
    for (const section of spec.sections) {
      if (!section.title) {
        errors.push({ field: `section.${section.id}`, message: "Section title is required" });
      }
      if (!section.content.trim() && (!section.subsections || section.subsections.length === 0)) {
        warnings.push({
          field: `section.${section.id}`,
          message: `Section "${section.title}" has no content`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export function createSampleSpec(): string {
  return `---
name: my-awesome-app
description: A full-stack web application for task management
version: 1.0.0
author: Your Name
tags:
  - web
  - productivity
  - tasks
---

# My Awesome App

A modern, full-stack task management application built with TypeScript and React.

## Overview

This application allows users to create, manage, and track their tasks with a beautiful, intuitive interface. It supports real-time collaboration, drag-and-drop organization, and integrations with popular tools.

## Features

### Core Features
- User authentication and authorization
- Task creation, editing, and deletion
- Drag-and-drop task organization
- Real-time updates via WebSocket
- Team workspaces

### Advanced Features
- AI-powered task suggestions
- Natural language task creation
- Calendar integration
- Slack notifications
- Custom workflow automation

## Architecture

### Frontend
- React 18 with TypeScript
- Tailwind CSS for styling
- Zustand for state management
- React Query for server state

### Backend
- Node.js with Express
- PostgreSQL database
- Redis for caching
- WebSocket for real-time

## Requirements

- Node.js 18+ and npm/yarn
- PostgreSQL 14+
- Redis 7+
- Modern browser (Chrome, Firefox, Safari, Edge)

## Constraints

- Must work offline with sync capability
- Response time under 200ms for all UI interactions
- Support 10,000+ concurrent users
- GDPR compliant data handling
- Accessible (WCAG 2.1 AA)

## API Design

### REST Endpoints
- \`GET /api/tasks\` - List tasks
- \`POST /api/tasks\` - Create task
- \`PUT /api/tasks/:id\` - Update task
- \`DELETE /api/tasks/:id\` - Delete task

### WebSocket Events
- \`task:created\` - New task created
- \`task:updated\` - Task updated
- \`task:deleted\` - Task deleted

## Examples

- Trello-style kanban boards
- Asana-like timeline views
- Notion-style document tasks
`;
}
