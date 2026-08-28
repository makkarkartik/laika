import { describe, expect, it } from "vitest";
import { runTask } from "./loop.js";
import { DEFAULT_POLICY } from "../policy/schema.js";
import type { AgentHost, ToolResult } from "./types.js";
import type { LLMProvider, ResolvedModel, StreamEvent } from "../providers/types.js";

const model: ResolvedModel = {
  id: "test-model",
  provider: "anthropic",
  label: "Test",
  contextWindow: 100000,
  maxOutput: 1024,
  supportsNativeTools: true,
  supportsParallelToolCalls: true,
  supportsImages: false,
  supportsCaching: false,
  roles: ["main"],
  pricing: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
};

class Scripted implements LLMProvider {
  readonly id = "anthropic" as const;
  constructor(private readonly turns: StreamEvent[][]) {}
  async *complete(): AsyncIterable<StreamEvent> {
    const turn = this.turns.shift() ?? [{ type: "done", stopReason: "end" }];
    for (const event of turn) yield event;
  }
}

function host(handlers: Record<string, (args: unknown) => ToolResult | Promise<ToolResult>>): AgentHost {
  return {
    async invoke(name, args) {
      const fn = handlers[name];
      if (!fn) return { content: `unknown ${name}`, summary: name, isError: true };
      return fn(args);
    },
    async checkpoint() {},
    async diagnostics() {
      return "";
    },
    audit() {},
  };
}

async function collect(iter: AsyncIterable<unknown>) {
  const out: unknown[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe("agent loop", () => {
  it("delivers when the model answers without tools", async () => {
    const events = await collect(
      runTask({
        provider: new Scripted([
          [
            { type: "text", text: "hi" },
            { type: "usage", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, estimated: false } },
            { type: "done", stopReason: "end" },
          ],
        ]),
        model,
        host: host({}),
        policy: { ...DEFAULT_POLICY },
        ask: async () => "allow",
        messages: [{ role: "user", content: "what is a monad?" }],
        signal: new AbortController().signal,
      }),
    );
    expect(events.some((e) => e && typeof e === "object" && (e as { type: string }).type === "text")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done", state: "done" });
  });

  it("runs a read tool then finishes on the next turn", async () => {
    const events = await collect(
      runTask({
        provider: new Scripted([
          [
            { type: "tool_call", call: { id: "1", name: "read_file", input: { path: "a.ts" } } },
            { type: "done", stopReason: "tool_use" },
          ],
          [
            { type: "text", text: "looks fine" },
            { type: "done", stopReason: "end" },
          ],
        ]),
        model,
        host: host({
          read_file: () => ({ content: "export const x = 1", summary: "Read a.ts" }),
        }),
        policy: { ...DEFAULT_POLICY },
        ask: async () => "allow",
        messages: [{ role: "user", content: "what is in a.ts?" }],
        signal: new AbortController().signal,
      }),
    );
    expect(events.some((e) => JSON.stringify(e).includes("Read a.ts"))).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done", state: "done" });
  });

  it("stalls on a third identical tool call", async () => {
    const call = { id: "1", name: "read_file", input: { path: "a.ts" } };
    const turn: StreamEvent[] = [{ type: "tool_call", call }, { type: "done", stopReason: "tool_use" }];
    const events = await collect(
      runTask({
        provider: new Scripted([
          turn.map((e) => structuredClone(e)),
          [{ type: "tool_call", call: { ...call, id: "2" } }, { type: "done", stopReason: "tool_use" }],
          [{ type: "tool_call", call: { ...call, id: "3" } }, { type: "done", stopReason: "tool_use" }],
        ]),
        model,
        host: host({
          read_file: () => ({ content: "ok", summary: "Read a.ts" }),
        }),
        policy: { ...DEFAULT_POLICY },
        ask: async () => "allow",
        messages: [{ role: "user", content: "read a.ts please" }],
        signal: new AbortController().signal,
      }),
    );
    expect(events.at(-1)).toEqual({ type: "done", state: "stalled" });
  });

  it("does not execute a denied edit", async () => {
    let invoked = false;
    await collect(
      runTask({
        provider: new Scripted([
          [
            {
              type: "tool_call",
              call: { id: "1", name: "write_file", input: { path: ".laika/policy.json", contents: "{}" } },
            },
            { type: "done", stopReason: "tool_use" },
          ],
          [{ type: "text", text: "stopped" }, { type: "done", stopReason: "end" }],
        ]),
        model,
        host: host({
          write_file: () => {
            invoked = true;
            return { content: "wrote", summary: "wrote", mutated: true };
          },
        }),
        policy: { ...DEFAULT_POLICY },
        ask: async () => "allow",
        messages: [{ role: "user", content: "overwrite the policy file" }],
        signal: new AbortController().signal,
      }),
    );
    expect(invoked).toBe(false);
  });

  it("injects pullSteer notes at the next turn, not as a new task", async () => {
    const extra: string[] = [];
    const messages = [{ role: "user" as const, content: "edit a.ts" }];
    const events = await collect(
      runTask({
        provider: new Scripted([
          [
            { type: "tool_call", call: { id: "1", name: "read_file", input: { path: "a.ts" } } },
            { type: "done", stopReason: "tool_use" },
          ],
          [{ type: "text", text: "switched" }, { type: "done", stopReason: "end" }],
        ]),
        model,
        host: host({
          read_file: () => {
            extra.push("prefer b.ts instead");
            return { content: "ok", summary: "Read a.ts" };
          },
        }),
        policy: { ...DEFAULT_POLICY },
        ask: async () => "allow",
        messages,
        signal: new AbortController().signal,
        pullSteer: () => extra.splice(0),
      }),
    );
    expect(messages.some((row) => row.role === "user" && row.content.includes("[steer] prefer b.ts instead"))).toBe(true);
    expect(events.some((e) => JSON.stringify(e).includes("Steer: prefer b.ts instead"))).toBe(true);
  });
});
