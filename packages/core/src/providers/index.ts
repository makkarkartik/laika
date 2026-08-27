import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import type { LLMProvider, ProviderId } from "./types.js";

export function createProvider(id: ProviderId, apiKey: string): LLMProvider {
  if (id === "anthropic") return new AnthropicProvider({ apiKey });
  return new OpenAIProvider({ apiKey });
}

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
  ChatRequest,
  ChatTurn,
  LLMProvider,
  ModelCatalog,
  ModelEntry,
  ProviderId,
  ResolvedModel,
  StreamEvent,
  UserModelOverride,
} from "./types.js";
