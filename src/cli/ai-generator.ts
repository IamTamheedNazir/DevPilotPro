// DevPilot CLI - AI Spec Generator
// Generates detailed specs from a simple prompt using OpenAI API

import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "./config.js";

interface AISpecResponse {
  name: string;
  description: string;
  version: string;
  sections: Array<{
    title: string;
    content: string;
    subsections?: Array<{ title: string; content: string }>;
  }>;
  requirements: string[];
  constraints: string[];
}

const SPEC_SYSTEM_PROMPT = `You are an expert software architect and technical writer. Given a brief project idea, you generate a complete, detailed project specification in markdown format.

Your output MUST be valid markdown with YAML frontmatter. Follow this exact structure:

---
name: <kebab-case-project-name>
description: <one-line description>
version: 1.0.0
tags: [<relevant-tags>]
---

# <Project Name>

<2-3 sentence overview>

## Features

### Core Features
<list of 3-5 core features as bullet points>

### Advanced Features
<list of 3-5 advanced features as bullet points>

## Architecture

### Frontend
<frontend tech stack and approach>

### Backend
<backend tech stack and approach>

### Database
<database design overview>

## API Design
<REST or GraphQL endpoints>

## Requirements
<list of technical requirements>

## Constraints
<list of non-functional requirements: performance, security, accessibility, etc.>

## User Stories
<3-5 key user stories as bullet points>

Make the spec detailed enough that a coding agent could implement it.
Be specific about technologies, patterns, and best practices.
Include realistic constraints and requirements.`;

export class AISpecGenerator {
  private apiKey: string;

  constructor() {
    const config = loadConfig();
    this.apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || "";

    if (!this.apiKey) {
      throw new Error(
        "OpenAI API key not found. Set OPENAI_API_KEY env variable or run:\n" +
          "  devpilot config --openai-key <your-key>"
      );
    }
  }

  async generate(prompt: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SPEC_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Generate a complete project specification for: ${prompt}\n\nMake it detailed, specific, and actionable. Include realistic tech stacks, architecture decisions, and constraints.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content returned from OpenAI API");
    }

    return content;
  }

  async generateAndSave(prompt: string, outputDir: string): Promise<string> {
    console.log("\n  🤖 Generating spec with AI...\n");

    const specContent = await this.generate(prompt);

    // Extract name from frontmatter or prompt
    const nameMatch = specContent.match(/^name:\s*(.+)$/m);
    const name = nameMatch
      ? nameMatch[1].trim()
      : prompt
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

    const filePath = path.join(outputDir, `${name}.spec.md`);
    fs.writeFileSync(filePath, specContent);

    console.log(`  ✅ AI-generated spec saved to: ${filePath}`);
    return filePath;
  }
}

export function createAISpecFromPrompt(prompt: string): string {
  // Offline fallback: generate a structured spec from the prompt
  const name = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `---
name: ${name}
description: ${prompt}
version: 1.0.0
tags: [generated]
---

# ${name}

${prompt}

## Features

### Core Features
- Implement the core functionality described above
- User interface with intuitive navigation
- Data persistence and state management
- Error handling and validation

### Advanced Features
- Real-time updates and notifications
- Search and filtering capabilities
- Export and sharing functionality
- Performance optimization

## Architecture

### Frontend
- Modern UI framework (React, Vue, or Svelte)
- Component-based architecture
- Responsive design with mobile support
- State management solution

### Backend
- RESTful API or GraphQL
- Authentication and authorization
- Rate limiting and caching
- Logging and monitoring

### Database
- Relational or NoSQL database
- Proper indexing and migrations
- Backup and recovery strategy

## API Design

### Endpoints
- \`GET /api/resource\` - List resources
- \`POST /api/resource\` - Create resource
- \`PUT /api/resource/:id\` - Update resource
- \`DELETE /api/resource/:id\` - Delete resource

## Requirements

- Node.js 18+ or Python 3.10+
- Modern browser (Chrome, Firefox, Safari, Edge)
- Network access for API calls

## Constraints

- Response time under 200ms
- Support 1000+ concurrent users
- Mobile-responsive design
- Accessible (WCAG 2.1 AA)

## User Stories

- As a user, I can create and manage my data
- As a user, I can search and filter content
- As a user, I can export my data
- As a user, I can collaborate with others
`;
}
