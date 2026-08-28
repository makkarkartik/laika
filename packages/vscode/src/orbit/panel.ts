import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { listWorkspaceFiles } from "../tools/search.js";
import type { OrbitFile, OrbitStore } from "./store.js";

export class OrbitPanel {
  private panel: vscode.WebviewPanel | undefined;
  private unsub: (() => void) | undefined;
  private viewReady = false;
  onClosed: (() => void) | undefined;

  constructor(
    _context: vscode.ExtensionContext,
    private readonly store: OrbitStore,
  ) {}

  get open() {
    return Boolean(this.panel);
  }

  toggle() {
    if (this.panel) this.close();
    else void this.show();
  }

  close() {
    this.unsub?.();
    this.unsub = undefined;
    this.viewReady = false;
    this.panel?.dispose();
    this.panel = undefined;
    this.onClosed?.();
  }

  async show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      if (this.viewReady) await this.push();
      return;
    }
    const panel = vscode.window.createWebviewPanel("laika.orbit", "Orbit", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    this.panel = panel;
    this.viewReady = false;
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.viewReady = false;
      this.unsub?.();
      this.unsub = undefined;
      this.onClosed?.();
    });
    panel.webview.onDidReceiveMessage((raw: unknown) => {
      const msg = raw as { type?: string; path?: string };
      if (msg.type === "ready") {
        this.viewReady = true;
        void this.push();
        return;
      }
      if (msg.type === "close") this.close();
      if (msg.type === "open" && msg.path) {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) return;
        void vscode.window.showTextDocument(vscode.Uri.joinPath(folder.uri, msg.path), { preview: true });
        this.close();
      }
    });
    this.unsub = this.store.onChange(() => {
      if (this.viewReady) void this.push();
    });
    panel.webview.html = orbitHtml(panel.webview, this.payload());
  }

  private payload() {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const paths = folder ? listWorkspaceFiles(folder).slice(0, 480) : [];
    const { files, livePath } = this.store.snapshot();
    const allPaths = [...new Set([...paths, ...files.map((file) => file.path)])].sort();
    const withPreview = files.map((file) => {
      const hunks = file.hunks ?? [];
      const preview = (file.preview?.length ? file.preview : peekFile(folder, file)).map((line) =>
        line.length > 160 ? `${line.slice(0, 160)}…` : line,
      );
      return {
        ...file,
        preview,
        hunks: hunks.length
          ? hunks
          : peekFile(folder, file).map((text) => ({
              type: file.badge === "gone" ? ("del" as const) : ("ctx" as const),
              text,
            })),
      };
    });
    return { paths: allPaths, files: withPreview, livePath: livePath ?? null };
  }

  private async push() {
    if (!this.panel || !this.viewReady) return;
    void this.panel.webview.postMessage({ type: "orbit/data", ...this.payload() });
  }
}

function peekFile(folder: string | undefined, file: OrbitFile): string[] {
  if (file.badge === "gone") return file.preview.length ? file.preview : ["(deleted)"];
  if (!folder) return ["(no preview)"];
  try {
    return readFileSync(join(folder, file.path), "utf8")
      .split(/\r?\n/)
      .slice(0, 80)
      .map((line) => (line.length > 160 ? `${line.slice(0, 160)}…` : line));
  } catch {
    return [`(couldn't read ${file.path})`];
  }
}

function orbitHtml(_webview: vscode.Webview, boot: { paths: string[]; files: unknown[]; livePath: string | null }): string {
  const nonce = webviewNonce();
  const data = JSON.stringify(boot).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
:root{--bg:#1e1e1e;--side:#252526;--border:#3e3e42;--text:#ccc;--bright:#e8e8e8;--muted:#9d9d9d;--steel:#8fa4b3;--cache:#73c991;--danger:#f14c4c}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--bg);color:var(--text);font:13px/1.4 "Segoe UI",system-ui,sans-serif}
.aerial{height:100%;display:flex;flex-direction:column}
.head{display:flex;align-items:center;gap:12px;padding:10px 16px 8px;border-bottom:1px solid var(--border);flex:none}
.head strong{color:var(--bright)}
.sub{color:var(--muted);font-size:12px}
.stats{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--muted);font-size:12px}
.close{color:var(--muted);cursor:pointer;background:none;border:0;font:inherit;padding:2px 6px}
.close:hover{color:var(--bright)}
.stage{flex:1;min-height:0;display:flex}
.stage-left{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--bg)}
.stage-right{flex:none;width:280px;border-left:1px solid var(--border);background:var(--side);display:flex;flex-direction:column;min-width:0}
.tree-head{flex:none;padding:8px 12px 6px;color:#6e6e6e;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
.tree{flex:1;overflow:auto;padding:4px 0 16px}
.dir{margin:0}
.dir-head{display:flex;align-items:center;gap:6px;width:100%;padding:3px 12px;border:0;background:none;color:#8b8b8b;font:inherit;font-size:11px;letter-spacing:.02em;text-align:left;cursor:default}
.dir.is-hot.is-add>.dir-head{color:#b6d9c2}
.dir.is-hot.is-del>.dir-head{color:#e0b4b4}
.dir.is-hot.is-mix>.dir-head{color:var(--text)}
.dir-kids{padding-left:12px}
.file{display:flex;align-items:center;gap:8px;width:100%;padding:4px 12px;border:0;background:transparent;color:var(--muted);font:inherit;font-size:12px;text-align:left;cursor:pointer}
.file.is-hot.is-add{background:rgba(115,201,145,.08)}
.file.is-hot.is-del{background:rgba(241,76,76,.09)}
.file.is-hot.is-mix{background:linear-gradient(90deg,rgba(115,201,145,.08),rgba(241,76,76,.08))}
.file.is-read{background:rgba(143,164,179,.06)}
.file .name{display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transform:translateY(0);transition:transform 160ms cubic-bezier(.2,.8,.2,1),color 160ms ease}
.file:hover .name,.file.is-on .name{transform:translateY(-3px);color:var(--bright)}
.file.is-hot.is-add .name{color:#b6d9c2}
.file.is-hot.is-del .name{color:#e0b4b4}
.file.is-hot.is-mix .name{color:var(--text)}
.file.is-live{box-shadow:inset 2px 0 0 var(--steel)}
.file.is-on{background:rgba(143,164,179,.08)}
.heat{width:3px;height:12px;border-radius:1px;margin-left:auto;flex:none;background:#3a3a3a}
.heat.is-add{background:var(--cache)}
.heat.is-del{background:var(--danger)}
.heat.is-mix{background:linear-gradient(180deg,var(--cache) 50%,var(--danger) 50%)}
.heat.is-read{background:var(--steel);opacity:.55}
.plus{color:var(--cache)} .minus{color:var(--danger)}
.badge{color:var(--cache);font-size:10px;text-transform:uppercase}
.badge.gone{color:var(--danger)}
.peek{flex:1;min-height:0;display:flex;flex-direction:column}
.peek-head{display:flex;align-items:baseline;gap:10px;padding:14px 20px 10px;border-bottom:1px solid var(--border)}
.peek-head b{color:var(--bright);font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.peek-head .tally{color:var(--muted);font-size:11px;flex:none}
.peek-body{flex:1;overflow:auto;padding:12px 0 24px}
.hunk{font:12px/1.55 Consolas,ui-monospace,monospace;padding:0 20px;white-space:pre-wrap;word-break:break-word}
.hunk.is-add{background:rgba(115,201,145,.12);color:#d7edd9}
.hunk.is-del{background:rgba(241,76,76,.12);color:#f0c4c4}
.hunk.is-ctx{color:var(--muted)}
.hunk.is-add::before{content:"+ ";color:var(--cache)}
.hunk.is-del::before{content:"− ";color:var(--danger)}
.empty{color:var(--muted);font-size:13px;padding:48px 24px;max-width:28em}
</style></head>
<body>
<div class="aerial">
  <header class="head"><strong>Orbit</strong><span class="sub" id="sub">workspace · waiting</span><span class="stats" id="stats">0 files</span><button class="close" id="close" type="button">Esc</button></header>
  <div class="stage">
    <section class="stage-left" id="peek"></section>
    <aside class="stage-right"><div class="tree-head">Explorer</div><div class="tree" id="tree"></div></aside>
  </div>
</div>
<script nonce="${nonce}">
const api = acquireVsCodeApi();
function esc(value) {
  return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
let data = ${data};
let focus = null;
const fileMap = () => Object.fromEntries((data.files||[]).map(f => [f.path, f]));
function heatOf(path) {
  const f = fileMap()[path];
  if (!f) return "";
  if (f.plus || f.minus || f.badge === "gone") return f.kind === "del" || f.badge === "gone" ? "del" : f.kind === "mix" ? "mix" : "add";
  if (f.kind === "read") return "read";
  return "";
}
function fileClass(path) {
  let c = "file";
  const heat = heatOf(path);
  if (heat && heat !== "read") c += " is-hot is-" + heat;
  else if (heat === "read") c += " is-read";
  if (data.livePath === path) c += " is-live";
  if (focus === path) c += " is-on";
  return c;
}
function buildTree(paths) {
  const root = { name: "", dirs: {}, files: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i];
      node.dirs[name] = node.dirs[name] || { name: name, dirs: {}, files: [] };
      node = node.dirs[name];
    }
    node.files.push(path);
  }
  return root;
}
function dirHeat(node) {
  const kinds = {};
  function walk(n) {
    n.files.forEach(function(path) {
      const h = heatOf(path);
      if (h && h !== "read") kinds[h] = true;
    });
    Object.keys(n.dirs).forEach(function(name) { walk(n.dirs[name]); });
  }
  walk(node);
  if (kinds.mix || (kinds.add && kinds.del)) return "mix";
  if (kinds.del) return "del";
  if (kinds.add) return "add";
  return "";
}
function renderDir(node) {
  const names = Object.keys(node.dirs).sort();
  const files = node.files.slice().sort();
  let html = "";
  for (const name of names) {
    const child = node.dirs[name];
    const heat = dirHeat(child);
    html += '<div class="dir' + (heat ? " is-hot is-" + heat : "") + '"><div class="dir-head">' + esc(name) + '</div><div class="dir-kids">' + renderDir(child) + "</div></div>";
  }
  for (const path of files) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const heat = heatOf(path);
    html += '<button class="' + fileClass(path) + '" type="button" data-path="' + esc(path) + '"><span class="name">' + esc(name) + '</span><span class="heat' + (heat ? " is-" + heat : "") + '"></span></button>';
  }
  return html;
}
function renderPeek(path) {
  const pane = document.getElementById("peek");
  const f = path ? fileMap()[path] : null;
  if (!path) {
    pane.innerHTML = '<div class="empty">Hover a file on the right. Names lift; this pane shows the change. Double-click to open in the editor.</div>';
    return;
  }
  const split = path.lastIndexOf("/");
  const name = split < 0 ? path : path.slice(split + 1);
  const dir = split < 0 ? "" : path.slice(0, split + 1);
  const plus = f ? f.plus : 0;
  const minus = f ? f.minus : 0;
  const badge = f && f.badge === "gone" ? '<span class="badge gone">gone</span>' : f && f.badge === "new" ? '<span class="badge">new</span>' : "";
  const hunks = (f && f.hunks && f.hunks.length ? f.hunks : (f && f.preview || []).map(function(text) { return { type: "ctx", text: text }; }));
  const body = hunks.length
    ? hunks.map(function(h) { return '<div class="hunk is-' + esc(h.type) + '">' + esc(h.text || " ") + "</div>"; }).join("")
    : '<div class="empty">No diff for this file yet — it is in the tree, untouched.</div>';
  pane.innerHTML = '<div class="peek"><header class="peek-head"><b title="' + esc(path) + '">' + esc(dir) + esc(name) + "</b>" + badge + '<span class="tally"><span class="plus">+' + plus + '</span> <span class="minus">−' + minus + '</span></span></header><div class="peek-body">' + body + "</div></div>";
}
function render() {
  const files = data.files || [];
  const hot = files.filter(function(f) { return f.plus || f.minus || f.live; });
  const plus = hot.reduce(function(n,f){ return n+(f.plus||0); },0);
  const minus = hot.reduce(function(n,f){ return n+(f.minus||0); },0);
  document.getElementById("stats").innerHTML = hot.length + " file" + (hot.length===1?"":"s") + ' · <span class="plus">+' + plus + '</span> <span class="minus">−' + minus + "</span>";
  document.getElementById("sub").textContent = data.livePath ? ("morphing · " + data.livePath) : (hot.length ? "hover the tree" : "workspace · waiting");
  if (!focus) {
    if (data.livePath) focus = data.livePath;
    else if (hot[0]) focus = hot[0].path;
  }
  document.getElementById("tree").innerHTML = renderDir(buildTree(data.paths || []));
  renderPeek(focus);
}
window.addEventListener("message", function(e) { if (e.data && e.data.type === "orbit/data") { data = e.data; render(); } });
document.getElementById("close").onclick = function() { api.postMessage({ type: "close" }); };
window.addEventListener("keydown", function(e) { if (e.key === "Escape") api.postMessage({ type: "close" }); });
document.getElementById("tree").addEventListener("mouseover", function(e) {
  const t = e.target.closest("[data-path]");
  if (!t) return;
  focus = t.getAttribute("data-path");
  document.querySelectorAll(".file.is-on").forEach(function(n) { n.classList.remove("is-on"); });
  t.classList.add("is-on");
  renderPeek(focus);
});
document.addEventListener("dblclick", function(e) {
  const t = e.target.closest("[data-path]");
  if (t) api.postMessage({ type: "open", path: t.getAttribute("data-path") });
});
render();
api.postMessage({ type: "ready" });
</script></body></html>`;
}

function webviewNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
