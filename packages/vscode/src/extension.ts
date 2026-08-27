import * as vscode from "vscode";
import { SidebarProvider } from "./webview-host/sidebar.js";

export function activate(context: vscode.ExtensionContext) {
  const sidebar = new SidebarProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("laika.sidebar", sidebar),
    vscode.commands.registerCommand("laika.open", () => {
      void vscode.commands.executeCommand("laika.sidebar.focus");
    }),
    vscode.commands.registerCommand("laika.orbit.toggle", () => {
      sidebar.toggleOrbit();
    }),
    vscode.commands.registerCommand("laika.keys.set", () => {
      void sidebar.setApiKey();
    }),
    vscode.commands.registerCommand("laika.keys.clear", () => {
      void sidebar.clearApiKey();
    }),
  );
}

export function deactivate() {}
