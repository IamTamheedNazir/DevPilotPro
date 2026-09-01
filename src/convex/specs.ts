import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  generationStatusValidator,
  projectTypeValidator,
} from "./schema";

// List all specs for the current user
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) return [];
    return await ctx.db
      .query("specs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

// Get a single spec by ID
export const get = query({
  args: { specId: v.id("specs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.specId);
  },
});

// Create a new spec
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    projectType: projectTypeValidator,
    techStack: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Not authenticated");

    const now = Date.now();
    const specId = await ctx.db.insert("specs", {
      userId,
      title: args.title,
      description: args.description,
      projectType: args.projectType,
      techStack: args.techStack,
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    return specId;
  },
});

// Update a spec
export const update = mutation({
  args: {
    specId: v.id("specs"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    projectType: v.optional(projectTypeValidator),
    techStack: v.optional(v.string()),
    status: v.optional(generationStatusValidator),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Not authenticated");

    const spec = await ctx.db.get(args.specId);
    if (!spec || spec.userId !== userId) throw new Error("Not authorized");

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.projectType !== undefined) updates.projectType = args.projectType;
    if (args.techStack !== undefined) updates.techStack = args.techStack;
    if (args.status !== undefined) updates.status = args.status;

    await ctx.db.patch(args.specId, updates);
  },
});

// Delete a spec
export const remove = mutation({
  args: { specId: v.id("specs") },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) throw new Error("Not authenticated");

    const spec = await ctx.db.get(args.specId);
    if (!spec || spec.userId !== userId) throw new Error("Not authorized");

    await ctx.db.delete(args.specId);
  },
});
