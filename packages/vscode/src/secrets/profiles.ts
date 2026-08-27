import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { parseCatalog, type ModelCatalog, type ProviderId } from "@laika/core";

function keyOf(profileId: string, provider: ProviderId): string {
  return `laika.secret.${profileId}.${provider}`;
}

export function providerOf(modelProvider: string): ProviderId {
  return modelProvider === "openai" ? "openai" : "anthropic";
}

export type ActiveProfile = {
  id: string;
  provider: ProviderId;
  apiKey: string;
};

export class SecretProfiles {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  profileId(): string {
    return vscode.workspace.getConfiguration("laika").get<string>("profile") ?? "default";
  }

  provider(): ProviderId {
    const value = vscode.workspace.getConfiguration("laika").get<string>("provider") ?? "anthropic";
    return value === "openai" ? "openai" : "anthropic";
  }

  modelId(): string {
    return vscode.workspace.getConfiguration("laika").get<string>("model") ?? "claude-sonnet-4-5";
  }

  async active(provider = this.provider()): Promise<ActiveProfile | undefined> {
    const id = this.profileId();
    const apiKey = await this.ctx.secrets.get(keyOf(id, provider));
    if (!apiKey) return undefined;
    return { id, provider, apiKey };
  }

  async setKey(apiKey: string): Promise<void> {
    await this.ctx.secrets.store(keyOf(this.profileId(), this.provider()), apiKey);
  }

  async clearKey(): Promise<void> {
    await this.ctx.secrets.delete(keyOf(this.profileId(), this.provider()));
  }
}

export function loadCatalog(extensionUri: vscode.Uri): ModelCatalog {
  const candidates = [
    join(extensionUri.fsPath, "dist", "models.json"),
    join(extensionUri.fsPath, "..", "..", "models", "models.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return parseCatalog(JSON.parse(readFileSync(path, "utf8")));
  }
  throw new Error("Laika models.json not found");
}
