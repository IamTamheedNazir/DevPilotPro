// SpecForge CLI - Project Generator
// Generates project scaffolding from spec files, with coding agent integration

import * as fs from "fs";
import * as path from "path";
import {
  SpecFile,
  ProjectConfig,
  GeneratedProject,
  GeneratedFile,
  AgentInstruction,
  Agent,
  Framework,
  Language,
} from "./types.js";

export class ProjectGenerator {
  private spec: SpecFile;
  private config: ProjectConfig;
  private outputDir: string;

  constructor(spec: SpecFile, config: ProjectConfig, outputDir: string) {
    this.spec = spec;
    this.config = config;
    this.outputDir = outputDir;
  }

  generate(): GeneratedProject {
    const projectPath = path.join(this.outputDir, this.config.name);

    // Create output directory
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const files: GeneratedFile[] = [];
    const agentInstructions: AgentInstruction[] = [];

    // Generate framework-specific files
    const frameworkFiles = this.generateFrameworkFiles();
    files.push(...frameworkFiles);

    // Generate spec-based files
    const specFiles = this.generateSpecFiles();
    files.push(...specFiles);

    // Generate coding agent instructions
    const agentFiles = this.generateAgentInstructions();
    agentInstructions.push(...agentFiles.instructions);
    files.push(...agentFiles.files);

    // Write all files
    for (const file of files) {
      const filePath = path.join(projectPath, file.path);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, file.content);
    }

    return {
      name: this.config.name,
      path: projectPath,
      framework: this.config.framework,
      files,
      agentInstructions,
      github: this.config.github,
    };
  }

  private generateFrameworkFiles(): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    switch (this.config.framework) {
      case "react":
      case "nextjs":
        files.push(...this.generateReactFiles());
        break;
      case "vue":
        files.push(...this.generateVueFiles());
        break;
      case "svelte":
        files.push(...this.generateSvelteFiles());
        break;
      case "express":
      case "fastify":
        files.push(...this.generateNodeServerFiles());
        break;
      case "django":
        files.push(...this.generateDjangoFiles());
        break;
      case "flask":
      case "python":
        files.push(...this.generateFlaskFiles());
        break;
      case "go":
        files.push(...this.generateGoFiles());
        break;
      case "rust":
        files.push(...this.generateRustFiles());
        break;
      default:
        files.push(...this.generateVanillaFiles());
    }

    return files;
  }

  private generateReactFiles(): GeneratedFile[] {
    const isNext = this.config.framework === "nextjs";
    const files: GeneratedFile[] = [];

    // package.json
    const deps: Record<string, string> = isNext
      ? { next: "^14.0.0", react: "^18.2.0", "react-dom": "^18.2.0" }
      : { react: "^18.2.0", "react-dom": "^18.2.0", vite: "^5.0.0" };

    files.push({
      path: "package.json",
      content: JSON.stringify(
        {
          name: this.config.name,
          version: "0.1.0",
          private: true,
          scripts: isNext
            ? { dev: "next dev", build: "next build", start: "next start" }
            : { dev: "vite", build: "tsc && vite build", preview: "vite preview" },
          dependencies: deps,
          devDependencies: {
            typescript: "^5.3.0",
            "@types/react": "^18.2.0",
            "@types/react-dom": "^18.2.0",
          },
        },
        null,
        2
      ),
      description: "Project dependencies and scripts",
    });

    // tsconfig.json
    files.push({
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2020",
            lib: ["ES2020", "DOM", "DOM.Iterable"],
            module: isNext ? "esnext" : "ESNext",
            skipLibCheck: true,
            moduleResolution: "bundler",
            allowImportingTsExtensions: true,
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: "react-jsx",
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noFallthroughCasesInSwitch: true,
          },
          include: ["src"],
          references: [{ path: "./tsconfig.node.json" }],
        },
        null,
        2
      ),
      description: "TypeScript configuration",
    });

    // .gitignore
    files.push({
      path: ".gitignore",
      content: `node_modules/
dist/
.env
.env.local
.DS_Store
*.log
`,
      description: "Git ignore rules",
    });

    // README.md
    files.push({
      path: "README.md",
      content: `# ${this.config.name}\n\n${this.config.description}\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n## Features\n\n${this.config.features.map((f) => `- ${f}`).join("\n")}\n`,
      description: "Project README",
    });

    // src/index.html or app layout
    if (!isNext) {
      files.push({
        path: "index.html",
        content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${this.config.name}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>`,
        description: "HTML entry point",
      });
    }

    return files;
  }

  private generateVueFiles(): GeneratedFile[] {
    return [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: this.config.name,
            version: "0.1.0",
            private: true,
            scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
            dependencies: { vue: "^3.4.0" },
            devDependencies: { typescript: "^5.3.0", vite: "^5.0.0" },
          },
          null,
          2
        ),
        description: "Project dependencies",
      },
      {
        path: ".gitignore",
        content: "node_modules/\ndist/\n.env\n",
        description: "Git ignore rules",
      },
    ];
  }

  private generateNodeServerFiles(): GeneratedFile[] {
    return [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: this.config.name,
            version: "0.1.0",
            private: true,
            scripts: { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" },
            dependencies: { [this.config.framework]: "^4.0.0" },
            devDependencies: { typescript: "^5.3.0", tsx: "^4.0.0" },
          },
          null,
          2
        ),
        description: "Project dependencies",
      },
      {
        path: "src/index.ts",
        content: `import ${this.config.framework} from "${this.config.framework}";\n\nconst app = ${this.config.framework}();\n\napp.get("/", (req, res) => {\n  res.json({ message: "Hello from ${this.config.name}" });\n});\n\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => {\n  console.log(\`Server running on port \${PORT}\`);\n});\n`,
        description: "Server entry point",
      },
      {
        path: ".gitignore",
        content: "node_modules/\ndist/\n.env\n",
        description: "Git ignore rules",
      },
    ];
  }

  private generateFlaskFiles(): GeneratedFile[] {
    return [
      {
        path: "requirements.txt",
        content: `flask>=3.0.0\npython-dotenv>=1.0.0\n` +
          this.config.features.map((f) => `${f.toLowerCase().replace(/\s+/g, "-")}`).join("\n") + "\n",
        description: "Python dependencies",
      },
      {
        path: "src/app.py",
        content: `"""${this.config.name} - ${this.config.description}"""\n\nfrom flask import Flask, jsonify\n\napp = Flask(__name__)\n\n\n@app.route("/")\ndef index():\n    return jsonify({"message": "Hello from ${this.config.name}"})\n\n\nif __name__ == "__main__":\n    app.run(debug=True, port=5000)\n`,
        description: "Flask application entry point",
      },
      {
        path: ".gitignore",
        content: "__pycache__/\n*.pyc\n.env\nvenv/\ninstance/\n",
        description: "Git ignore rules",
      },
    ];
  }

  private generateDjangoFiles(): GeneratedFile[] {
    return [
      {
        path: "requirements.txt",
        content: `django>=5.0\ndjango-rest-framework>=3.14\npython-dotenv>=1.0.0\n` +
          this.config.features.map((f) => `${f.toLowerCase().replace(/\s+/g, "-")}`).join("\n") + "\n",
        description: "Python dependencies",
      },
      {
        path: `manage.py`,
        content: `#!/usr/bin/env python\n"""Django management script for ${this.config.name}."""\nimport os\nimport sys\n\ndef main():\n    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "${this.config.name}.settings")\n    try:\n        from django.core.management import execute_from_command_line\n    except ImportError as exc:\n        raise ImportError(\n            \"Couldn't import Django. Are you sure it's installed and \"\n            \"available on your PYTHONPATH environment variable?\"\n        ) from exc\n    execute_from_command_line(sys.argv)\n\n\nif __name__ == "__main__":\n    main()\n`,
        description: "Django management script",
      },
      {
        path: `${this.config.name}/__init__.py`,
        content: `"""${this.config.name} - ${this.config.description}"""\n`,
        description: "Django app package",
      },
      {
        path: `${this.config.name}/settings.py`,
        content: `"""Django settings for ${this.config.name}."""\n\nimport os\nfrom pathlib import Path\n\nBASE_DIR = Path(__file__).resolve().parent.parent\nSECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "change-me-in-production")\nDEBUG = os.environ.get("DEBUG", "True") == "True"\nALLOWED_HOSTS = ["*"]\n\nINSTALLED_APPS = [\n    \"django.contrib.admin\",\n    \"django.contrib.auth\",\n    \"django.contrib.contenttypes\",\n    \"django.contrib.sessions\",\n    \"django.contrib.messages\",\n    \"django.contrib.staticfiles\",\n    \"rest_framework\",\n]\n\nMIDDLEWARE = [\n    \"django.middleware.security.SecurityMiddleware\",\n    \"django.contrib.sessions.middleware.SessionMiddleware\",\n    \"django.middleware.common.CommonMiddleware\",\n    \"django.middleware.csrf.CsrfViewMiddleware\",\n    \"django.contrib.auth.middleware.AuthenticationMiddleware\",\n    \"django.contrib.messages.middleware.MessageMiddleware\",\n]\n\nROOT_URLCONF = \"${this.config.name}.urls\"\n\nDATABASES = {\n    \"default\": {\n        \"ENGINE\": \"django.db.backends.sqlite3\",\n        \"NAME\": BASE_DIR / \"db.sqlite3\",\n    }\n}\n\nREST_FRAMEWORK = {\n    \"DEFAULT_PERMISSION_CLASSES\": [\n        \"rest_framework.permissions.AllowAny\",\n    ]\n}\n`,
        description: "Django settings",
      },
      {
        path: `${this.config.name}/urls.py`,
        content: `"""URL configuration for ${this.config.name}."""\nfrom django.contrib import admin\nfrom django.urls import path, include\n\nurlpatterns = [\n    path(\"admin/\", admin.site.urls),\n    path(\"api/\", include(\"${this.config.name}.api.urls\")),\n]\n`,
        description: "Django URL configuration",
      },
      {
        path: ".gitignore",
        content: "__pycache__/\n*.pyc\n.env\nvenv/\n*.sqlite3\nstaticfiles/\n",
        description: "Git ignore rules",
      },
    ];
  }

  private generateSvelteFiles(): GeneratedFile[] {
    return [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: this.config.name,
            version: "0.1.0",
            private: true,
            scripts: {
              dev: "vite dev",
              build: "vite build",
              preview: "vite preview",
            },
            devDependencies: {
              "@sveltejs/kit": "^2.0.0",
              "@sveltejs/vite-plugin-svelte": "^3.0.0",
              svelte: "^4.2.0",
              typescript: "^5.3.0",
              vite: "^5.0.0",
            },
          },
          null,
          2
        ),
        description: "Project dependencies",
      },
      {
        path: "svelte.config.js",
        content: `import adapter from "@sveltejs/adapter-auto";\n\n/** @type {import('@sveltejs/kit').Config} */\nconst config = {\n  kit: {\n    adapter: adapter(),\n  },\n};\n\nexport default config;\n`,
        description: "SvelteKit configuration",
      },
      {
        path: "src/routes/+page.svelte",
        content: `<script lang=\"ts\">\n  let title = "${this.config.name}";\n</script>\n\n<main>\n  <h1>{title}</h1>\n  <p>${this.config.description}</p>\n</main>\n\n<style>\n  main {\n    max-width: 800px;\n    margin: 0 auto;\n    padding: 2rem;\n  }\n</style>\n`,
        description: "Main Svelte page",
      },
      {
        path: ".gitignore",
        content: "node_modules/\n.svelte-kit/\ndist/\n.env\n",
        description: "Git ignore rules",
      },
    ];
  }

  private generateRustFiles(): GeneratedFile[] {
    return [
      {
        path: "Cargo.toml",
        content: `[package]\nname = "${this.config.name}"\nversion = "0.1.0"\nedition = "2021"\ndescription = "${this.config.description}"\n\n[dependencies]\nactix-web = "4"\nactix-rt = "2"\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\ntokio = { version = "1", features = ["full"] }\n`,
        description: "Rust project manifest",
      },
      {
        path: "src/main.rs",
        content: `use actix_web::{web, App, HttpServer, HttpResponse, Responder};\n\nasync fn hello() -> impl Responder {\n    HttpResponse::Ok().json(serde_json::json!({\n        \"message\": \"Hello from ${this.config.name}\"\n    }))\n}\n\n#[actix_web::main]\nasync fn main() -> std::io::Result<()> {\n    println!(\"Server running on http://localhost:8080\");\n    HttpServer::new(|| {\n        App::new()\n            .route(\"/\", web::get().to(hello))\n    })\n    .bind((\"127.0.0.1\", 8080))?\n    .run()\n    .await\n}\n`,
        description: "Rust main entry point",
      },
      {
        path: ".gitignore",
        content: "/target\n.env\n",
        description: "Git ignore rules",
      },
    ];
  }

  private generateGoFiles(): GeneratedFile[] {
    return [
      {
        path: "go.mod",
        content: `module ${this.config.name}\n\ngo 1.21\n`,
        description: "Go module definition",
      },
      {
        path: "main.go",
        content: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from ${this.config.name}")\n}\n`,
        description: "Main entry point",
      },
      {
        path: ".gitignore",
        content: "bin/\n*.exe\n.env\n",
        description: "Git ignore rules",
      },
    ];
  }

  private generateVanillaFiles(): GeneratedFile[] {
    return [
      {
        path: "package.json",
        content: JSON.stringify(
          { name: this.config.name, version: "0.1.0", private: true },
          null,
          2
        ),
        description: "Project metadata",
      },
      {
        path: "index.html",
        content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>${this.config.name}</title>\n</head>\n<body>\n  <h1>${this.config.name}</h1>\n  <p>${this.config.description}</p>\n</body>\n</html>`,
        description: "HTML entry point",
      },
    ];
  }

  private generateSpecFiles(): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Copy spec as documentation
    const specContent = fs.readFileSync(
      path.join(this.outputDir, "..", `${this.config.name}.spec.md`),
      "utf-8"
    ).replace(/\n/g, "\n");

    files.push({
      path: "docs/SPEC.md",
      content: specContent,
      description: "Original spec document",
    });

    // Generate feature breakdown
    if (this.spec.sections.length > 0) {
      const featureDoc = this.spec.sections
        .map((s) => {
          let content = `## ${s.title}\n\n${s.content}`;
          if (s.subsections) {
            content += "\n" + s.subsections.map((sub) => `### ${sub.title}\n\n${sub.content}`).join("\n");
          }
          return content;
        })
        .join("\n\n");

      files.push({
        path: "docs/FEATURES.md",
        content: `# Feature Breakdown\n\n${featureDoc}`,
        description: "Detailed feature documentation",
      });
    }

    // Generate requirements doc
    if (this.spec.requirements && this.spec.requirements.length > 0) {
      files.push({
        path: "docs/REQUIREMENTS.md",
        content: `# Requirements\n\n${this.spec.requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
        description: "Project requirements",
      });
    }

    return files;
  }

  private generateAgentInstructions(): {
    instructions: AgentInstruction[];
    files: GeneratedFile[];
  } {
    const instructions: AgentInstruction[] = [];
    const files: GeneratedFile[] = [];

    for (const agent of this.config.agents) {
      const agentFile = this.getAgentConfigFile(agent);
      const prompt = this.buildAgentPrompt(agent);

      instructions.push({
        agent,
        file: agentFile.path,
        prompt,
      });

      files.push({
        ...agentFile,
        content: agentFile.content + "\n" + prompt,
      });
    }

    return { instructions, files };
  }

  private getAgentConfigFile(agent: Agent): GeneratedFile {
    const configs: Record<Agent, GeneratedFile> = {
      "claude-code": {
        path: ".claude/CLAUDE.md",
        content: `# ${this.config.name}\n\n## Project Overview\n${this.config.description}\n\n`,
        description: "Claude Code project instructions",
      },
      codex: {
        path: "CODEX.md",
        content: `# ${this.config.name}\n\n## Project Overview\n${this.config.description}\n\n`,
        description: "OpenAI Codex instructions",
      },
      cursor: {
        path: ".cursor/rules",
        content: `# ${this.config.name} - Cursor Rules\n\n## Project Overview\n${this.config.description}\n\n`,
        description: "Cursor IDE rules",
      },
      windsurf: {
        path: ".windsurfrules",
        content: `# ${this.config.name} - Windsurf Rules\n\n## Project Overview\n${this.config.description}\n\n`,
        description: "Windsurf IDE rules",
      },
      copilot: {
        path: ".github/copilot-instructions.md",
        content: `# ${this.config.name}\n\n## Project Overview\n${this.config.description}\n\n`,
        description: "GitHub Copilot instructions",
      },
      aider: {
        path: ".aider.conf.yml",
        content: `# ${this.config.name} - Aider Configuration\n\n`,
        description: "Aider configuration",
      },
    };

    return configs[agent];
  }

  private buildAgentPrompt(agent: Agent): string {
    const specSummary = this.spec.sections
      .map((s) => `- ${s.title}: ${s.content.trim().substring(0, 200)}`)
      .join("\n");

    const featureList = this.spec.sections
      .filter((s) => s.title.toLowerCase().includes("feature"))
      .map((s) => {
        const features = s.content
          .split("\n")
          .filter((l) => l.match(/^\s*[-*]/))
          .map((l) => l.replace(/^\s*[-*]\s+/, ""));
        return features.length > 0 ? features : [s.content.trim().substring(0, 100)];
      })
      .flat();

    const constraintsList =
      this.spec.constraints?.map((c) => `- ${c}`).join("\n") || "No specific constraints";

    return `## Implementation Instructions

### Context
This project was generated from a specification. The original spec describes:
${specSummary}

### Features to implement
${featureList.map((f) => `- ${f}`).join("\n")}

### Constraints
${constraintsList}

### Your task
Based on the spec and existing scaffolding, implement the complete application:

1. Set up the project structure with proper TypeScript types
2. Implement core functionality as described in the spec
3. Add proper error handling and validation
4. Include unit tests for critical paths
5. Ensure all features work together seamlessly

### Code style
- Use TypeScript strict mode
- Prefer functional components (React) or clean modules
- Write self-documenting code with clear variable names
- Add JSDoc comments for complex functions
- Follow the project's existing patterns

### What to build
Start with the core modules, then build the UI/API layer, then add integrations.
Focus on making each feature complete and working before moving to the next.
`;
  }
}
