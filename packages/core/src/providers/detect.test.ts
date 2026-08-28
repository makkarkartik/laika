import { describe, expect, it } from "vitest";
import { detectProviderFromKey } from "./detect.js";

describe("detectProviderFromKey", () => {
  it("detects Anthropic from sk-ant-", () => {
    expect(detectProviderFromKey("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBe("anthropic");
  });

  it("detects OpenAI from sk- and sk-proj-", () => {
    expect(detectProviderFromKey("sk-abcdefghijklmnopqrstuvwxyz123456")).toBe("openai");
    expect(detectProviderFromKey("sk-proj-abcdefghijklmnopqrstuvwxyz")).toBe("openai");
  });

  it("treats OpenRouter sk-or- as OpenAI-compatible", () => {
    expect(detectProviderFromKey("sk-or-v1-abcdefghijklmnopqrstuvwxyz")).toBe("openai");
  });

  it("returns undefined for unknown shapes", () => {
    expect(detectProviderFromKey("not-a-key")).toBeUndefined();
    expect(detectProviderFromKey("")).toBeUndefined();
  });
});
