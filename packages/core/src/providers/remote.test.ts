import { describe, expect, it } from "vitest";
import { isOpenAiChatModel, listProviderModels, mergeRemoteCatalog, prettyModelId } from "./remote.js";
import type { ModelCatalog } from "./types.js";

const shipped: ModelCatalog = {
  models: [
    {
      id: "claude-sonnet-4-5",
      provider: "anthropic",
      label: "Claude Sonnet 4.5",
      contextWindow: 200000,
      maxOutput: 64000,
      supportsNativeTools: true,
      supportsParallelToolCalls: true,
      supportsImages: true,
      supportsCaching: true,
      roles: ["main"],
      pricing: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    },
  ],
};

function jsonOk(body: unknown) {
  return async () =>
    ({
      ok: true,
      status: 200,
      json: async () => body,
    }) as const;
}

describe("remote models", () => {
  it("lists Anthropic models from the API", async () => {
    const models = await listProviderModels("anthropic", "sk-ant-test", jsonOk({
      data: [{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" }, { id: "claude-opus-4-1", display_name: "Claude Opus 4.1" }],
      has_more: false,
    }));
    expect(models.map((row) => row.id)).toEqual(["claude-sonnet-4-5", "claude-opus-4-1"]);
  });

  it("lists OpenAI chat models and drops embeddings", async () => {
    const models = await listProviderModels("openai", "sk-test", jsonOk({
      data: [{ id: "gpt-4.1" }, { id: "gpt-4o" }, { id: "text-embedding-3-large" }, { id: "whisper-1" }],
    }));
    expect(models.map((row) => row.id)).toEqual(["gpt-4.1", "gpt-4o"]);
  });

  it("keeps shipped metadata when merging a known id", () => {
    const merged = mergeRemoteCatalog(shipped, [
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic" },
      { id: "claude-opus-4-1", label: "Claude Opus 4.1", provider: "anthropic" },
    ]);
    expect(merged.models[0]?.pricing.input).toBe(3);
    expect(merged.models[1]?.id).toBe("claude-opus-4-1");
    expect(merged.models[1]?.pricing.input).toBe(0);
  });

  it("unions models from both providers", () => {
    const merged = mergeRemoteCatalog(shipped, [
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic" },
      { id: "gpt-4.1", label: "GPT 4.1", provider: "openai" },
    ]);
    expect(merged.models.map((model) => model.provider)).toEqual(["anthropic", "openai"]);
  });

  it("classifies OpenAI ids", () => {
    expect(isOpenAiChatModel("gpt-4.1-mini")).toBe(true);
    expect(isOpenAiChatModel("o3-mini")).toBe(true);
    expect(isOpenAiChatModel("text-embedding-3-small")).toBe(false);
    expect(prettyModelId("gpt-4.1-mini")).toBe("GPT 4.1 Mini");
  });
});
