import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { toPosix } from "@laika/core";

const INLINE_CAP = 64_000;
const MAX_FILES = 8;

export function mentionPaths(text: string): string[] {
  const out: string[] = [];
  const re = /(^|[\s])@([A-Za-z0-9_./\\-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const path = (match[2] ?? "").replace(/\\/g, "/");
    if (path.includes("/") || path.includes(".")) out.push(path);
  }
  return out;
}

export function composeUserMessage(
  text: string,
  attachments: string[],
  workspace: string | undefined,
): { display: string; content: string } {
  const trimmed = text.trim();
  const files = [...new Set([...attachments, ...mentionPaths(trimmed)])].slice(0, MAX_FILES);
  const display = trimmed || (files.length ? `Attached ${files.join(", ")}` : "");
  const chunks: string[] = [];
  if (trimmed) chunks.push(trimmed);
  for (const file of files) chunks.push(inlineFile(file, workspace));
  return { display, content: chunks.join("\n\n") || display };
}

function inlineFile(file: string, workspace: string | undefined): string {
  const label = toPosix(file);
  const abs = resolveReadable(file, workspace);
  if (!abs) return `[attached ${label} — file not found]`;
  try {
    if (!existsSync(abs)) return `[attached ${label} — file not found]`;
    const size = statSync(abs).size;
    if (size > INLINE_CAP) {
      return `[attached ${label} — ${size} bytes, too large to inline; use read_file]`;
    }
    return `[attached ${label}]\n${readFileSync(abs, "utf8")}`;
  } catch (err) {
    return `[attached ${label} — ${err instanceof Error ? err.message : "unreadable"}]`;
  }
}

function resolveReadable(file: string, workspace: string | undefined): string | undefined {
  if (isAbsolute(file)) return file;
  if (!workspace) return undefined;
  const abs = join(workspace, file);
  const rel = relative(workspace, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return undefined;
  return abs;
}
