import { parseHostToWebview, type HostToWebview, type WebviewToHost } from "@laika/core";

type VsCodeApi = { postMessage(message: WebviewToHost): void };

function acquire(): VsCodeApi {
  const w = window as unknown as { acquireVsCodeApi?: () => VsCodeApi };
  if (w.acquireVsCodeApi) return w.acquireVsCodeApi();
  return { postMessage: () => undefined };
}

const vscode = acquire();

export function send(message: WebviewToHost) {
  vscode.postMessage(message);
}

export function onHost(handler: (message: HostToWebview) => void) {
  const listener = (event: MessageEvent) => {
    try {
      handler(parseHostToWebview(event.data));
    } catch {
      /* ignore non-protocol traffic */
    }
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
