import { join } from "node:path";
import { readFileSync } from "node:fs";
import * as vscode from "vscode";
import { pathFromArgs, type AgentHost, type ToolResult } from "@laika/core";
import { resolveWorkspacePath } from "@laika/core/jail";
import { checkpointStore } from "../checkpoints/shadow.js";
import type { WatchLane } from "../editor/watch.js";
import type { OrbitStore } from "../orbit/store.js";
import { globTool, searchTool } from "./search.js";
import { readContents, replaceTool, writeFileTool, deleteFileTool } from "./fs.js";
import { terminalTool } from "./terminal.js";

export function createHost(opts: {
  workspace: string;
  context: vscode.ExtensionContext;
  audit: (event: Record<string, unknown>) => void;
  rgPath?: string;
  orbit?: OrbitStore;
  watch?: WatchLane;
}): AgentHost {
  const shadow = checkpointStore(opts.context, opts.workspace);

  return {
    audit: opts.audit,
    async checkpoint(reason) {
      try {
        await shadow.checkpoint(reason);
      } catch (err) {
        opts.audit({ type: "checkpoint-error", message: err instanceof Error ? err.message : String(err) });
      }
    },
    async diagnostics(paths) {
      const rows: string[] = [];
      for (const rel of paths) {
        const uri = vscode.Uri.file(join(opts.workspace, rel));
        const diags = vscode.languages.getDiagnostics(uri);
        for (const d of diags) {
          if (d.severity > vscode.DiagnosticSeverity.Warning) continue;
          rows.push(`${rel}:${d.range.start.line + 1} ${d.message}`);
        }
      }
      return rows.join("\n");
    },
    async invoke(name, args, signal) {
      const rel = pathFromArgs(name, args);
      if (rel && name === "read_file") await opts.watch?.revealPath(opts.workspace, rel, true);
      if (rel && (name === "replace" || name === "write_file")) {
        try {
          await opts.watch?.revealPath(opts.workspace, rel, false);
        } catch {
          /* new files open after create */
        }
      }
      const result = await dispatch(opts.workspace, name, args, signal, opts.rgPath, opts.watch);
      noteOrbit(opts.orbit, name, args, result);
      return result;
    },
  };
}

function noteOrbit(orbit: OrbitStore | undefined, name: string, args: unknown, result: ToolResult) {
  if (!orbit) return;
  const a = (args ?? {}) as Record<string, unknown>;
  if (name === "read_file" && typeof a.path === "string" && a.path) orbit.markRead(a.path);
  if (!result.mutated || !result.paths) return;
  for (const path of result.paths) {
    orbit.markEdit(path, result.plus ?? 0, result.minus ?? 0, result.preview ?? [], {
      ...(result.created ? { created: true } : {}),
      ...(result.deleted ? { deleted: true } : {}),
      ...(result.hunks?.length ? { hunks: result.hunks } : {}),
    });
  }
}

async function dispatch(
  root: string,
  name: string,
  args: unknown,
  signal: AbortSignal,
  rgPath: string | undefined,
  watch: WatchLane | undefined,
): Promise<ToolResult> {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (name) {
    case "read_file": {
      const path = String(a.path ?? "");
      const abs = resolveWorkspacePath(root, path);
      const raw = watch?.openText(abs) ?? readFileSync(abs, "utf8");
      return readContents(path, raw, {
        start_line: typeof a.start_line === "number" ? a.start_line : undefined,
        end_line: typeof a.end_line === "number" ? a.end_line : undefined,
        outline: typeof a.outline === "boolean" ? a.outline : undefined,
      });
    }
    case "write_file":
      if (watch) return watch.applyWrite(root, { path: String(a.path ?? ""), contents: String(a.contents ?? "") });
      return writeFileTool(root, { path: String(a.path ?? ""), contents: String(a.contents ?? "") });
    case "delete_file":
      if (watch) return watch.applyDelete(root, { path: String(a.path ?? "") });
      return deleteFileTool(root, { path: String(a.path ?? "") });
    case "replace":
      if (watch) {
        return watch.applyReplace(root, {
          path: String(a.path ?? ""),
          old_string: String(a.old_string ?? ""),
          new_string: String(a.new_string ?? ""),
        });
      }
      return replaceTool(root, {
        path: String(a.path ?? ""),
        old_string: String(a.old_string ?? ""),
        new_string: String(a.new_string ?? ""),
      });
    case "glob":
      return globTool(root, String(a.pattern ?? "**/*"));
    case "search":
      return searchTool(
        root,
        {
          pattern: String(a.pattern ?? ""),
          glob: typeof a.glob === "string" ? a.glob : undefined,
          max_hits: typeof a.max_hits === "number" ? a.max_hits : undefined,
        },
        rgPath,
      );
    case "terminal":
      return terminalTool(
        root,
        { command: String(a.command ?? ""), input: typeof a.input === "string" ? a.input : undefined },
        signal,
      );
    case "update_plan":
      return { content: "Plan updated.", summary: "Updated plan" };
    default:
      return { content: `Unknown tool ${name}`, summary: name, isError: true };
  }
}
