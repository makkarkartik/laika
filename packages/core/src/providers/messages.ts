import type { ChatMessage, ToolDefinition } from "./types.js";

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

export function toAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  let i = 0;
  while (i < messages.length) {
    const current = messages[i];
    if (!current) break;
    if (current.role === "tool") {
      const blocks: Array<Record<string, unknown>> = [];
      while (i < messages.length) {
        const row = messages[i];
        if (!row || row.role !== "tool") break;
        const block: Record<string, unknown> = {
          type: "tool_result",
          tool_use_id: row.toolUseId,
          content: row.content,
        };
        if (row.isError) block.is_error = true;
        blocks.push(block);
        i += 1;
      }
      out.push({ role: "user", content: blocks });
      continue;
    }
    if (current.role === "assistant") {
      const blocks: Array<Record<string, unknown>> = [];
      if (current.content) blocks.push({ type: "text", text: current.content });
      for (const call of current.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.input ?? {} });
      }
      out.push({ role: "assistant", content: blocks.length === 1 && blocks[0]?.type === "text" ? current.content : blocks });
      i += 1;
      continue;
    }
    out.push({ role: "user", content: current.content });
    i += 1;
  }
  return out;
}

export type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export function toOpenAIMessages(system: string | undefined, messages: ChatMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  if (system !== undefined) out.push({ role: "system", content: system });
  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const row: OpenAIMessage = {
        role: "assistant",
        content: message.content ? message.content : null,
      };
      if (message.toolCalls?.length) {
        row.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
        }));
      }
      out.push(row);
      continue;
    }
    out.push({ role: "tool", tool_call_id: message.toolUseId, content: message.content });
  }
  return out;
}

export function toAnthropicTools(tools: ToolDefinition[] | undefined): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

export function toOpenAITools(tools: ToolDefinition[] | undefined) {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export function parseToolArguments(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { _raw: raw };
  }
}
