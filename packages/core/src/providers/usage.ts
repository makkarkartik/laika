import { z } from "zod";
import type { CanonicalUsage, Pricing } from "./types.js";

export const MISSING_USAGE_WARNING =
  "Provider omitted token usage; counts are estimated, not anchored.";

export const canonicalUsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  estimated: z.boolean(),
});

export function missingUsage(): CanonicalUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estimated: true };
}

export type AnthropicUsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export function normalizeAnthropicUsage(usage: AnthropicUsageLike | undefined): CanonicalUsage {
  if (!usage) return missingUsage();
  if (usage.input_tokens === undefined && usage.output_tokens === undefined) return missingUsage();
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    estimated: false,
  };
}

export type OpenAIUsageLike = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};

export function normalizeOpenAIUsage(usage: OpenAIUsageLike | undefined | null): CanonicalUsage {
  if (!usage) return missingUsage();
  if (usage.prompt_tokens === undefined && usage.completion_tokens === undefined) return missingUsage();
  const prompt = usage.prompt_tokens ?? 0;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    input: Math.max(0, prompt - cached),
    output: usage.completion_tokens ?? 0,
    cacheRead: cached,
    cacheWrite: 0,
    estimated: false,
  };
}

export function mergeUsage(prev: CanonicalUsage | undefined, next: CanonicalUsage): CanonicalUsage {
  if (!prev || prev.estimated) return next;
  if (next.estimated) return prev;
  return {
    input: next.input > 0 ? next.input : prev.input,
    output: next.output > 0 ? next.output : prev.output,
    cacheRead: next.cacheRead > 0 ? next.cacheRead : prev.cacheRead,
    cacheWrite: next.cacheWrite > 0 ? next.cacheWrite : prev.cacheWrite,
    estimated: false,
  };
}

/** Pricing is USD per million tokens, matching models.json. */
export function costUsd(usage: CanonicalUsage, pricing: Pricing): number {
  return (
    (usage.input / 1_000_000) * pricing.input +
    (usage.output / 1_000_000) * pricing.output +
    (usage.cacheRead / 1_000_000) * pricing.cacheRead +
    (usage.cacheWrite / 1_000_000) * pricing.cacheWrite
  );
}
