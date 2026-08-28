import { existsSync } from "node:fs";
import { dirname } from "node:path";
import * as vscode from "vscode";
import { countHunks, hunksFromReplace, hunksFromWrite, hunksFromDelete, splitLines, type ToolResult } from "@laika/core";
import { resolveWorkspacePath } from "@laika/core/jail";

export class WatchLane implements vscode.Disposable {
  private readonly added: vscode.TextEditorDecorationType;
  private readonly removed: vscode.TextEditorDecorationType;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly column: () => vscode.ViewColumn) {
    this.added = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(115, 201, 145, 0.14)",
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
      borderColor: "#73C991",
      overviewRulerColor: "#73C991",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.removed = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(241, 76, 76, 0.12)",
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
      borderColor: "#F14C4C",
      overviewRulerColor: "#F14C4C",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  }

  dispose() {
    this.added.dispose();
    this.removed.dispose();
    for (const timer of this.timers.values()) clearTimeout(timer);
  }

  async revealPath(root: string, rel: string, preview = false) {
    const abs = resolveWorkspacePath(root, rel);
    if (!existsSync(abs) && preview) return;
    await this.revealUri(vscode.Uri.file(abs), { preview });
  }

  async applyReplace(root: string, args: { path: string; old_string: string; new_string: string }): Promise<ToolResult> {
    const abs = resolveWorkspacePath(root, args.path);
    const uri = vscode.Uri.file(abs);
    const editor = await this.revealUri(uri, { preview: false });
    const doc = editor.document;
    const eol = doc.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
    const needle = args.old_string.replace(/\r?\n/g, eol);
    const replacement = args.new_string.replace(/\r?\n/g, eol);
    const text = doc.getText();
    const count = text.split(needle).length - 1;
    if (count === 0) {
      return { content: "old_string not found", summary: `Replace failed in ${args.path}`, isError: true };
    }
    if (count > 1) {
      return {
        content: `old_string matched ${count} times — it must be unique. Add surrounding lines.`,
        summary: `Replace failed in ${args.path}`,
        isError: true,
      };
    }
    const start = text.indexOf(needle);
    const range = new vscode.Range(doc.positionAt(start), doc.positionAt(start + needle.length));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, replacement);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
    const hunks = hunksFromReplace(args.old_string, args.new_string);
    const { plus, minus } = countHunks(hunks);
    const after = doc.positionAt(start + replacement.length);
    const shown = new vscode.Range(range.start, after);
    editor.revealRange(shown, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    this.paint(editor, plus >= minus ? this.added : this.removed, shown);
    return {
      content: `Replaced 1 site in ${args.path} (+${plus} −${minus})`,
      summary: `Editing ${args.path}  +${plus} −${minus}`,
      mutated: true,
      paths: [args.path],
      plus,
      minus,
      preview: args.new_string.split(/\r?\n/).slice(0, 14),
      hunks,
    };
  }

  async applyWrite(root: string, args: { path: string; contents: string }): Promise<ToolResult> {
    const abs = resolveWorkspacePath(root, args.path);
    const uri = vscode.Uri.file(abs);
    const created = !existsSync(abs);
    if (created) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirname(abs)));
      await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    }
    const editor = await this.revealUri(uri, { preview: false });
    const doc = editor.document;
    const before = created ? undefined : doc.getText();
    const span = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, span, args.contents);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
    const hunks = hunksFromWrite(args.contents, before);
    const { plus, minus } = countHunks(hunks);
    const last = Math.max(0, editor.document.lineCount - 1);
    const shown = new vscode.Range(0, 0, last, editor.document.lineAt(last).text.length);
    editor.revealRange(new vscode.Range(0, 0, Math.min(12, last), 0), vscode.TextEditorRevealType.Default);
    this.paint(editor, plus >= minus ? this.added : this.removed, shown);
    return {
      content: `Wrote ${args.path} (${splitLines(args.contents).length} lines, +${plus} −${minus})`,
      summary: `Wrote ${args.path}`,
      mutated: true,
      paths: [args.path],
      plus,
      minus,
      created,
      preview: args.contents.split(/\r?\n/).slice(0, 14),
      hunks,
    };
  }

  async applyDelete(root: string, args: { path: string }): Promise<ToolResult> {
    const abs = resolveWorkspacePath(root, args.path);
    const uri = vscode.Uri.file(abs);
    if (!existsSync(abs)) {
      return { content: `${args.path} does not exist`, summary: `Delete failed ${args.path}`, isError: true };
    }
    const before =
      this.openText(abs) ?? new TextDecoder("utf8").decode(await vscode.workspace.fs.readFile(uri));
    await vscode.workspace.fs.delete(uri, { useTrash: false });
    const hunks = hunksFromDelete(before);
    const minus = splitLines(before).length;
    return {
      content: `Deleted ${args.path} (${minus} lines)`,
      summary: `Deleted ${args.path}`,
      mutated: true,
      deleted: true,
      paths: [args.path],
      plus: 0,
      minus,
      preview: before.split(/\r?\n/).slice(0, 14),
      hunks,
    };
  }

  openText(abs: string): string | undefined {
    const uri = vscode.Uri.file(abs);
    return vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === uri.fsPath)?.getText();
  }

  private async revealUri(uri: vscode.Uri, opts: { preview: boolean }) {
    return vscode.window.showTextDocument(uri, {
      viewColumn: this.column(),
      preview: opts.preview,
      preserveFocus: true,
    });
  }

  private paint(editor: vscode.TextEditor, kind: vscode.TextEditorDecorationType, range: vscode.Range) {
    editor.setDecorations(kind, [range]);
    const key = editor.document.uri.toString();
    const prev = this.timers.get(key);
    if (prev) clearTimeout(prev);
    this.timers.set(
      key,
      setTimeout(() => {
        editor.setDecorations(this.added, []);
        editor.setDecorations(this.removed, []);
        this.timers.delete(key);
      }, 8000),
    );
  }
}
