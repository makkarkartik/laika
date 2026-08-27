import { z } from "zod";
import type { ModelCatalog, ModelEntry, ResolvedModel, UserModelOverride } from "./types.js";

const pricingSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
});

const modelRoleSchema = z.enum(["main", "utility", "intake"]);

export const modelEntrySchema = z.object({
  id: z.string(),
  provider: z.string(),
  label: z.string(),
  contextWindow: z.number().positive(),
  maxOutput: z.number().positive(),
  supportsNativeTools: z.boolean(),
  supportsParallelToolCalls: z.boolean(),
  supportsImages: z.boolean(),
  supportsCaching: z.boolean(),
  roles: z.array(modelRoleSchema),
  pricing: pricingSchema,
});

export const modelCatalogSchema = z.object({
  models: z.array(modelEntrySchema).min(1),
});

export const userModelOverrideSchema = z.object({
  contextWindow: z.number().positive().optional(),
  maxOutput: z.number().positive().optional(),
  pricing: pricingSchema.partial().optional(),
  supportsNativeTools: z.boolean().optional(),
  supportsParallelToolCalls: z.boolean().optional(),
  supportsImages: z.boolean().optional(),
  supportsCaching: z.boolean().optional(),
});

export const userModelOverridesSchema = z.record(z.string(), userModelOverrideSchema);

export function parseCatalog(raw: unknown): ModelCatalog {
  return modelCatalogSchema.parse(raw);
}

function pick<T>(override: T | undefined, fallback: T): T {
  return override !== undefined ? override : fallback;
}

/**
 * Resolve a model from the shipped registry with user overrides applied.
 * User values always win — never `registry || user` (Cline #12520).
 */
export function resolveModel(
  catalog: ModelCatalog,
  modelId: string,
  overrides: Record<string, UserModelOverride> = {},
): ResolvedModel {
  const entry = catalog.models.find((model) => model.id === modelId);
  if (!entry) throw new Error(`Unknown model: ${modelId}`);
  return applyOverride(entry, overrides[modelId]);
}

export function applyOverride(entry: ModelEntry, override?: UserModelOverride): ResolvedModel {
  const user = override ?? {};
  return {
    ...entry,
    contextWindow: pick(user.contextWindow, entry.contextWindow),
    maxOutput: pick(user.maxOutput, entry.maxOutput),
    supportsNativeTools: pick(user.supportsNativeTools, entry.supportsNativeTools),
    supportsParallelToolCalls: pick(user.supportsParallelToolCalls, entry.supportsParallelToolCalls),
    supportsImages: pick(user.supportsImages, entry.supportsImages),
    supportsCaching: pick(user.supportsCaching, entry.supportsCaching),
    pricing: {
      input: pick(user.pricing?.input, entry.pricing.input),
      output: pick(user.pricing?.output, entry.pricing.output),
      cacheRead: pick(user.pricing?.cacheRead, entry.pricing.cacheRead),
      cacheWrite: pick(user.pricing?.cacheWrite, entry.pricing.cacheWrite),
    },
  };
}

export function effectiveWindow(model: ResolvedModel): number {
  return Math.max(0, model.contextWindow - model.maxOutput);
}
