import { randomUUID } from "node:crypto";
import type { Webview } from "vscode";
import * as vscode from "vscode";
import {
  createProvider,
  MISSING_USAGE_WARNING,
  missingUsage,
  resolveModel,
  runTask,
  userModelOverridesSchema,
  type AskUser,
  type CanonicalUsage,
  type ChatMessage,
  type HostToWebview,
  type ModelCatalog,
  type Policy,
  type ToolCard,
} from "@laika/core";
import { post } from "../webview-host/bridge.js";
import { providerOf, type SecretProfiles } from "../secrets/profiles.js";
import { createAuditLog } from "../audit/jsonl.js";
import { loadPolicy, persistAllowCommand } from "../policy/store.js";
import { createHost } from "../tools/host.js";
import type { OrbitStore } from "../orbit/store.js";
import type { WatchLane } from "../editor/watch.js";
import { composeUserMessage } from "./attach.js";

type TranscriptLine = Extract<HostToWebview, { type: "session/restore" }>["lines"][number];

export class ChatSession {
  readonly messages: ChatMessage[] = [];
  readonly transcript: TranscriptLine[] = [];
  status = "idle · set an API key to start";
  private running: AbortController | undefined;
  private pending = new Map<string, (d: "allow" | "deny" | "always") => void>();
  private steer: string[] = [];
  private views = new Set<Webview>();
  private webview: Webview | undefined;

  constructor(
    private readonly profiles: SecretProfiles,
    private catalog: ModelCatalog,
    private readonly context: vscode.ExtensionContext,
    private readonly overrides: () => unknown,
    private readonly orbit: OrbitStore,
    private readonly watch: WatchLane,
  ) {}

  setCatalog(catalog: ModelCatalog) {
    this.catalog = catalog;
  }

  attach(webview: Webview) {
    this.views.add(webview);
    this.webview = webview;
  }

  detach(webview: Webview) {
    this.views.delete(webview);
    if (this.webview === webview) this.webview = [...this.views][0];
  }

  private emit(message: HostToWebview) {
    for (const view of this.views) post(view, message);
  }

  get busy() {
    return Boolean(this.running);
  }

  abort() {
    this.steer = [];
    this.running?.abort();
    for (const resolve of this.pending.values()) resolve("deny");
    this.pending.clear();
  }

  respond(id: string, decision: "allow" | "deny" | "always") {
    const resolve = this.pending.get(id);
    if (!resolve) return;
    this.pending.delete(id);
    resolve(decision);
  }

  restorePayload(): Extract<HostToWebview, { type: "session/restore" }> {
    return {
      type: "session/restore",
      lines: this.transcript,
      busy: this.busy,
      status: this.status,
    };
  }

  async send(text: string, webview: Webview, attachments: string[] = []) {
    this.attach(webview);
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const { display, content } = composeUserMessage(text, attachments, workspace);
    if (!content) return;
    this.transcript.push({ kind: "user", text: display });

    if (this.running) {
      this.steer.push(content);
      this.setStatus("queued — injects at the next turn");
      return;
    }

    await this.run(content);
    while (this.steer.length && this.views.size && !this.running) {
      const next = this.steer.splice(0).join("\n\n");
      await this.run(next);
    }
  }

  private setStatus(text: string) {
    this.status = text;
    this.emit({ type: "status", text });
  }

  private pushThought(id: string, text: string) {
    const line = this.transcript.find((row) => row.kind === "assistant" && row.id === id);
    if (line && line.kind === "assistant") line.thought = `${line.thought ?? ""}${text}`;
    this.emit({ type: "thought/delta", id, text });
  }

  private pushCard(id: string, card: ToolCard) {
    const line = this.transcript.find((row) => row.kind === "assistant" && row.id === id);
    if (line && line.kind === "assistant") {
      const cards = line.cards ?? [];
      const i = cards.findIndex((row) => row.id === card.id);
      if (i >= 0) cards[i] = card;
      else cards.push(card);
      line.cards = cards;
    }
    this.emit({ type: "tool/card", id, card });
  }

  private pushTick(id: string, summary: string, path?: string) {
    const line = this.transcript.find((row) => row.kind === "assistant" && row.id === id);
    const n = line && line.kind === "assistant" ? (line.cards ?? []).length : 0;
    this.pushCard(id, path !== undefined
      ? { kind: "log", id: `${id}-log-${n}`, text: summary, path }
      : { kind: "log", id: `${id}-log-${n}`, text: summary });
  }

  private async run(text: string) {
    const controller = new AbortController();
    this.running = controller;
    const id = randomUUID();
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    let model;
    try {
      const parsed = userModelOverridesSchema.catch({}).parse(this.overrides() ?? {});
      model = resolveModel(this.catalog, this.profiles.modelId(), parsed);
    } catch (err) {
      this.fail(id, err instanceof Error ? err.message : "Unknown model");
      this.running = undefined;
      return;
    }

    const providerId = providerOf(model.provider);
    const profile = await this.profiles.active(providerId);
    if (!profile) {
      this.fail(
        id,
        `No ${providerId} API key for profile “${this.profiles.profileId()}”. Open Keys or run “Laika: Provider Keys”.`,
      );
      this.running = undefined;
      return;
    }
    if (!workspace) {
      this.fail(id, "Open a folder to use tools.");
      this.running = undefined;
      return;
    }

    const policy: Policy = loadPolicy(workspace);
    this.emit({ type: "autonomy", mode: policy.autonomy });
    this.messages.push({ role: "user", content: text });
    this.transcript.push({ kind: "assistant", id, text: "", thought: "", cards: [] });
    this.emit({ type: "chat/start", id });

    const audit = createAuditLog(this.context, id);
    const ask: AskUser = (request, signal) =>
      new Promise((resolve, reject) => {
        this.emit({
          type: "approval/ask",
          id: request.id,
          tool: request.tool,
          summary: request.summary,
          tier: request.tier,
        });
        this.pending.set(request.id, (decision) => {
          this.emit({ type: "approval/clear" });
          if (decision === "always" && request.command) persistAllowCommand(workspace, request.command, policy);
          resolve(decision);
        });
        signal.addEventListener("abort", () => {
          this.pending.delete(request.id);
          this.emit({ type: "approval/clear" });
          reject(new Error("aborted"));
        });
      });

    const host = createHost({
      workspace,
      context: this.context,
      audit: (event) => audit.write(event),
      rgPath: "rg",
      orbit: this.orbit,
      watch: this.watch,
    });

    const provider = createProvider(providerId, profile.apiKey);
    let usage: CanonicalUsage = missingUsage();

    try {
      for await (const event of runTask({
        provider,
        model,
        host,
        policy,
        ask,
        messages: this.messages,
        signal: controller.signal,
        pullSteer: () => this.steer.splice(0),
      })) {
        if (event.type === "text") {
          const line = this.transcript.find((row) => row.kind === "assistant" && row.id === id);
          if (line && line.kind === "assistant") line.text += event.text;
          this.emit({ type: "chat/delta", id, text: event.text });
        }
        if (event.type === "thought") this.pushThought(id, event.text);
        if (event.type === "state") {
          this.emit({ type: "task/state", state: event.state, verb: event.verb });
          this.setStatus(event.verb);
        }
        if (event.type === "tool_log") this.pushTick(id, event.summary, event.path);
        if (event.type === "tool_card") this.pushCard(id, event.card);
        if (event.type === "plan") this.emit({ type: "plan/set", items: event.items });
        if (event.type === "usage") usage = event.usage;
        if (event.type === "error") this.fail(id, event.message);
        if (event.type === "done") {
          this.emit({ type: "chat/done", id, usage });
          const tokens = `${usage.input + usage.cacheRead}→${usage.output}`;
          const suffix = usage.estimated ? ` · ${MISSING_USAGE_WARNING}` : "";
          this.setStatus(`${tokens}${suffix}`);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        this.fail(id, err instanceof Error ? err.message : "Agent failed");
      } else {
        this.emit({ type: "chat/done", id, usage: missingUsage() });
        this.setStatus("aborted");
      }
    } finally {
      this.running = undefined;
      this.emit({ type: "approval/clear" });
    }
  }

  private fail(id: string, message: string) {
    this.transcript.push({ kind: "error", id, text: message });
    this.emit({ type: "chat/error", id, message });
  }
}
