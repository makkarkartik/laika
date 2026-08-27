import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyOverride, effectiveWindow, parseCatalog, resolveModel } from "./registry.js";
import type { ModelEntry } from "./types.js";

const shipped = parseCatalog(
  JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../../models/models.json"), "utf8"),
  ),
);

const gpt: ModelEntry = {
  id: "openai-compat",
  provider: "openai",
  label: "Custom GPT",
  contextWindow: 128_000,
  maxOutput: 8_192,
  supportsNativeTools: true,
  supportsParallelToolCalls: true,
  supportsImages: false,
  supportsCaching: false,
  roles: ["main"],
  pricing: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1 },
};

describe("model registry", () => {
  it("parses the shipped models.json catalog", () => {
    expect(shipped.models.map((model) => model.id)).toEqual([
      "claude-sonnet-4-5",
      "gpt-4.1",
      "gpt-4.1-mini",
    ]);
  });

  it("lets a user contextWindow replace a truthy registry default (Cline #12520)", () => {
    const catalog = { models: [gpt] };
    const resolved = resolveModel(catalog, "openai-compat", {
      "openai-compat": { contextWindow: 1_047_576 },
    });
    expect(resolved.contextWindow).toBe(1_047_576);
    expect(resolved.maxOutput).toBe(8_192);
  });

  it("does not clamp a user window to 128k after a truthy registry default", () => {
    const wrongMerge = { ...{ contextWindow: 1_047_576 }, ...gpt };
    expect(wrongMerge.contextWindow).toBe(128_000);
    expect(applyOverride(gpt, { contextWindow: 1_047_576 }).contextWindow).toBe(1_047_576);
  });

  it("honors a smaller user window and maxOutput override", () => {
    const resolved = applyOverride(gpt, { contextWindow: 32_000, maxOutput: 4_096 });
    expect(resolved.contextWindow).toBe(32_000);
    expect(resolved.maxOutput).toBe(4_096);
    expect(effectiveWindow(resolved)).toBe(32_000 - 4_096);
  });

  it("merges pricing field-by-field without dropping unspecified rates", () => {
    const resolved = applyOverride(gpt, { pricing: { input: 0.4 } });
    expect(resolved.pricing).toEqual({ input: 0.4, output: 2, cacheRead: 0.1, cacheWrite: 1 });
  });
});
