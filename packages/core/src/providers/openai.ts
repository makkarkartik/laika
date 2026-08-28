import OpenAI from "openai";
import { parseToolArguments, toOpenAIMessages, toOpenAITools } from "./messages.js";
import type { OpenAIUsageLike } from "./usage.js";
import { mergeUsage, missingUsage, normalizeOpenAIUsage } from "./usage.js";
import type { ChatRequest, LLMProvider, StopReason, StreamEvent, ToolCall } from "./types.js";

export type OpenAILikeChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: OpenAIUsageLike | null;
};

export type OpenAIStreamParams = {
  model: string;
  messages: ReturnType<typeof toOpenAIMessages>;
  max_tokens: number;
  tools?: ReturnType<typeof toOpenAITools>;
};

export type OpenAIClientLike = {
  stream(params: OpenAIStreamParams, signal?: AbortSignal): AsyncIterable<OpenAILikeChunk>;
};

function stopReason(raw: string | null | undefined): StopReason {
  if (raw === "tool_calls") return "tool_use";
  if (raw === "length") return "max_tokens";
  return "end";
}

type Acc = { id: string; name: string; args: string };

export async function* mapOpenAIStream(
  chunks: AsyncIterable<OpenAILikeChunk>,
  signal?: AbortSignal,
): AsyncIterable<StreamEvent> {
  let usage = undefined as ReturnType<typeof missingUsage> | undefined;
  let stop: StopReason = "end";
  const tools = new Map<number, Acc>();
  try {
    for await (const chunk of chunks) {
      if (signal?.aborted) {
        yield { type: "done", stopReason: "abort" };
        return;
      }
      const choice = chunk.choices?.[0];
      const text = choice?.delta?.content;
      if (text) yield { type: "text", text };
      const thinking = choice?.delta?.reasoning_content;
      if (thinking) yield { type: "thinking", text: thinking };
      for (const part of choice?.delta?.tool_calls ?? []) {
        const index = part.index ?? 0;
        const acc = tools.get(index) ?? { id: "", name: "", args: "" };
        if (part.id) acc.id = part.id;
        if (part.function?.name) acc.name = part.function.name;
        if (part.function?.arguments) acc.args += part.function.arguments;
        tools.set(index, acc);
      }
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
  if (stop === "tool_use") {
    for (const acc of [...tools.entries()].sort(([a], [b]) => a - b).map(([, v]) => v)) {
      const call: ToolCall = {
        id: acc.id || acc.name,
        name: acc.name,
        input: parseToolArguments(acc.args),
      };
      yield { type: "tool_call", call };
    }
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
      const stream = (await client.chat.completions.create(
        {
          model: params.model,
          messages: params.messages as never,
          max_tokens: params.max_tokens,
          stream: true,
          stream_options: { include_usage: true },
          ...(params.tools ? { tools: params.tools } : {}),
        },
        { signal },
      )) as AsyncIterable<OpenAILikeChunk>;
      for await (const chunk of stream) yield chunk;
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
    const params: OpenAIStreamParams = {
      model: request.model,
      messages: toOpenAIMessages(request.system, request.messages),
      max_tokens: request.maxOutput,
    };
    const tools = toOpenAITools(request.tools);
    if (tools !== undefined) params.tools = tools;
    yield* mapOpenAIStream(
      this.client.stream(params, request.signal),
      request.signal,
    );
  }
}
