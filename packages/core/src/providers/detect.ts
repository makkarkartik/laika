import type { ProviderId } from "./types.js";

/** Infer provider from a pasted BYOK key. Ambiguous keys return undefined. */
export function detectProviderFromKey(raw: string): ProviderId | undefined {
  const key = raw.trim();
  if (!key) return undefined;
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openai";
  if (/^sk-[A-Za-z0-9_-]{8,}$/.test(key)) return "openai";
  return undefined;
}
