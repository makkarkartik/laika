import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";

export class ShadowGit {
  constructor(
    private readonly workspace: string,
    private readonly gitDir: string,
  ) {}

  async checkpoint(reason: string): Promise<void> {
    mkdirSync(this.gitDir, { recursive: true });
    if (!existsSync(join(this.gitDir, "HEAD"))) {
      await this.git(["init", "--quiet"]);
      await this.git(["config", "user.email", "laika@local"]);
      await this.git(["config", "user.name", "Laika"]);
    }
    await this.git(["add", "-A"]);
    await this.git(["commit", "--quiet", "--allow-empty", "-m", reason.slice(0, 70)]);
  }

  private git(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("git", args, {
        cwd: this.workspace,
        env: { ...process.env, GIT_DIR: this.gitDir, GIT_WORK_TREE: this.workspace },
        windowsHide: true,
      });
      let err = "";
      child.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(err.trim() || `git ${args[0]} failed`));
      });
    });
  }
}

export function checkpointStore(context: vscode.ExtensionContext, workspace: string): ShadowGit {
  const gitDir = join(context.globalStorageUri.fsPath, "checkpoints", Buffer.from(workspace).toString("hex").slice(0, 32));
  mkdirSync(gitDir, { recursive: true });
  writeFileSync(join(context.globalStorageUri.fsPath, ".keep"), "", { flag: "a" });
  return new ShadowGit(workspace, gitDir);
}
