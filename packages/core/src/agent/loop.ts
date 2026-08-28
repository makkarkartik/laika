import { missingUsage } from "../providers/usage.js";
import { evaluateToolCall } from "../policy/engine.js";
import { pathFromArgs, commandFromArgs, TOOL_DEFINITIONS, toolMeta } from "../tools/catalog.js";
import { classifyTask } from "./classify.js";
import { fingerprint, type AgentEvent, type RunTaskOptions, type TaskState, type ToolResult } from "./types.js";
import type { ChatMessage, ToolCall } from "../providers/types.js";

const DEFAULT_SYSTEM = [
  "You are Laika, a BYOK coding agent in VS Code.",
  "Use tools to inspect and change the workspace. Never claim you edited a file unless a tool did.",
  "Prefer read_file outlines or line ranges for large files. Keep chat brief — diffs and command output already show in the transcript.",
  "Delete files with delete_file, not the shell, so Orbit can show the removal.",
  "For multi-step work, call update_plan. After a mutation batch, wait for diagnostics before claiming done.",
].join(" ");

export async function* runTask(opts: RunTaskOptions): AsyncIterable<AgentEvent> {
  const maxTurns = opts.maxTurns ?? 20;
  const { signal, messages } = opts;
  const lastUser = [...messages].reverse().find((row) => row.role === "user");
  const kind = classifyTask(lastUser?.role === "user" ? lastUser.content : "");
  const repeats = new Map<string, number>();
  let mutatedPaths: string[] = [];
  let noMutationTurns = 0;

  const state = (next: TaskState, verb: string): AgentEvent => ({ type: "state", state: next, verb });

  yield state("intake", "classifying");
  yield { type: "thought", text: `classifying · ${kind}\n` };
  yield { type: "decision", rationale: `intake: ${kind}` };
  yield state("contextualize", "seeding context");
  yield { type: "thought", text: "seeding context\n" };
  if (kind === "multi-step") {
    yield state("planning", "planning");
    yield { type: "thought", text: "planning\n" };
  }
  yield state("executing", "thinking");
  yield { type: "thought", text: "thinking\n" };

  const system = [opts.system ?? DEFAULT_SYSTEM, kind === "multi-step" ? "This is multi-step work — keep update_plan current." : ""]
    .filter(Boolean)
    .join(" ");

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    if (signal.aborted) {
      yield { type: "done", state: "done" };
      return;
    }
    for (const note of opts.pullSteer?.() ?? []) {
      messages.push({ role: "user", content: `[steer] ${note}` });
      yield { type: "tool_log", summary: `Steer: ${note.length > 80 ? `${note.slice(0, 80)}…` : note}` };
      yield { type: "thought", text: `steer: ${note.length > 80 ? `${note.slice(0, 80)}…` : note}\n` };
    }
    if (turn === maxTurns) {
      messages.push({
        role: "user",
        content: "[budget] Last turn. Wrap up or ask to continue. Do not start a new mutation batch.",
      });
    }

    yield state("executing", turn === 1 ? "thinking" : `turn ${turn}`);
    if (turn > 1) yield { type: "thought", text: `turn ${turn}\n` };
    const assembled: ToolCall[] = [];
    let text = "";
    let usage = missingUsage();
    let stop = "end";

    try {
      for await (const event of opts.provider.complete({
        model: opts.model.id,
        messages,
        maxOutput: opts.model.maxOutput,
        system,
        tools: TOOL_DEFINITIONS,
        signal,
      })) {
        if (event.type === "text") {
          text += event.text;
          yield { type: "text", text: event.text };
        }
        if (event.type === "thinking") yield { type: "thought", text: event.text };
        if (event.type === "tool_call") assembled.push(event.call);
        if (event.type === "usage") usage = event.usage;
        if (event.type === "done") stop = event.stopReason;
      }
    } catch (err) {
      if (signal.aborted) {
        yield { type: "done", state: "done" };
        return;
      }
      yield { type: "error", message: err instanceof Error ? err.message : "Provider request failed" };
      return;
    }

    yield { type: "usage", usage };
    if (stop === "abort" || signal.aborted) {
      yield { type: "done", state: "done" };
      return;
    }

    const rationale = assembled.length
      ? `tools: ${assembled.map((call) => call.name).join(", ")}`
      : "no tools; ready to deliver";
    yield { type: "decision", rationale };
    yield { type: "thought", text: `${rationale}\n` };
    opts.host.audit({ type: "turn", turn, rationale, usage, stop });

    const assistant: ChatMessage = { role: "assistant", content: text };
    if (assembled.length) assistant.toolCalls = assembled;
    messages.push(assistant);

    if (!assembled.length) {
      yield state("delivering", "done");
      yield { type: "done", state: "done" };
      return;
    }

    let looping = false;
    for (const call of assembled) {
      const fp = fingerprint(call);
      const count = (repeats.get(fp) ?? 0) + 1;
      repeats.set(fp, count);
      if (count === 2) {
        messages.push({
          role: "user",
          content: `[observation] You already called ${call.name} with the same arguments. Do not repeat it; try a different approach.`,
        });
      }
      if (count >= 3) looping = true;
    }
    if (looping) {
      yield state("stalled", "repeating tools");
      yield { type: "error", message: "Paused: the same tool call repeated. Send a message to steer." };
      yield { type: "done", state: "stalled" };
      return;
    }

    const reads = assembled.filter((call) => toolMeta(call.name).class === "read");
    const writes = assembled.filter((call) => toolMeta(call.name).mutates);
    const rest = assembled.filter((call) => !toolMeta(call.name).mutates && toolMeta(call.name).class !== "read");

    const inbox: AgentEvent[] = [];
    const run = (call: ToolCall) => runCall(opts, call, inbox, signal);

    const results: Array<{ call: ToolCall; result: ToolResult }> = [];
    results.push(...(await Promise.all(reads.map(run))));
    yield* drain(inbox);

    if (writes.length) {
      yield state("executing", "checkpoint");
      await opts.host.checkpoint(`before ${writes.map((call) => call.name).join(",")}`);
      for (const call of writes) {
        if (signal.aborted) break;
        const path = pathFromArgs(call.name, call.input);
        yield state("executing", path ? `editing ${path}` : call.name);
        results.push(await run(call));
        yield* drain(inbox);
        const paths = results.at(-1)?.result.paths ?? [];
        mutatedPaths = [...new Set([...mutatedPaths, ...paths])];
      }
    }

    for (const call of rest) {
      if (signal.aborted) break;
      const command = commandFromArgs(call.input);
      yield state("executing", command ? `running ${command}` : call.name);
      results.push(await run(call));
      yield* drain(inbox);
    }

    let didMutate = false;
    for (const { call, result } of results) {
      const row: ChatMessage = {
        role: "tool",
        toolUseId: call.id,
        name: call.name,
        content: result.content,
      };
      if (result.isError) row.isError = true;
      messages.push(row);
      if (result.mutated) didMutate = true;
    }

    if (didMutate && mutatedPaths.length) {
      yield state("verifying", "checking diagnostics");
      const report = await opts.host.diagnostics(mutatedPaths);
      if (report) messages.push({ role: "user", content: `[diagnostics]\n${report}` });
      noMutationTurns = 0;
    } else if (kind === "edit") {
      noMutationTurns += 1;
      if (noMutationTurns >= 3) {
        yield state("stalled", "spinning?");
        yield { type: "error", message: "Paused: three turns with no edits. Send a message to steer." };
        yield { type: "done", state: "stalled" };
        return;
      }
    }
  }

  yield { type: "error", message: "Turn budget reached." };
  yield { type: "done", state: "stalled" };
}

async function runCall(
  opts: RunTaskOptions,
  call: ToolCall,
  inbox: AgentEvent[],
  signal: AbortSignal,
): Promise<{ call: ToolCall; result: ToolResult }> {
  const decision = evaluateToolCall(opts.policy, call.name, call.input);
  const summary = toolSummary(call);
  opts.host.audit({ type: "policy", tool: call.name, args: call.input, decision });

  if (decision.action === "deny") {
    inbox.push({ type: "tool_log", summary: `Denied ${call.name}` });
    return { call, result: { content: `Denied: ${decision.reason}`, summary: `Denied ${call.name}`, isError: true } };
  }

  if (decision.action === "ask") {
    inbox.push({ type: "approval", id: call.id, tool: call.name, summary, tier: decision.tier });
    const command = commandFromArgs(call.input);
    const request = {
      id: call.id,
      tool: call.name,
      summary,
      tier: decision.tier,
      ruleId: decision.ruleId,
    };
    const answer = await opts.ask(command !== undefined ? { ...request, command } : request, signal);
    if (answer === "deny") {
      inbox.push({ type: "tool_log", summary: `Denied ${call.name}` });
      return { call, result: { content: "User denied this tool call.", summary: `Denied ${call.name}`, isError: true } };
    }
    if (answer === "always") {
      const command = commandFromArgs(call.input);
      if (command) opts.policy.allowCommands.push(command);
    }
  }

  const command = commandFromArgs(call.input);
  const path = pathFromArgs(call.name, call.input);
  const isEdit = call.name === "replace" || call.name === "write_file" || call.name === "delete_file";
  const isCmd = call.name === "terminal";
  if (isCmd) {
    inbox.push({
      type: "tool_card",
      card: { kind: "command", id: call.id, command: command ?? "", output: "", running: true },
    });
  } else if (!isEdit) {
    inbox.push(toolLog(summary, path));
  }

  try {
    const result = await opts.host.invoke(call.name, call.input, signal);
    if (call.name === "update_plan") {
      const items = planItems(call.input);
      if (items) inbox.push({ type: "plan", items });
    }
    if (isEdit && result.mutated && result.paths?.[0]) {
      inbox.push({
        type: "tool_card",
        card: {
          kind: "edit",
          id: call.id,
          path: result.paths[0],
          plus: result.plus ?? 0,
          minus: result.minus ?? 0,
          hunks: result.hunks ?? [],
          ...(result.created ? { created: true } : {}),
          ...(result.deleted ? { deleted: true } : {}),
        },
      });
    } else if (isEdit && result.isError) {
      inbox.push(toolLog(result.summary, path));
    }
    if (isCmd) {
      inbox.push({
        type: "tool_card",
        card: {
          kind: "command",
          id: call.id,
          command: result.command ?? command ?? "",
          output: result.output ?? result.content,
          running: false,
          exit: result.exitCode ?? null,
          ...(result.isError ? { error: true } : {}),
        },
      });
    }
    return { call, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool failed";
    if (isCmd) {
      inbox.push({
        type: "tool_card",
        card: {
          kind: "command",
          id: call.id,
          command: command ?? "",
          output: message,
          running: false,
          error: true,
        },
      });
    }
    return { call, result: { content: message, summary: `${call.name} failed`, isError: true } };
  }
}

function* drain(inbox: AgentEvent[]): Iterable<AgentEvent> {
  while (inbox.length) {
    const next = inbox.shift();
    if (next) yield next;
  }
}

function toolLog(summary: string, path?: string): AgentEvent {
  if (path !== undefined) return { type: "tool_log", summary, path };
  return { type: "tool_log", summary };
}

export function toolSummary(call: ToolCall): string {
  const path = pathFromArgs(call.name, call.input);
  if (call.name === "read_file" && path) return `Read ${path}`;
  if (call.name === "replace" && path) return `Editing ${path}`;
  if (call.name === "write_file" && path) return `Writing ${path}`;
  if (call.name === "delete_file" && path) return `Deleting ${path}`;
  if (call.name === "search") {
    const pattern = (call.input as { pattern?: string } | undefined)?.pattern;
    return pattern ? `Search ${pattern}` : "Search";
  }
  if (call.name === "glob") {
    const pattern = (call.input as { pattern?: string } | undefined)?.pattern;
    return pattern ? `Glob ${pattern}` : "Glob";
  }
  if (call.name === "terminal") return `Ran ${commandFromArgs(call.input) ?? "command"}`;
  if (call.name === "update_plan") return "Updated plan";
  return call.name;
}

function planItems(input: unknown): Array<{ id: string; title: string; status: string }> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const items = (input as { items?: unknown }).items;
  if (!Array.isArray(items)) return undefined;
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; title?: unknown; status?: unknown };
    if (typeof row.id !== "string" || typeof row.title !== "string") return [];
    return [{ id: row.id, title: row.title, status: typeof row.status === "string" ? row.status : "pending" }];
  });
}

