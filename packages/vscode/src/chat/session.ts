import { randomUUID } from "node:crypto";
import type { Webview } from "vscode";
import {
  createProvider,
  MISSING_USAGE_WARNING,
  missingUsage,
  resolveModel,
  userModelOverridesSchema,
  type CanonicalUsage,
  type ChatTurn,
  type ModelCatalog,
} from "@laika/core";
import { post } from "../webview-host/bridge.js";
import { providerOf, type SecretProfiles } from "../secrets/profiles.js";

const SYSTEM = "You are Laika, a BYOK coding agent in VS Code. Be concise. Chat is the product; do not invent file edits.";

export class ChatSession {
  readonly turns: ChatTurn[] = [];
  private running: AbortController | undefined;

  constructor(
    private readonly profiles: SecretProfiles,
    private readonly catalog: ModelCatalog,
    private readonly overrides: () => unknown,
  ) {}

  abort() {
    this.running?.abort();
    this.running = undefined;
  }

  async send(text: string, webview: Webview) {
    this.abort();
    const controller = new AbortController();
    this.running = controller;
    const id = randomUUID();

    let model;
    try {
      const parsed = userModelOverridesSchema.catch({}).parse(this.overrides() ?? {});
      model = resolveModel(this.catalog, this.profiles.modelId(), parsed);
    } catch (err) {
      post(webview, {
        type: "chat/error",
        id,
        message: err instanceof Error ? err.message : "Unknown model",
      });
      return;
    }

    const providerId = providerOf(model.provider);
    const profile = await this.profiles.active(providerId);
    if (!profile) {
      post(webview, {
        type: "chat/error",
        id,
        message: `No ${providerId} API key for profile “${this.profiles.profileId()}”. Run “Laika: Set API Key”.`,
      });
      return;
    }

    this.turns.push({ role: "user", content: text });
    post(webview, { type: "chat/start", id });
    post(webview, { type: "status", text: `streaming · ${model.label}` });

    const provider = createProvider(providerId, profile.apiKey);
    let usage: CanonicalUsage = missingUsage();
    let assistant = "";

    try {
      for await (const event of provider.complete({
        model: model.id,
        messages: this.turns,
        maxOutput: model.maxOutput,
        system: SYSTEM,
        signal: controller.signal,
      })) {
        if (event.type === "text") {
          assistant += event.text;
          post(webview, { type: "chat/delta", id, text: event.text });
        }
        if (event.type === "usage") usage = event.usage;
        if (event.type === "done" && event.stopReason === "abort") {
          post(webview, { type: "chat/done", id, usage: missingUsage() });
          post(webview, { type: "status", text: `${model.label} · aborted` });
          return;
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        post(webview, { type: "chat/done", id, usage: missingUsage() });
        return;
      }
      post(webview, {
        type: "chat/error",
        id,
        message: err instanceof Error ? err.message : "Provider request failed",
      });
      post(webview, { type: "status", text: `${model.label} · error` });
      return;
    }

    if (assistant) this.turns.push({ role: "assistant", content: assistant });
    post(webview, { type: "chat/done", id, usage });
    const tokens = `${usage.input + usage.cacheRead}→${usage.output}`;
    const suffix = usage.estimated ? ` · ${MISSING_USAGE_WARNING}` : "";
    post(webview, { type: "status", text: `${model.label} · ${tokens}${suffix}` });
  }
}
