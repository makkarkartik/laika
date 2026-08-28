import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWorkspacePath, WorkspaceJailError } from "./jail.js";

describe("workspace jail", () => {
  it("resolves relative paths and rejects escapes", () => {
    const root = mkdtempSync(join(tmpdir(), "laika-jail-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), "x");
    expect(resolveWorkspacePath(root, "src/a.ts")).toContain("a.ts");
    expect(() => resolveWorkspacePath(root, "../secret")).toThrow(WorkspaceJailError);
  });
});
