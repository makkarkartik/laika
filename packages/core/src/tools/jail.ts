import { realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

export class WorkspaceJailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceJailError";
  }
}

export function resolveWorkspacePath(root: string, requested: string): string {
  const base = realpathSync(root);
  const abs = isAbsolute(requested) ? requested : join(base, requested);
  let resolved: string;
  try {
    resolved = realpathSync(abs);
  } catch {
    resolved = abs;
  }
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new WorkspaceJailError(`Path escapes the workspace: ${requested}`);
  }
  return resolved;
}
