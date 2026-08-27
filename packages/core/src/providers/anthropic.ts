import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicUsageLike } from "./usage.js";
import { mergeUsage, missingUsage, normalizeAnthropicUsage } from "./usage.js";
import type { ChatRequest, LLMProvider, StopReason, StreamEvent } from "./types.js";

export type AnthropicLikeEvent =
  | { type: "message_start"; message: { usage?: AnthropicUsageLike } }
  | { type: "content_block_delta"; delta: { type: "text_delta"; text: string } | { type: string } }
  | {
      type: "message_delta";
      usage?: AnthropicUsageLike;
      delta?: { stop_reason?: string | null };
    }
  | { type: "message_stop" };

export type AnthropicStreamParams = {
  model: string;
  max_tokens: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  system?: string;
};

export type AnthropicClientLike = {
  stream(params: AnthropicStreamParams, signal?: AbortSignal): AsyncIterable<AnthropicLikeEvent>;
};

function stopReason(raw: string | null | undefined): StopReason {
  if (raw === "tool_use") return "tool_use";
  if (raw === "max_tokens") return "max_tokens";
  return "end";
}

export async function* mapAnthropicStream(
  events: AsyncIterable<AnthropicLikeEvent>,
  signal?: AbortSignal,
): AsyncIterable<StreamEvent> {
  let usage = undefined as ReturnType<typeof missingUsage> | undefined;
  let stop: StopReason = "end";
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
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const text = "text" in event.delta ? event.delta.text : "";
        if (text) yield { type: "text", text };
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
  const finalUsage = usage ?? missingUsage();
  yield { type: "usage", usage: finalUsage };
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
      const stream = client.messages.stream(request as never, { signal });
      for await (const event of stream) {
        const mapped = asLike(event as AnthropicLikeEvent);
        if (mapped) yield mapped;
      }
    },
  };
}

function asLike(event: AnthropicLikeEvent | { type: string; [k: string]: unknown }): AnthropicLikeEvent | undefined {
  if (event.type === "message_start" || event.type === "message_delta" || event.type === "message_stop") {
    return event as AnthropicLikeEvent;
  }
  if (event.type === "content_block_delta") return event as AnthropicLikeEvent;
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
      messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
    };
    if (request.system !== undefined) params.system = request.system;
    yield* mapAnthropicStream(this.client.stream(params, request.signal), request.signal);
  }
}
