import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// Spec generation status
export const GENERATION_STATUS = {
  DRAFT: "draft",
  ANALYZING: "analyzing",
  PLANNING: "planning",
  GENERATING: "generating",
  READY: "ready",
  PUSHED: "pushed",
  FAILED: "failed",
} as const;

export const generationStatusValidator = v.union(
  v.literal(GENERATION_STATUS.DRAFT),
  v.literal(GENERATION_STATUS.ANALYZING),
  v.literal(GENERATION_STATUS.PLANNING),
  v.literal(GENERATION_STATUS.GENERATING),
  v.literal(GENERATION_STATUS.READY),
  v.literal(GENERATION_STATUS.PUSHED),
  v.literal(GENERATION_STATUS.FAILED),
);
export type GenerationStatus = Infer<typeof generationStatusValidator>;

// Project types
export const PROJECT_TYPES = {
  REACT: "react",
  NEXTJS: "nextjs",
  VITE: "vite",
  PYTHON: "python",
  GO: "go",
  FULLSTACK: "fullstack",
} as const;

export const projectTypeValidator = v.union(
  v.literal(PROJECT_TYPES.REACT),
  v.literal(PROJECT_TYPES.NEXTJS),
  v.literal(PROJECT_TYPES.VITE),
  v.literal(PROJECT_TYPES.PYTHON),
  v.literal(PROJECT_TYPES.GO),
  v.literal(PROJECT_TYPES.FULLSTACK),
);
export type ProjectType = Infer<typeof projectTypeValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Specs — the core input that drives project generation
    specs: defineTable({
      userId: v.string(), // owner
      title: v.string(), // human-readable name
      description: v.string(), // the spec content (markdown)
      projectType: projectTypeValidator, // target framework/language
      techStack: v.optional(v.string()), // additional tech preferences
      status: generationStatusValidator, // current lifecycle status
      version: v.number(), // spec version for iteration tracking
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status", ["status"]),

    // Projects — generated outputs linked to a spec
    projects: defineTable({
      userId: v.string(),
      specId: v.id("specs"),
      name: v.string(), // repo/project name
      description: v.optional(v.string()),
      status: generationStatusValidator,
      githubRepo: v.optional(v.string()), // github owner/repo
      githubUrl: v.optional(v.string()), // full clone URL
      fileCount: v.optional(v.number()),
      generatedAt: v.optional(v.number()),
      pushedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_spec", ["specId"]),

    // Generation runs — tracks each generation attempt
    generationRuns: defineTable({
      specId: v.id("specs"),
      projectId: v.optional(v.id("projects")),
      status: generationStatusValidator,
      plan: v.optional(v.string()), // the generated implementation plan
      tasks: v.optional(v.array(v.string())), // breakdown tasks
      error: v.optional(v.string()),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
    })
      .index("by_spec", ["specId"])
      .index("by_project", ["projectId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
