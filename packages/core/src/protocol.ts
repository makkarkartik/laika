import { z } from "zod";
import { canonicalUsageSchema } from "./providers/usage.js";

export const hostToWebview = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    version: z.string(),
  }),
  z.object({
    type: z.literal("orbit/set"),
    open: z.boolean(),
  }),
  z.object({
    type: z.literal("status"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("chat/start"),
    id: z.string(),
  }),
  z.object({
    type: z.literal("chat/delta"),
    id: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("chat/done"),
    id: z.string(),
    usage: canonicalUsageSchema,
  }),
  z.object({
    type: z.literal("chat/error"),
    id: z.string(),
    message: z.string(),
  }),
]);

export const webviewToHost = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello") }),
  z.object({ type: z.literal("orbit/toggle") }),
  z.object({ type: z.literal("chat/send"), text: z.string().min(1) }),
]);

export type HostToWebview = z.infer<typeof hostToWebview>;
export type WebviewToHost = z.infer<typeof webviewToHost>;

export function parseHostToWebview(raw: unknown): HostToWebview {
  return hostToWebview.parse(raw);
}

export function parseWebviewToHost(raw: unknown): WebviewToHost {
  return webviewToHost.parse(raw);
}
