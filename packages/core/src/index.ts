export {
  hostToWebview,
  parseHostToWebview,
  parseWebviewToHost,
  webviewToHost,
  type HostToWebview,
  type WebviewToHost,
} from "./protocol.js";

export {
  AnthropicProvider,
  applyOverride,
  costUsd,
  createProvider,
  detectProviderFromKey,
  effectiveWindow,
  listProviderModels,
  mergeRemoteCatalog,
  MISSING_USAGE_WARNING,
  missingUsage,
  OpenAIProvider,
  parseCatalog,
  resolveModel,
  userModelOverridesSchema,
  type CanonicalUsage,
  type ChatMessage,
  type ChatRequest,
  type ChatTurn,
  type LLMProvider,
  type ModelCatalog,
  type ModelEntry,
  type ProviderId,
  type RemoteModel,
  type ResolvedModel,
  type StreamEvent,
  type ToolCall,
  type UserModelOverride,
} from "./providers/index.js";

export { runTask, toolSummary } from "./agent/loop.js";
export { classifyTask } from "./agent/classify.js";
export type {
  AgentEvent,
  AgentHost,
  AskUser,
  RunTaskOptions,
  TaskKind,
  TaskState,
  ToolCard,
  ToolResult,
} from "./agent/types.js";

export { TOOL_DEFINITIONS, toolMeta, pathFromArgs, commandFromArgs } from "./tools/catalog.js";

export { evaluateToolCall } from "./policy/engine.js";
export { DEFAULT_POLICY, parsePolicy, policySchema } from "./policy/schema.js";
export { classifyCommand, splitShell } from "./policy/shell.js";
export { globMatch, toPosix } from "./policy/glob.js";
export { inferBuckets, fileKind, type Bucket, type BucketMap } from "./orbit/buckets.js";
export {
  hunksFromReplace,
  hunksFromWrite,
  hunksFromDelete,
  diffLines,
  countHunks,
  splitLines,
  MAX_HUNK_LINES,
  type HunkLine,
} from "./tools/hunks.js";
export type { Autonomy, Policy, PolicyDecision, RiskTier, ToolClass } from "./policy/types.js";
