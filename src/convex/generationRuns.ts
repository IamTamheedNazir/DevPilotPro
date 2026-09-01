import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { generationStatusValidator } from "./schema";

// List generation runs for a spec
export const listBySpec = query({
  args: { specId: v.id("specs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("generationRuns")
      .withIndex("by_spec", (q) => q.eq("specId", args.specId))
      .order("desc")
      .collect();
  },
});

// Create a new generation run
export const create = mutation({
  args: {
    specId: v.id("specs"),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const runId = await ctx.db.insert("generationRuns", {
      specId: args.specId,
      projectId: args.projectId,
      status: "analyzing",
      startedAt: Date.now(),
    });
    return runId;
  },
});

// Update a generation run
export const update = mutation({
  args: {
    runId: v.id("generationRuns"),
    status: v.optional(generationStatusValidator),
    plan: v.optional(v.string()),
    tasks: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {};
    if (args.status !== undefined) {
      updates.status = args.status;
      if (
        args.status === "ready" ||
        args.status === "failed" ||
        args.status === "pushed"
      ) {
        updates.completedAt = Date.now();
      }
    }
    if (args.plan !== undefined) updates.plan = args.plan;
    if (args.tasks !== undefined) updates.tasks = args.tasks;
    if (args.error !== undefined) updates.error = args.error;

    await ctx.db.patch(args.runId, updates);
  },
});
