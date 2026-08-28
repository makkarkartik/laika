import { z } from "zod";
import type { Policy } from "./types.js";

export const policySchema = z.object({
  autonomy: z.enum(["manual", "guarded", "autonomous"]).default("guarded"),
  allowCommands: z.array(z.string()).default([
    "git status",
    "git diff",
    "git log",
    "git show",
    "pnpm test*",
    "pnpm typecheck",
    "pnpm lint",
    "npm test*",
    "npx tsc*",
  ]),
  denyCommands: z.array(z.string()).default([]),
  denyPaths: z.array(z.string()).default([".env*", "**/.ssh/**", "**/*.pem", "**/id_rsa*", "**/*.key"]),
  protectedWrite: z.array(z.string()).default([".git/**", ".laika/policy.json", ".laika/rules/**"]),
});

export const DEFAULT_POLICY: Policy = policySchema.parse({});

export function parsePolicy(raw: unknown): Policy {
  return policySchema.parse(raw ?? {});
}
