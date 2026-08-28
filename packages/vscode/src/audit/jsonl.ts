import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";

export class AuditLog {
  constructor(private readonly file: string) {
    mkdirSync(join(file, ".."), { recursive: true });
  }

  write(event: Record<string, unknown>) {
    appendFileSync(this.file, `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);
  }
}

export function createAuditLog(context: vscode.ExtensionContext, taskId: string): AuditLog {
  const dir = join(context.storageUri?.fsPath ?? context.globalStorageUri.fsPath, "audit");
  mkdirSync(dir, { recursive: true });
  return new AuditLog(join(dir, `${taskId}.jsonl`));
}
