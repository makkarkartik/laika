import { describe, expect, it } from "vitest";
import { AnthropicProvider, mapAnthropicStream, type AnthropicLikeEvent } from "./anthropic.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

async function* events(items: AnthropicLikeEvent[]): AsyncIterable<AnthropicLikeEvent> {
  for (const item of items) yield item;
}

describe("Anthropic adapter", () => {
  it("streams text and normalizes split input/output usage", async () => {
    const out = await collect(
      mapAnthropicStream(
        events([
          {
            type: "message_start",
            message: {
              usage: { input_tokens: 12, output_tokens: 0, cache_read_input_tokens: 4, cache_creation_input_tokens: 1 },
            },
          },
          { type: "content_block_delta", delta: { type: "text_delta", text: "Hi" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: " there" } },
          { type: "message_delta", usage: { output_tokens: 3 }, delta: { stop_reason: "end_turn" } },
          { type: "message_stop" },
        ]),
      ),
    );
    expect(out.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.text : "")).join("")).toBe(
      "Hi there",
    );
    expect(out.find((e) => e.type === "usage")).toEqual({
      type: "usage",
      usage: { input: 12, output: 3, cacheRead: 4, cacheWrite: 1, estimated: false },
    });
    expect(out.at(-1)).toEqual({ type: "done", stopReason: "end" });
  });

  it("emits estimated usage when the provider reports none", async () => {
    const out = await collect(
      mapAnthropicStream(
        events([
          { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } },
          { type: "message_stop" },
        ]),
      ),
    );
    expect(out.find((e) => e.type === "usage")).toEqual({
      type: "usage",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estimated: true },
    });
  });

  it("emits a tool_call only after the JSON block is complete", async () => {
    const out = await collect(
      mapAnthropicStream(
        events([
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "t1", name: "read_file" },
          },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"pa' } },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'th":"a.ts"}' } },
          { type: "content_block_stop", index: 0 },
          { type: "message_delta", delta: { stop_reason: "tool_use" } },
          { type: "message_stop" },
        ]),
      ),
    );
    expect(out.filter((e) => e.type === "tool_call")).toEqual([
      { type: "tool_call", call: { id: "t1", name: "read_file", input: { path: "a.ts" } } },
    ]);
    expect(out.at(-1)).toEqual({ type: "done", stopReason: "tool_use" });
  });

  it("forwards model and maxOutput through the client", async () => {
    let captured: unknown;
    const provider = new AnthropicProvider({
      client: {
        async *stream(params) {
          captured = params;
        },
      },
    });
    await collect(
      provider.complete({
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "hi" }],
        maxOutput: 256,
        system: "You are Laika.",
      }),
    );
    expect(captured).toEqual({
      model: "claude-sonnet-4-5",
      max_tokens: 256,
      messages: [{ role: "user", content: "hi" }],
      system: "You are Laika.",
    });
  });
});
