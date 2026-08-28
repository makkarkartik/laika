export type ProviderId = "anthropic" | "openai";

export type ModelRole = "main" | "utility" | "intake";

export type Pricing = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type CanonicalUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  estimated: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolUseId: string; name: string; content: string; isError?: boolean };

/** @deprecated Use ChatMessage. Kept for call sites that only send plain turns. */
export type ChatTurn = Extract<ChatMessage, { role: "user" | "assistant" }>;

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  maxOutput: number;
  system?: string;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
};

export type StopReason = "end" | "tool_use" | "max_tokens" | "abort";

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; usage: CanonicalUsage }
  | { type: "done"; stopReason: StopReason };

export interface LLMProvider {
  readonly id: ProviderId;
  complete(request: ChatRequest): AsyncIterable<StreamEvent>;
}

export type ModelEntry = {
  id: string;
  provider: string;
  label: string;
  contextWindow: number;
  maxOutput: number;
  supportsNativeTools: boolean;
  supportsParallelToolCalls: boolean;
  supportsImages: boolean;
  supportsCaching: boolean;
  roles: ModelRole[];
  pricing: Pricing;
};

export type ModelCatalog = {
  models: ModelEntry[];
};

export type UserModelOverride = {
  contextWindow?: number;
  maxOutput?: number;
  pricing?: Partial<Pricing>;
  supportsNativeTools?: boolean;
  supportsParallelToolCalls?: boolean;
  supportsImages?: boolean;
  supportsCaching?: boolean;
};

export type ResolvedModel = ModelEntry;
