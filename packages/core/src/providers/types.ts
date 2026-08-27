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

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  model: string;
  messages: ChatTurn[];
  maxOutput: number;
  system?: string;
  signal?: AbortSignal;
};

export type StopReason = "end" | "tool_use" | "max_tokens" | "abort";

export type StreamEvent =
  | { type: "text"; text: string }
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
