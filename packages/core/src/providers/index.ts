import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import type { LLMProvider, ProviderId } from "./types.js";

export function createProvider(id: ProviderId, apiKey: string): LLMProvider {
  if (id === "anthropic") return new AnthropicProvider({ apiKey });
  return new OpenAIProvider({ apiKey });
}

export { detectProviderFromKey } from "./detect.js";
export { listProviderModels, mergeRemoteCatalog, type RemoteModel } from "./remote.js";
export { AnthropicProvider } from "./anthropic.js";
export { OpenAIProvider } from "./openai.js";
export {
  applyOverride,
  effectiveWindow,
  parseCatalog,
  resolveModel,
  userModelOverridesSchema,
} from "./registry.js";
export { costUsd, MISSING_USAGE_WARNING, missingUsage } from "./usage.js";
export type {
  CanonicalUsage,
  ChatMessage,
  ChatRequest,
  ChatTurn,
  LLMProvider,
  ModelCatalog,
  ModelEntry,
  ProviderId,
  ResolvedModel,
  StreamEvent,
  ToolCall,
  UserModelOverride,
} from "./types.js";
