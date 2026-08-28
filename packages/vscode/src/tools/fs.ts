import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { countHunks, hunksFromReplace, hunksFromWrite, hunksFromDelete, splitLines, type ToolResult } from "@laika/core";
import { resolveWorkspacePath } from "@laika/core/jail";

const OUTLINE_LIMIT = 200;

export function readFileTool(root: string, args: { path: string; start_line?: number; end_line?: number; outline?: boolean }): ToolResult {
  const abs = resolveWorkspacePath(root, args.path);
  return readContents(args.path, readFileSync(abs, "utf8"), args);
}

export function readContents(
  path: string,
  raw: string,
  args: { start_line?: number; end_line?: number; outline?: boolean },
): ToolResult {
  const lines = raw.split(/\r?\n/);
  const wantOutline = args.outline || (!args.start_line && !args.end_line && lines.length > OUTLINE_LIMIT);
  if (wantOutline) {
    const outline = buildOutline(lines);
    return {
      content: `Outline of ${path} (${lines.length} lines). Request start_line/end_line to read a range.\n${outline}`,
      summary: `Read ${path} outline`,
    };
  }
  const start = Math.max(1, args.start_line ?? 1);
  const end = Math.min(lines.length, args.end_line ?? lines.length);
  const slice = lines.slice(start - 1, end).map((line, i) => `${start + i}|${line}`).join("\n");
  return { content: slice, summary: `Read ${path}:${start}-${end}` };
}

export function writeFileTool(root: string, args: { path: string; contents: string }): ToolResult {
  const abs = resolveWorkspacePath(root, args.path);
  const created = !existsSync(abs);
  const before = created ? undefined : readFileSync(abs, "utf8");
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, args.contents, "utf8");
  const hunks = hunksFromWrite(args.contents, before);
  const { plus, minus } = countHunks(hunks);
  const result: ToolResult = {
    content: `Wrote ${args.path} (${splitLines(args.contents).length} lines, +${plus} −${minus})`,
    summary: `Wrote ${args.path}`,
    mutated: true,
    paths: [args.path],
    plus,
    minus,
    created,
    preview: args.contents.split(/\r?\n/).slice(0, 14),
    hunks,
  };
  return result;
}

export function replaceTool(root: string, args: { path: string; old_string: string; new_string: string }): ToolResult {
  const abs = resolveWorkspacePath(root, args.path);
  const before = readFileSync(abs, "utf8");
  const count = before.split(args.old_string).length - 1;
  if (count === 0) {
    return { content: "old_string not found", summary: `Replace failed in ${args.path}`, isError: true };
  }
  if (count > 1) {
    return {
      content: `old_string matched ${count} times — it must be unique. Add surrounding lines.`,
      summary: `Replace failed in ${args.path}`,
      isError: true,
    };
  }
  const after = before.replace(args.old_string, args.new_string);
  writeFileSync(abs, after, "utf8");
  const hunks = hunksFromReplace(args.old_string, args.new_string);
  const { plus, minus } = countHunks(hunks);
  return {
    content: `Replaced 1 site in ${args.path} (+${plus} −${minus})`,
    summary: `Editing ${args.path}  +${plus} −${minus}`,
    mutated: true,
    paths: [args.path],
    plus,
    minus,
    preview: args.new_string.split(/\r?\n/).slice(0, 14),
    hunks,
  };
}

export function deleteFileTool(root: string, args: { path: string }): ToolResult {
  const abs = resolveWorkspacePath(root, args.path);
  if (!existsSync(abs)) {
    return { content: `${args.path} does not exist`, summary: `Delete failed ${args.path}`, isError: true };
  }
  const before = readFileSync(abs, "utf8");
  unlinkSync(abs);
  const hunks = hunksFromDelete(before);
  const minus = splitLines(before).length;
  return {
    content: `Deleted ${args.path} (${minus} lines)`,
    summary: `Deleted ${args.path}`,
    mutated: true,
    deleted: true,
    paths: [args.path],
    plus: 0,
    minus,
    preview: before.split(/\r?\n/).slice(0, 14),
    hunks,
  };
}

export function fileSize(root: string, rel: string): number {
  return statSync(resolveWorkspacePath(root, rel)).size;
}

function buildOutline(lines: string[]): string {
  const hits: string[] = [];
  const rules: RegExp[] = [
    /^export\s+(async\s+)?function\s+(\w+)/,
    /^export\s+class\s+(\w+)/,
    /^(export\s+)?(async\s+)?function\s+(\w+)/,
    /^(export\s+)?class\s+(\w+)/,
    /^export\s+const\s+(\w+)/,
    /^def\s+(\w+)/,
    /^(pub\s+)?(async\s+)?fn\s+(\w+)/,
  ];
  lines.forEach((line, i) => {
    for (const rule of rules) {
      const m = rule.exec(line);
      if (m) {
        hits.push(`${i + 1}: ${line.trim()}`);
        break;
      }
    }
  });
  return hits.length ? hits.join("\n") : "(no symbols found — request a line range)";
}
