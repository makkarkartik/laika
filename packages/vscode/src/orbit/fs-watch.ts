import { relative } from "node:path";
import * as vscode from "vscode";
import { toPosix } from "@laika/core";
import type { OrbitStore } from "./store.js";

const SKIP = new Set(["node_modules", ".git", "dist", "out", "coverage", ".laika"]);

export function watchWorkspaceOrbit(store: OrbitStore): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  const onDelete = watcher.onDidDelete((uri) => {
    const path = rel(uri);
    if (!path) return;
    const current = store.files.get(path);
    store.markEdit(path, 0, current?.minus || current?.preview.length || 1, current?.preview?.length ? current.preview : ["(deleted)"], {
      deleted: true,
    });
  });
  const onCreate = watcher.onDidCreate((uri) => {
    void vscode.workspace.fs.stat(uri).then((info) => {
      if (info.type !== vscode.FileType.File) return;
      const path = rel(uri);
      if (!path) return;
      const current = store.files.get(path);
      if (current && current.kind !== "read") return;
      store.markEdit(path, 1, 0, [], { created: true });
    });
  });
  return vscode.Disposable.from(watcher, onDelete, onCreate);
}

function rel(uri: vscode.Uri): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) return undefined;
  const path = toPosix(relative(folder.uri.fsPath, uri.fsPath));
  if (!path || path.startsWith("..")) return undefined;
  const parts = path.split("/");
  if (parts.some((part) => SKIP.has(part) || part.startsWith("."))) return undefined;
  return path;
}
