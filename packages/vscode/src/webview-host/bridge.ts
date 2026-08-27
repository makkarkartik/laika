import type { Webview } from "vscode";
import { parseWebviewToHost, type HostToWebview, type WebviewToHost } from "@laika/core";

export type BridgeHandler = (message: WebviewToHost) => void;

export function post(webview: Webview, message: HostToWebview) {
  void webview.postMessage(message);
}

export function listen(webview: Webview, handler: BridgeHandler) {
  return webview.onDidReceiveMessage((raw: unknown) => {
    try {
      handler(parseWebviewToHost(raw));
    } catch (err) {
      console.error("laika: dropped invalid webview message", err);
    }
  });
}
