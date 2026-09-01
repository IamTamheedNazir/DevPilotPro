import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { generationStatusValidator } from "./schema";

// List all projects for the current user
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) return [];
    return await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

// Get a single project by ID
export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

// Create a new project entry (called when generation starts)
export const create = mutation({
  args: {
    specId: v.id("specs"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Not authenticated");

    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      userId,
      specId: args.specId,
      name: args.name,
      description: args.description,
      status: "analyzing",
      createdAt: now,
      updatedAt: now,
    });
    return projectId;
  },
});

// Update project status after generation steps
export const updateStatus = mutation({
  args: {
    projectId: v.id("projects"),
    status: generationStatusValidator,
    githubRepo: v.optional(v.string()),
    githubUrl: v.optional(v.string()),
    fileCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) throw new Error("Not authorized");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.status !== undefined) {
      updates.status = args.status;
      if (args.status === "ready") updates.generatedAt = Date.now();
      if (args.status === "pushed") updates.pushedAt = Date.now();
    }
    if (args.githubRepo !== undefined) updates.githubRepo = args.githubRepo;
    if (args.githubUrl !== undefined) updates.githubUrl = args.githubUrl;
    if (args.fileCount !== undefined) updates.fileCount = args.fileCount;

    await ctx.db.patch(args.projectId, updates);
  },
});

// Delete a project
export const remove = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Not authenticated");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== userId) throw new Error("Not authorized");

    await ctx.db.delete(args.projectId);
  },
});
