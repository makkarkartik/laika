import * as vscode from "vscode";
import { SidebarProvider } from "./webview-host/sidebar.js";

export function activate(context: vscode.ExtensionContext) {
  try {
    const sidebar = new SidebarProvider(context);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider("laika.sidebar", sidebar, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
      vscode.commands.registerCommand("laika.open", () => {
        void vscode.commands.executeCommand("laika.sidebar.focus");
        sidebar.popoutChat();
      }),
      vscode.commands.registerCommand("laika.orbit.toggle", () => {
        sidebar.toggleOrbit();
      }),
      vscode.commands.registerCommand("laika.keys.set", () => {
        void sidebar.manageKeys();
      }),
      vscode.commands.registerCommand("laika.keys.clear", () => {
        void sidebar.clearApiKey();
      }),
      vscode.commands.registerCommand("laika.cancel", () => {
        sidebar.abort();
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Laika failed to activate: ${message}`);
    throw err;
  }
}

export function deactivate() {}
