import { spawn } from "node:child_process";
import type { ToolResult } from "@laika/core";

export function terminalTool(
  cwd: string,
  args: { command: string; input?: string },
  signal: AbortSignal,
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child = spawn(args.command, {
      cwd,
      shell: true,
      windowsHide: true,
      signal,
    });
    let out = "";
    let err = "";
    if (args.input !== undefined) child.stdin.write(args.input);
    child.stdin.end();
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (out.length > 80_000) out = `${out.slice(0, 40_000)}\n…\n${out.slice(-20_000)}`;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        content: error.message,
        summary: `Ran ${args.command}`,
        isError: true,
        command: args.command,
        output: error.message,
        exitCode: null,
      });
    });
    child.on("close", (code) => {
      const body = [out.trim(), err.trim()].filter(Boolean).join("\n");
      resolve({
        content: `${body}\n(exit ${code ?? "null"})`,
        summary: `Ran ${args.command} — exit ${code ?? "?"}`,
        isError: code !== 0,
        command: args.command,
        output: body,
        exitCode: code ?? null,
      });
    });
  });
}
