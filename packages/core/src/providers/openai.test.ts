import { describe, expect, it } from "vitest";
import { mapOpenAIStream, OpenAIProvider, type OpenAILikeChunk } from "./openai.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

async function* chunks(items: OpenAILikeChunk[]): AsyncIterable<OpenAILikeChunk> {
  for (const item of items) yield item;
}

describe("OpenAI adapter", () => {
  it("streams text and reads usage from the final chunk", async () => {
    const out = await collect(
      mapOpenAIStream(
        chunks([
          { choices: [{ delta: { content: "Hello" } }] },
          { choices: [{ delta: { content: "!" }, finish_reason: "stop" }] },
          {
            choices: [],
            usage: { prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 4 } },
          },
        ]),
      ),
    );
    expect(out.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.text : "")).join("")).toBe(
      "Hello!",
    );
    expect(out.find((e) => e.type === "usage")).toEqual({
      type: "usage",
      usage: { input: 6, output: 2, cacheRead: 4, cacheWrite: 0, estimated: false },
    });
  });

  it("marks missing usage as estimated", async () => {
    const out = await collect(mapOpenAIStream(chunks([{ choices: [{ delta: { content: "x" }, finish_reason: "stop" }] }])));
    expect(out.find((e) => e.type === "usage")).toMatchObject({ usage: { estimated: true } });
  });

  it("forwards model, system, and maxOutput", async () => {
    let captured: unknown;
    const provider = new OpenAIProvider({
      client: {
        async *stream(params) {
          captured = params;
        },
      },
    });
    await collect(
      provider.complete({
        model: "gpt-4.1",
        messages: [{ role: "user", content: "hi" }],
        maxOutput: 128,
        system: "You are Laika.",
      }),
    );
    expect(captured).toEqual({
      model: "gpt-4.1",
      max_tokens: 128,
      messages: [
        { role: "system", content: "You are Laika." },
        { role: "user", content: "hi" },
      ],
    });
  });
});
