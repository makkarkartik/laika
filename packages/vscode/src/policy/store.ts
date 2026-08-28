import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { DEFAULT_POLICY, parsePolicy, type Autonomy, type Policy } from "@laika/core";

export function policyPath(workspace: string): string {
  return join(workspace, ".laika", "policy.json");
}

export function loadPolicy(workspace: string | undefined): Policy {
  const autonomy = vscode.workspace.getConfiguration("laika").get<Autonomy>("autonomy") ?? "guarded";
  if (!workspace) return { ...DEFAULT_POLICY, autonomy };
  const file = policyPath(workspace);
  if (!existsSync(file)) return { ...DEFAULT_POLICY, autonomy };
  try {
    const parsed = parsePolicy(JSON.parse(readFileSync(file, "utf8")));
    return { ...parsed, autonomy };
  } catch {
    return { ...DEFAULT_POLICY, autonomy };
  }
}

export function persistAllowCommand(workspace: string, command: string, policy: Policy) {
  if (!policy.allowCommands.includes(command)) policy.allowCommands.push(command);
  const file = policyPath(workspace);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(policy, null, 2)}\n`);
}
