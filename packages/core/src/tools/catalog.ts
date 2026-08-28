import type { ToolDefinition } from "../providers/types.js";
import type { ToolClass } from "../policy/types.js";

export type ToolMeta = {
  class: ToolClass;
  mutates: boolean;
};

const object = (
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
  description,
});

export const TOOL_META: Record<string, ToolMeta> = {
  read_file: { class: "read", mutates: false },
  search: { class: "read", mutates: false },
  glob: { class: "read", mutates: false },
  update_plan: { class: "read", mutates: false },
  replace: { class: "edit", mutates: true },
  write_file: { class: "edit", mutates: true },
  delete_file: { class: "edit", mutates: true },
  terminal: { class: "execute", mutates: false },
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "read_file",
    description:
      "Read a workspace file. For large files omit the range to get a symbol outline, then request start_line/end_line.",
    inputSchema: object("Read a file", {
      path: { type: "string", description: "Workspace-relative path" },
      start_line: { type: "integer", minimum: 1, description: "1-based inclusive start" },
      end_line: { type: "integer", minimum: 1, description: "1-based inclusive end" },
      outline: { type: "boolean", description: "Force a symbol outline even for small files" },
    }, ["path"]),
  },
  {
    name: "search",
    description: "Ripgrep the workspace. Returns matching lines with paths and line numbers.",
    inputSchema: object("Search files", {
      pattern: { type: "string", description: "Regex pattern" },
      glob: { type: "string", description: "Optional file glob, e.g. **/*.ts" },
      max_hits: { type: "integer", minimum: 1, description: "Cap (default 50)" },
    }, ["pattern"]),
  },
  {
    name: "glob",
    description: "List workspace files matching a glob.",
    inputSchema: object("Glob files", {
      pattern: { type: "string", description: "Glob relative to the workspace, e.g. src/**/*.ts" },
    }, ["pattern"]),
  },
  {
    name: "replace",
    description:
      "Replace one exact occurrence of old_string with new_string in a file. old_string must uniquely identify the site.",
    inputSchema: object("Search and replace", {
      path: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
    }, ["path", "old_string", "new_string"]),
  },
  {
    name: "write_file",
    description: "Create or overwrite a workspace file with contents. Prefer replace for existing files.",
    inputSchema: object("Write file", {
      path: { type: "string" },
      contents: { type: "string" },
    }, ["path", "contents"]),
  },
  {
    name: "delete_file",
    description: "Delete a workspace file. Prefer this over a shell rm so Orbit and chat can show the deletion.",
    inputSchema: object("Delete a file", {
      path: { type: "string" },
    }, ["path"]),
  },
  {
    name: "terminal",
    description:
      "Run a shell command in the workspace. For interactive prompts, pass stdin as input and re-run.",
    inputSchema: object("Run command", {
      command: { type: "string" },
      input: { type: "string", description: "Optional stdin, e.g. y\\n" },
    }, ["command"]),
  },
  {
    name: "update_plan",
    description: "Replace the visible task plan. Call when the work is multi-step.",
    inputSchema: object("Update plan", {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "done"] },
          },
          required: ["id", "title", "status"],
        },
      },
    }, ["items"]),
  },
];

export function toolMeta(name: string): ToolMeta {
  return TOOL_META[name] ?? { class: "execute", mutates: false };
}

export function pathFromArgs(name: string, args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const path = (args as { path?: unknown }).path;
  if (name === "terminal") return undefined;
  return typeof path === "string" ? path : undefined;
}

export function commandFromArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const command = (args as { command?: unknown }).command;
  return typeof command === "string" ? command : undefined;
}
