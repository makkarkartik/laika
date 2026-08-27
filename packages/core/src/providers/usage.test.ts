import { describe, expect, it } from "vitest";
import { costUsd, missingUsage, normalizeAnthropicUsage, normalizeOpenAIUsage } from "./usage.js";

describe("usage normalization", () => {
  it("maps Anthropic cache fields onto the canonical shape", () => {
    expect(
      normalizeAnthropicUsage({
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 40,
        cache_creation_input_tokens: 10,
      }),
    ).toEqual({
      input: 100,
      output: 20,
      cacheRead: 40,
      cacheWrite: 10,
      estimated: false,
    });
  });

  it("splits OpenAI prompt tokens into uncached input and cache reads", () => {
    expect(
      normalizeOpenAIUsage({
        prompt_tokens: 100,
        completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 40 },
      }),
    ).toEqual({
      input: 60,
      output: 20,
      cacheRead: 40,
      cacheWrite: 0,
      estimated: false,
    });
  });

  it("marks omitted usage as estimated instead of silently substituting zeros as truth", () => {
    expect(normalizeAnthropicUsage(undefined)).toEqual(missingUsage());
    expect(normalizeOpenAIUsage(null)).toEqual(missingUsage());
    expect(missingUsage().estimated).toBe(true);
  });

  it("prices from canonical usage at per-million rates", () => {
    const usd = costUsd(
      { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0, estimated: false },
      { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    );
    expect(usd).toBe(18);
  });
});
