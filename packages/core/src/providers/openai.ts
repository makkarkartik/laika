import OpenAI from "openai";
import type { OpenAIUsageLike } from "./usage.js";
import { mergeUsage, missingUsage, normalizeOpenAIUsage } from "./usage.js";
import type { ChatRequest, LLMProvider, StopReason, StreamEvent } from "./types.js";

export type OpenAILikeChunk = {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: OpenAIUsageLike | null;
};

export type OpenAIStreamParams = {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  max_tokens: number;
};

export type OpenAIClientLike = {
  stream(params: OpenAIStreamParams, signal?: AbortSignal): AsyncIterable<OpenAILikeChunk>;
};

function stopReason(raw: string | null | undefined): StopReason {
  if (raw === "tool_calls") return "tool_use";
  if (raw === "length") return "max_tokens";
  return "end";
}

export async function* mapOpenAIStream(
  chunks: AsyncIterable<OpenAILikeChunk>,
  signal?: AbortSignal,
): AsyncIterable<StreamEvent> {
  let usage = undefined as ReturnType<typeof missingUsage> | undefined;
  let stop: StopReason = "end";
  try {
    for await (const chunk of chunks) {
      if (signal?.aborted) {
        yield { type: "done", stopReason: "abort" };
        return;
      }
      const choice = chunk.choices?.[0];
      const text = choice?.delta?.content;
      if (text) yield { type: "text", text };
      if (choice?.finish_reason) stop = stopReason(choice.finish_reason);
      if (chunk.usage) usage = mergeUsage(usage, normalizeOpenAIUsage(chunk.usage));
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

function sdkClient(apiKey: string): OpenAIClientLike {
  return {
    async *stream(params, signal) {
      const client = new OpenAI({ apiKey });
      const stream = await client.chat.completions.create(
        {
          model: params.model,
          messages: params.messages,
          max_tokens: params.max_tokens,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      );
      for await (const chunk of stream) yield chunk as OpenAILikeChunk;
    },
  };
}

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai" as const;
  private readonly client: OpenAIClientLike;

  constructor(opts: { apiKey: string } | { client: OpenAIClientLike }) {
    this.client = "client" in opts ? opts.client : sdkClient(opts.apiKey);
  }

  async *complete(request: ChatRequest): AsyncIterable<StreamEvent> {
    const messages: OpenAIStreamParams["messages"] = [];
    if (request.system !== undefined) messages.push({ role: "system", content: request.system });
    for (const message of request.messages) {
      messages.push({ role: message.role, content: message.content });
    }
    yield* mapOpenAIStream(
      this.client.stream(
        { model: request.model, messages, max_tokens: request.maxOutput },
        request.signal,
      ),
      request.signal,
    );
  }
}
