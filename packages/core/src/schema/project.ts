import { z } from "zod";
import { INSTALL_PROFILES } from "./skill.js";

export const AUTONOMY_MODES = ["guided", "balanced", "autonomous", "audit"] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export const PROJECT_SCHEMA_ID = "steward.project.v1";

export const ProjectBrainConfig = z.object({
  schema: z.literal(PROJECT_SCHEMA_ID).default(PROJECT_SCHEMA_ID),
  name: z.string().min(1).max(120),
  description: z.string().default(""),
  createdAt: z.string().default(() => new Date().toISOString()),
  profile: z.enum(INSTALL_PROFILES).default("builder"),
  autonomy: z.enum(AUTONOMY_MODES).default("balanced"),
  stack: z.array(z.string()).default([]),
  conventions: z.array(z.string()).default([]),
});

export type ProjectBrain = z.infer<typeof ProjectBrainConfig>;
