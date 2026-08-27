import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { ChatSession } from "../chat/session.js";
import { loadCatalog, SecretProfiles } from "../secrets/profiles.js";
import { listen, post } from "./bridge.js";

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private orbitOpen = false;
  private readonly profiles: SecretProfiles;
  private readonly session: ChatSession;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.profiles = new SecretProfiles(context);
    this.session = new ChatSession(this.profiles, loadCatalog(context.extensionUri), () =>
      vscode.workspace.getConfiguration("laika").get("modelOverrides"),
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    const { webview } = webviewView;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview")],
    };
    webview.html = this.html(webview);

    const sub = listen(webview, (message) => {
      if (message.type === "hello") {
        post(webview, { type: "ready", version: this.context.extension.packageJSON.version as string });
        post(webview, { type: "orbit/set", open: this.orbitOpen });
        void this.pushStatus();
        return;
      }
      if (message.type === "orbit/toggle") {
        this.setOrbit(!this.orbitOpen);
        return;
      }
      if (message.type === "chat/send") {
        if (!this.view) return;
        void this.session.send(message.text, this.view.webview);
      }
    });
    webviewView.onDidDispose(() => {
      this.session.abort();
      sub.dispose();
    });
  }

  toggleOrbit() {
    this.setOrbit(!this.orbitOpen);
  }

  async setApiKey() {
    const key = await vscode.window.showInputBox({
      title: "Laika API key",
      prompt: `SecretStorage profile “${this.profiles.profileId()}” (${this.profiles.provider()})`,
      password: true,
      ignoreFocusOut: true,
      placeHolder: "sk-… or sk-ant-…",
    });
    if (!key) return;
    await this.profiles.setKey(key);
    await this.pushStatus();
    void vscode.window.showInformationMessage("Laika API key stored.");
  }

  async clearApiKey() {
    await this.profiles.clearKey();
    await this.pushStatus();
    void vscode.window.showInformationMessage("Laika API key cleared for this profile.");
  }

  private async pushStatus() {
    if (!this.view) return;
    const active = await this.profiles.active();
    const model = this.profiles.modelId();
    post(this.view.webview, {
      type: "status",
      text: active ? `${model} · ${active.id}` : "idle · run Laika: Set API Key",
    });
  }

  private setOrbit(open: boolean) {
    this.orbitOpen = open;
    if (this.view) post(this.view.webview, { type: "orbit/set", open });
    void vscode.commands.executeCommand("setContext", "laika.orbitOpen", open);
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
    html = html.replace(
      /<head>/,
      `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} https: data:; style-src ${csp} 'unsafe-inline'; script-src ${csp};">`,
    );
    return html.replace(/(src|href)="(\.\/[^"]+)"/g, (_, attr: string, src: string) => {
      const uri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", src.replace(/^\.\//, "")));
      return `${attr}="${uri}"`;
    });
  }
}
