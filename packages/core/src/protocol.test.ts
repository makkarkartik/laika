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
    expect(parseWebviewToHost({ type: "chat/send", text: "hello" })).toEqual({
      type: "chat/send",
      text: "hello",
    });
    expect(
      parseHostToWebview({
        type: "chat/done",
        id: "1",
        usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0, estimated: false },
      }),
    ).toMatchObject({ type: "chat/done", id: "1" });
  });
});
