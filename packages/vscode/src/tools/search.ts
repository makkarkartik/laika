import { spawn } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { globMatch, toPosix, type ToolResult } from "@laika/core";

const SKIP = new Set(["node_modules", ".git", "dist", "out", "coverage", ".laika"]);

export async function globTool(root: string, pattern: string): Promise<ToolResult> {
  const files = walk(root, root).filter((rel) => globMatch(pattern, rel));
  const cap = files.slice(0, 200);
  return {
    content: cap.join("\n") || "(no matches)",
    summary: `Glob ${pattern}`,
  };
}

export async function searchTool(
  root: string,
  args: { pattern: string; glob?: string; max_hits?: number },
  rgPath: string | undefined,
): Promise<ToolResult> {
  const max = args.max_hits ?? 50;
  if (rgPath) {
    try {
      const hits = await rg(rgPath, root, args.pattern, args.glob, max);
      return { content: hits || "(no matches)", summary: `Search ${args.pattern}` };
    } catch {
      /* fall through */
    }
  }
  const files = walk(root, root).filter((rel) => (args.glob ? globMatch(args.glob, rel) : true));
  const rows: string[] = [];
  const regex = new RegExp(args.pattern);
  for (const rel of files) {
    if (rows.length >= max) break;
    let text: string;
    try {
      text = readFileSync(join(root, rel), "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (rows.length >= max) return;
      if (regex.test(line)) rows.push(`${rel}:${i + 1}:${line}`);
    });
  }
  return { content: rows.join("\n") || "(no matches)", summary: `Search ${args.pattern}` };
}

export function listWorkspaceFiles(root: string): string[] {
  return walk(root, root);
}

function walk(root: string, dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(root, abs));
    else if (entry.isFile() && statSync(abs).size < 1_000_000) out.push(toPosix(relative(root, abs)));
  }
  return out;
}

function rg(bin: string, cwd: string, pattern: string, glob: string | undefined, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-n", "--no-heading", "--color", "never", "-m", String(max), pattern];
    if (glob) args.push("--glob", glob);
    const child = spawn(bin, args, { cwd, windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (c: Buffer) => {
      out += c.toString();
    });
    child.stderr.on("data", (c: Buffer) => {
      err += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || code === 1) resolve(out.trim());
      else reject(new Error(err || `rg exited ${code}`));
    });
  });
}
