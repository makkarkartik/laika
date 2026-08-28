import { z } from "zod";
import { canonicalUsageSchema } from "./providers/usage.js";

const hunkLine = z.object({
  type: z.enum(["add", "del", "ctx"]),
  text: z.string(),
});

const chatCard = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("log"),
    id: z.string(),
    text: z.string(),
    path: z.string().optional(),
  }),
  z.object({
    kind: z.literal("edit"),
    id: z.string(),
    path: z.string(),
    plus: z.number(),
    minus: z.number(),
    created: z.boolean().optional(),
    deleted: z.boolean().optional(),
    hunks: z.array(hunkLine),
  }),
  z.object({
    kind: z.literal("command"),
    id: z.string(),
    command: z.string(),
    output: z.string(),
    running: z.boolean().optional(),
    exit: z.number().nullable().optional(),
    error: z.boolean().optional(),
  }),
]);

const transcriptLine = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), text: z.string() }),
  z.object({
    kind: z.literal("assistant"),
    id: z.string(),
    text: z.string(),
    thought: z.string().optional(),
    cards: z.array(chatCard).optional(),
  }),
  z.object({ kind: z.literal("tick"), id: z.string(), text: z.string(), path: z.string().optional() }),
  z.object({ kind: z.literal("error"), id: z.string(), text: z.string() }),
]);

export const hostToWebview = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), version: z.string() }),
  z.object({ type: z.literal("orbit/set"), open: z.boolean() }),
  z.object({ type: z.literal("status"), text: z.string() }),
  z.object({ type: z.literal("autonomy"), mode: z.enum(["manual", "guarded", "autonomous"]) }),
  z.object({
    type: z.literal("session/restore"),
    lines: z.array(transcriptLine),
    busy: z.boolean(),
    status: z.string(),
  }),
  z.object({ type: z.literal("composer/attached"), paths: z.array(z.string()) }),
  z.object({ type: z.literal("chat/start"), id: z.string() }),
  z.object({ type: z.literal("chat/delta"), id: z.string(), text: z.string() }),
  z.object({ type: z.literal("thought/delta"), id: z.string(), text: z.string() }),
  z.object({
    type: z.literal("chat/done"),
    id: z.string(),
    usage: canonicalUsageSchema,
  }),
  z.object({ type: z.literal("chat/error"), id: z.string(), message: z.string() }),
  z.object({ type: z.literal("task/state"), state: z.string(), verb: z.string() }),
  z.object({
    type: z.literal("tool/log"),
    id: z.string(),
    summary: z.string(),
    path: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool/card"),
    id: z.string(),
    card: chatCard,
  }),
  z.object({
    type: z.literal("plan/set"),
    items: z.array(z.object({ id: z.string(), title: z.string(), status: z.string() })),
  }),
  z.object({
    type: z.literal("approval/ask"),
    id: z.string(),
    tool: z.string(),
    summary: z.string(),
    tier: z.string(),
  }),
  z.object({ type: z.literal("approval/clear") }),
  z.object({
    type: z.literal("models"),
    current: z.string(),
    items: z.array(z.object({ id: z.string(), label: z.string(), provider: z.string() })),
  }),
]);

export const webviewToHost = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello") }),
  z.object({ type: z.literal("orbit/toggle") }),
  z.object({ type: z.literal("composer/attach") }),
  z.object({
    type: z.literal("chat/send"),
    text: z.string(),
    attachments: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal("chat/abort") }),
  z.object({ type: z.literal("chat/popout") }),
  z.object({ type: z.literal("editor/reveal"), path: z.string() }),
  z.object({ type: z.literal("model/set"), id: z.string() }),
  z.object({ type: z.literal("keys/manage") }),
  z.object({
    type: z.literal("approval/respond"),
    id: z.string(),
    decision: z.enum(["allow", "deny", "always"]),
  }),
]);

export type HostToWebview = z.infer<typeof hostToWebview>;
export type WebviewToHost = z.infer<typeof webviewToHost>;

export function parseHostToWebview(raw: unknown): HostToWebview {
  return hostToWebview.parse(raw);
}

export function parseWebviewToHost(raw: unknown): WebviewToHost {
  return webviewToHost.parse(raw);
}
