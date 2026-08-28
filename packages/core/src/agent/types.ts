import type { CanonicalUsage, ChatMessage, LLMProvider, ResolvedModel, ToolCall } from "../providers/types.js";
import type { Policy, RiskTier } from "../policy/types.js";
import type { HunkLine } from "../tools/hunks.js";

export type TaskState =
  | "intake"
  | "contextualize"
  | "planning"
  | "executing"
  | "verifying"
  | "stalled"
  | "delivering"
  | "done";

export type TaskKind = "question" | "edit" | "multi-step";

export type ToolResult = {
  content: string;
  summary: string;
  isError?: boolean;
  mutated?: boolean;
  paths?: string[];
  plus?: number;
  minus?: number;
  created?: boolean;
  deleted?: boolean;
  preview?: string[];
  hunks?: HunkLine[];
  command?: string;
  output?: string;
  exitCode?: number | null;
};

export type ToolCard =
  | { kind: "log"; id: string; text: string; path?: string | undefined }
  | {
      kind: "edit";
      id: string;
      path: string;
      plus: number;
      minus: number;
      created?: boolean | undefined;
      deleted?: boolean | undefined;
      hunks: HunkLine[];
    }
  | {
      kind: "command";
      id: string;
      command: string;
      output: string;
      running?: boolean | undefined;
      exit?: number | null | undefined;
      error?: boolean | undefined;
    };

export interface AgentHost {
  invoke(name: string, args: unknown, signal: AbortSignal): Promise<ToolResult>;
  checkpoint(reason: string): Promise<void>;
  diagnostics(paths: string[]): Promise<string>;
  audit(event: Record<string, unknown>): void;
}

export type AskUser = (request: {
  id: string;
  tool: string;
  summary: string;
  tier: RiskTier;
  ruleId: string;
  command?: string;
}, signal: AbortSignal) => Promise<"allow" | "deny" | "always">;

export type AgentEvent =
  | { type: "state"; state: TaskState; verb: string }
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | { type: "tool_log"; summary: string; path?: string }
  | { type: "tool_card"; card: ToolCard }
  | { type: "plan"; items: Array<{ id: string; title: string; status: string }> }
  | { type: "approval"; id: string; tool: string; summary: string; tier: RiskTier }
  | { type: "usage"; usage: CanonicalUsage }
  | { type: "decision"; rationale: string }
  | { type: "done"; state: TaskState }
  | { type: "error"; message: string };

export type RunTaskOptions = {
  provider: LLMProvider;
  model: ResolvedModel;
  host: AgentHost;
  policy: Policy;
  ask: AskUser;
  messages: ChatMessage[];
  signal: AbortSignal;
  maxTurns?: number;
  system?: string;
  pullSteer?: () => string[];
};

export type DecisionEntry = {
  turn: number;
  state: TaskState;
  rationale: string;
};

export function fingerprint(call: ToolCall): string {
  return `${call.name}:${stableJson(call.input)}`;
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
}
