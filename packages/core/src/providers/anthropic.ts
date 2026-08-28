import Anthropic from "@anthropic-ai/sdk";
import { parseToolArguments, toAnthropicMessages, toAnthropicTools } from "./messages.js";
import type { AnthropicUsageLike } from "./usage.js";
import { mergeUsage, missingUsage, normalizeAnthropicUsage } from "./usage.js";
import type { ChatRequest, LLMProvider, StopReason, StreamEvent, ToolCall } from "./types.js";

export type AnthropicLikeEvent =
  | { type: "message_start"; message: { usage?: AnthropicUsageLike } }
  | {
      type: "content_block_start";
      index?: number;
      content_block: { type: "text" } | { type: "thinking" } | { type: "tool_use"; id: string; name: string };
    }
  | {
      type: "content_block_delta";
      index?: number;
      delta:
        | { type: "text_delta"; text: string }
        | { type: "thinking_delta"; thinking: string }
        | { type: "input_json_delta"; partial_json: string }
        | { type: string };
    }
  | { type: "content_block_stop"; index?: number }
  | {
      type: "message_delta";
      usage?: AnthropicUsageLike;
      delta?: { stop_reason?: string | null };
    }
  | { type: "message_stop" };

export type AnthropicStreamParams = {
  model: string;
  max_tokens: number;
  messages: ReturnType<typeof toAnthropicMessages>;
  system?: string;
  tools?: ReturnType<typeof toAnthropicTools>;
};

export type AnthropicClientLike = {
  stream(params: AnthropicStreamParams, signal?: AbortSignal): AsyncIterable<AnthropicLikeEvent>;
};

function stopReason(raw: string | null | undefined): StopReason {
  if (raw === "tool_use") return "tool_use";
  if (raw === "max_tokens") return "max_tokens";
  return "end";
}

type OpenTool = { index: number; id: string; name: string; json: string };

export async function* mapAnthropicStream(
  events: AsyncIterable<AnthropicLikeEvent>,
  signal?: AbortSignal,
): AsyncIterable<StreamEvent> {
  let usage = undefined as ReturnType<typeof missingUsage> | undefined;
  let stop: StopReason = "end";
  const open = new Map<number, OpenTool>();
  try {
    for await (const event of events) {
      if (signal?.aborted) {
        yield { type: "done", stopReason: "abort" };
        return;
      }
      if (event.type === "message_start") {
        usage = mergeUsage(usage, normalizeAnthropicUsage(event.message.usage));
        continue;
      }
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        open.set(event.index ?? open.size, {
          index: event.index ?? open.size,
          id: event.content_block.id,
          name: event.content_block.name,
          json: "",
        });
        continue;
      }
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta" && "text" in event.delta && event.delta.text) {
          yield { type: "text", text: event.delta.text };
        }
        if (event.delta.type === "thinking_delta" && "thinking" in event.delta && event.delta.thinking) {
          yield { type: "thinking", text: event.delta.thinking };
        }
        if (event.delta.type === "input_json_delta" && "partial_json" in event.delta) {
          const slot = open.get(event.index ?? 0);
          if (slot) slot.json += event.delta.partial_json;
        }
        continue;
      }
      if (event.type === "content_block_stop") {
        const slot = open.get(event.index ?? 0);
        if (slot) {
          const call: ToolCall = {
            id: slot.id,
            name: slot.name,
            input: parseToolArguments(slot.json),
          };
          yield { type: "tool_call", call };
          open.delete(slot.index);
        }
        continue;
      }
      if (event.type === "message_delta") {
        usage = mergeUsage(usage, normalizeAnthropicUsage(event.usage));
        stop = stopReason(event.delta?.stop_reason);
      }
    }
  } catch (err) {
    if (signal?.aborted || isAbort(err)) {
      yield { type: "done", stopReason: "abort" };
      return;
    }
    throw err;
  }
  yield { type: "usage", usage: usage ?? missingUsage() };
  yield { type: "done", stopReason: stop };
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
}

function sdkClient(apiKey: string): AnthropicClientLike {
  return {
    async *stream(params, signal) {
      const client = new Anthropic({ apiKey });
      const request: Record<string, unknown> = {
        model: params.model,
        max_tokens: params.max_tokens,
        messages: params.messages,
      };
      if (params.system !== undefined) request.system = params.system;
      if (params.tools !== undefined) request.tools = params.tools;
      const stream = client.messages.stream(request as never, { signal });
      for await (const event of stream) {
        const mapped = asLike(event as AnthropicLikeEvent);
        if (mapped) yield mapped;
      }
    },
  };
}

function asLike(event: AnthropicLikeEvent | { type: string }): AnthropicLikeEvent | undefined {
  if (
    event.type === "message_start" ||
    event.type === "message_delta" ||
    event.type === "message_stop" ||
    event.type === "content_block_start" ||
    event.type === "content_block_delta" ||
    event.type === "content_block_stop"
  ) {
    return event as AnthropicLikeEvent;
  }
  return undefined;
}

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;
  private readonly client: AnthropicClientLike;

  constructor(opts: { apiKey: string } | { client: AnthropicClientLike }) {
    this.client = "client" in opts ? opts.client : sdkClient(opts.apiKey);
  }

  async *complete(request: ChatRequest): AsyncIterable<StreamEvent> {
    const params: AnthropicStreamParams = {
      model: request.model,
      max_tokens: request.maxOutput,
      messages: toAnthropicMessages(request.messages),
    };
    if (request.system !== undefined) params.system = request.system;
    const tools = toAnthropicTools(request.tools);
    if (tools !== undefined) params.tools = tools;
    yield* mapAnthropicStream(this.client.stream(params, request.signal), request.signal);
  }
}
