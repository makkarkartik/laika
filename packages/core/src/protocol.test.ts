import { describe, expect, it } from "vitest";
import { parseHostToWebview, parseWebviewToHost } from "./protocol.js";

describe("protocol", () => {
  it("accepts a ready event", () => {
    expect(parseHostToWebview({ type: "ready", version: "0.0.1" })).toEqual({
      type: "ready",
      version: "0.0.1",
    });
  });

  it("rejects an unknown webview message", () => {
    expect(() => parseWebviewToHost({ type: "explode" })).toThrow();
  });

  it("accepts a chat send and a usage-anchored done event", () => {
    expect(parseWebviewToHost({ type: "chat/send", text: "hello", attachments: ["src/a.ts"] })).toEqual({
      type: "chat/send",
      text: "hello",
      attachments: ["src/a.ts"],
    });
    expect(
      parseHostToWebview({
        type: "chat/done",
        id: "1",
        usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0, estimated: false },
      }),
    ).toMatchObject({ type: "chat/done", id: "1" });
  });

  it("accepts model switch, keys, and popout", () => {
    expect(parseWebviewToHost({ type: "model/set", id: "gpt-4.1" })).toEqual({
      type: "model/set",
      id: "gpt-4.1",
    });
    expect(parseWebviewToHost({ type: "keys/manage" })).toEqual({ type: "keys/manage" });
    expect(
      parseHostToWebview({
        type: "tool/card",
        id: "1",
        card: {
          kind: "edit",
          id: "c1",
          path: "src/a.ts",
          plus: 2,
          minus: 1,
          hunks: [{ type: "del", text: "old" }, { type: "add", text: "new" }],
        },
      }),
    ).toMatchObject({ type: "tool/card", id: "1" });
    expect(
      parseHostToWebview({
        type: "models",
        current: "claude-sonnet-4-5",
        items: [{ id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic" }],
      }),
    ).toMatchObject({ type: "models", current: "claude-sonnet-4-5" });
  });
});
