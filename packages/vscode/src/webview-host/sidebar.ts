import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { ChatSession } from "../chat/session.js";
import { WatchLane } from "../editor/watch.js";
import { OrbitPanel } from "../orbit/panel.js";
import { OrbitStore } from "../orbit/store.js";
import { watchWorkspaceOrbit } from "../orbit/fs-watch.js";
import { loadCatalog, providerOf, SecretProfiles } from "../secrets/profiles.js";
import { listen, post } from "./bridge.js";
import {
  detectProviderFromKey,
  listProviderModels,
  mergeRemoteCatalog,
  type HostToWebview,
  type ProviderId,
  type RemoteModel,
  type WebviewToHost,
} from "@laika/core";

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private popout: vscode.WebviewPanel | undefined;
  private orbitOpen = false;
  private readonly profiles: SecretProfiles;
  private readonly shipped;
  private live;
  private keyed: ProviderId[] = [];
  private readonly session: ChatSession;
  private readonly orbitStore = new OrbitStore();
  private readonly orbitPanel: OrbitPanel;
  private readonly watch: WatchLane;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.profiles = new SecretProfiles(context);
    this.shipped = loadCatalog(context.extensionUri);
    this.live = this.shipped;
    this.orbitPanel = new OrbitPanel(context, this.orbitStore);
    this.orbitPanel.onClosed = () => this.syncOrbit(false);
    this.watch = new WatchLane(() => (this.orbitPanel.open ? vscode.ViewColumn.Beside : vscode.ViewColumn.One));
    context.subscriptions.push(this.watch, watchWorkspaceOrbit(this.orbitStore));
    this.session = new ChatSession(
      this.profiles,
      this.live,
      context,
      () => vscode.workspace.getConfiguration("laika").get("modelOverrides"),
      this.orbitStore,
      this.watch,
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("laika.profile")) {
          void this.refreshCatalog();
          return;
        }
        if (e.affectsConfiguration("laika.model") || e.affectsConfiguration("laika.provider")) {
          this.postAll(this.modelsPayload());
        }
      }),
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    const first = !this.view;
    this.view = webviewView;
    const { webview } = webviewView;
    webview.options = this.webviewOptions();
    if (first) webview.html = this.html(webview);
    this.session.attach(webview);
    if (!first) return;

    const sub = listen(webview, (message) => this.onMessage(message, webview));
    webviewView.onDidDispose(() => {
      this.session.detach(webview);
      if (this.view === webviewView) this.view = undefined;
      sub.dispose();
    });
  }

  toggleOrbit() {
    this.setOrbit(!this.orbitOpen);
  }

  popoutChat() {
    if (this.popout) {
      this.popout.reveal(vscode.ViewColumn.Beside);
      return;
    }
    const panel = vscode.window.createWebviewPanel("laika.chat", "Laika", vscode.ViewColumn.Beside, {
      ...this.webviewOptions(),
      retainContextWhenHidden: true,
    });
    this.popout = panel;
    panel.webview.html = this.html(panel.webview);
    this.session.attach(panel.webview);
    const sub = listen(panel.webview, (message) => this.onMessage(message, panel.webview));
    panel.onDidDispose(() => {
      this.session.detach(panel.webview);
      sub.dispose();
      this.popout = undefined;
    });
  }

  private onMessage(message: WebviewToHost, webview: vscode.Webview) {
    if (message.type === "hello") {
      post(webview, { type: "ready", version: this.context.extension.packageJSON.version as string });
      post(webview, this.session.restorePayload());
      post(webview, { type: "orbit/set", open: this.orbitOpen });
      void this.refreshCatalog();
      if (this.session.busy) post(webview, { type: "status", text: this.session.status });
      return;
    }
    if (message.type === "orbit/toggle") {
      this.setOrbit(!this.orbitOpen);
      return;
    }
    if (message.type === "composer/attach") {
      void this.attachFiles();
      return;
    }
    if (message.type === "chat/send") {
      void this.session.send(message.text, webview, message.attachments ?? []);
      return;
    }
    if (message.type === "chat/abort") {
      this.session.abort();
      return;
    }
    if (message.type === "chat/popout") {
      this.popoutChat();
      return;
    }
    if (message.type === "keys/manage") {
      void this.manageKeys();
      return;
    }
    if (message.type === "model/set") {
      void this.setModel(message.id);
      return;
    }
    if (message.type === "editor/reveal") {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (folder) void this.watch.revealPath(folder, message.path, false);
      return;
    }
    if (message.type === "approval/respond") {
      this.session.respond(message.id, message.decision);
    }
  }

  private modelsPayload() {
    const items = this.live.models.map((model) => ({
      id: model.id,
      label: model.label,
      provider: model.provider,
    }));
    const current =
      items.some((model) => model.id === this.profiles.modelId())
        ? this.profiles.modelId()
        : (items[0]?.id ?? this.profiles.modelId());
    return { type: "models" as const, current, items };
  }

  private async pushModels() {
    this.keyed = await this.profiles.keyedProviders();
    const remote: RemoteModel[] = [];
    for (const provider of this.keyed) {
      const profile = await this.profiles.active(provider);
      if (!profile) continue;
      try {
        remote.push(...(await listProviderModels(provider, profile.apiKey)));
      } catch {
        remote.push(
          ...this.shipped.models
            .filter((model) => providerOf(model.provider) === provider)
            .map((model) => ({ id: model.id, label: model.label, provider })),
        );
      }
    }
    this.live = remote.length ? mergeRemoteCatalog(this.shipped, remote) : { models: [] };
    this.session.setCatalog(this.live.models.length ? this.live : this.shipped);
    this.postAll(this.modelsPayload());
  }

  private async refreshCatalog() {
    if (!this.session.busy) this.postAll({ type: "status", text: "listing models…" });
    await this.pushModels();
    await this.ensureCurrentModel();
    if (!this.session.busy) await this.pushStatus();
  }

  private configTarget() {
    return vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  }

  private async setModel(id: string) {
    const entry = this.live.models.find((model) => model.id === id) ?? this.shipped.models.find((model) => model.id === id);
    if (!entry) return;
    const cfg = vscode.workspace.getConfiguration("laika");
    const target = this.configTarget();
    await cfg.update("model", id, target);
    await cfg.update("provider", providerOf(entry.provider), target);
    this.postAll(this.modelsPayload());
    await this.pushStatus();
  }

  private async ensureCurrentModel() {
    const cfg = vscode.workspace.getConfiguration("laika");
    const target = this.configTarget();
    const current = this.live.models.find((model) => model.id === this.profiles.modelId());
    if (current) {
      await cfg.update("provider", providerOf(current.provider), target);
      return;
    }
    const next = this.live.models[0];
    if (!next) return;
    await cfg.update("model", next.id, target);
    await cfg.update("provider", providerOf(next.provider), target);
  }

  abort() {
    this.session.abort();
  }

  async manageKeys() {
    const keyed = new Set(await this.profiles.keyedProviders());
    const picked = await vscode.window.showQuickPick(
      [
        {
          label: "Anthropic",
          description: keyed.has("anthropic") ? "key set" : "no key",
          detail: "Claude models · sk-ant-…",
          provider: "anthropic" as const,
        },
        {
          label: "OpenAI",
          description: keyed.has("openai") ? "key set" : "no key",
          detail: "GPT models · sk-…",
          provider: "openai" as const,
        },
      ],
      { title: "Provider keys", placeHolder: "Set or clear a key, then models refresh from that API" },
    );
    if (!picked) return;
    if (keyed.has(picked.provider)) {
      const action = await vscode.window.showQuickPick(
        [
          { label: "Replace key", action: "set" as const },
          { label: "Clear key", action: "clear" as const },
        ],
        { title: picked.label },
      );
      if (!action) return;
      if (action.action === "clear") {
        await this.profiles.clearKey(picked.provider);
        await this.refreshCatalog();
        void vscode.window.showInformationMessage(`Cleared ${picked.label} key.`);
        return;
      }
    }
    await this.promptKey(picked.provider);
  }

  async setApiKey() {
    await this.manageKeys();
  }

  private async promptKey(expected?: ProviderId) {
    const key = await vscode.window.showInputBox({
      title: expected ? `${expected === "anthropic" ? "Anthropic" : "OpenAI"} API key` : "Laika API key",
      prompt: expected
        ? `Stored in SecretStorage for profile “${this.profiles.profileId()}”.`
        : `Paste a key for profile “${this.profiles.profileId()}”. Anthropic (sk-ant-…) and OpenAI (sk-…) are detected automatically.`,
      password: true,
      ignoreFocusOut: true,
      placeHolder: expected === "openai" ? "sk-…" : "sk-ant-… or sk-…",
    });
    if (!key) return;
    const trimmed = key.trim();
    let provider = detectProviderFromKey(trimmed) ?? expected;
    if (!provider) {
      const picked = await vscode.window.showQuickPick(
        [
          { label: "Anthropic", provider: "anthropic" as const },
          { label: "OpenAI", provider: "openai" as const },
        ],
        { title: "Couldn’t detect the provider from this key" },
      );
      if (!picked) return;
      provider = picked.provider;
    }
    if (expected && provider !== expected) {
      const useDetected = await vscode.window.showWarningMessage(
        `This looks like a ${provider} key. Store it under ${provider}?`,
        "Yes",
        `Keep ${expected}`,
      );
      if (useDetected === `Keep ${expected}`) provider = expected;
      if (!useDetected) return;
    }
    await this.profiles.setKey(trimmed, provider);
    await this.refreshCatalog();
    void vscode.window.showInformationMessage(
      `Stored ${provider} key · ${this.live.models.length} model${this.live.models.length === 1 ? "" : "s"}.`,
    );
  }

  async clearApiKey() {
    await this.profiles.clearKey();
    await this.refreshCatalog();
    void vscode.window.showInformationMessage("Laika API key cleared for this profile.");
  }

  private async attachFiles() {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFiles: true,
      canSelectFolders: false,
      openLabel: "Attach",
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    });
    if (!picked?.length) return;
    const paths = picked.map((uri) => vscode.workspace.asRelativePath(uri, false));
    this.postAll({ type: "composer/attached", paths });
  }

  private postAll(message: HostToWebview) {
    if (this.view) post(this.view.webview, message);
    if (this.popout) post(this.popout.webview, message);
  }

  private async pushStatus() {
    const keyed = this.keyed.length ? this.keyed : await this.profiles.keyedProviders();
    const text = keyed.length ? "ready" : "run Laika: Provider Keys";
    this.session.status = text;
    this.postAll({ type: "status", text });
  }

  private setOrbit(open: boolean) {
    if (open) void this.orbitPanel.show();
    else this.orbitPanel.close();
    this.syncOrbit(open);
  }

  private syncOrbit(open: boolean) {
    this.orbitOpen = open;
    this.postAll({ type: "orbit/set", open });
    void vscode.commands.executeCommand("setContext", "laika.orbitOpen", open);
  }

  private webviewOptions() {
    return {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview"),
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
      ],
    };
  }

  private html(webview: vscode.Webview) {
    const dist = join(this.context.extensionUri.fsPath, "dist", "webview");
    let html: string;
    try {
      html = readFileSync(join(dist, "index.html"), "utf8");
    } catch {
      return `<!doctype html><html><body style="background:#1e1e1e;color:#cccccc;font:13px sans-serif;padding:16px">Build the webview first (<code>pnpm build</code>).</body></html>`;
    }
    const csp = webview.cspSource;
    const icon = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "laika.png"));
    html = html.replace(
      /<head>/,
      `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} https: data:; style-src ${csp} 'unsafe-inline'; script-src ${csp};">`,
    );
    html = html.replace(/<div id="root"><\/div>/, `<div id="root" data-icon="${icon}"></div>`);
    return html.replace(/(src|href)="(\.\/[^"]+)"/g, (_, attr: string, src: string) => {
      const uri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", src.replace(/^\.\//, "")));
      return `${attr}="${uri}"`;
    });
  }
}
