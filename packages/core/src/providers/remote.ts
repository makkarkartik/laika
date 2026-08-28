import type { ModelCatalog, ModelEntry, ProviderId } from "./types.js";

export type RemoteModel = {
  id: string;
  label: string;
  provider: ProviderId;
};

type FetchLike = (input: string | URL, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export function prettyModelId(id: string): string {
  return id
    .replace(/^models\//, "")
    .split("-")
    .map((part) => {
      if (/^gpt$/i.test(part)) return "GPT";
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function isOpenAiChatModel(id: string): boolean {
  const name = id.toLowerCase();
  if (/(embed|whisper|tts|dall-e|davinci|babbage|ada|moderation|realtime|transcribe|audio|search|sora|image|computer-use|omni-moderation)/.test(name)) {
    return false;
  }
  return /^(gpt-|o[1-9]|chatgpt)/.test(name);
}

export async function listProviderModels(
  provider: ProviderId,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<RemoteModel[]> {
  if (provider === "anthropic") return listAnthropic(apiKey, fetchImpl);
  return listOpenAi(apiKey, fetchImpl);
}

export function mergeRemoteCatalog(shipped: ModelCatalog, remote: RemoteModel[]): ModelCatalog {
  const known = new Map(shipped.models.map((model) => [model.id, model]));
  const models: ModelEntry[] = [];
  const seen = new Set<string>();
  for (const row of remote) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    models.push(known.get(row.id) ?? synthesize(row));
  }
  return { models };
}

function synthesize(row: RemoteModel): ModelEntry {
  const anthropic = row.provider === "anthropic";
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    contextWindow: anthropic ? 200000 : 128000,
    maxOutput: anthropic ? 8192 : 16384,
    supportsNativeTools: true,
    supportsParallelToolCalls: true,
    supportsImages: true,
    supportsCaching: anthropic,
    roles: ["main"],
    pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

async function listAnthropic(apiKey: string, fetchImpl: FetchLike): Promise<RemoteModel[]> {
  const out: RemoteModel[] = [];
  let after: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after_id", after);
    const body = await getJson(fetchImpl, url, {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
    const rows = asRecords(body?.data);
    for (const row of rows) {
      const id = asString(row.id);
      if (!id) continue;
      const label = asString(row.display_name) || prettyModelId(id);
      out.push({ id, label, provider: "anthropic" });
    }
    if (body?.has_more !== true) break;
    after = asString(body.last_id) ?? out.at(-1)?.id;
    if (!after) break;
  }
  return out;
}

async function listOpenAi(apiKey: string, fetchImpl: FetchLike): Promise<RemoteModel[]> {
  const body = await getJson(fetchImpl, "https://api.openai.com/v1/models", {
    Authorization: `Bearer ${apiKey}`,
  });
  const out: RemoteModel[] = [];
  for (const row of asRecords(body?.data)) {
    const id = asString(row.id);
    if (!id || !isOpenAiChatModel(id)) continue;
    out.push({ id, label: prettyModelId(id), provider: "openai" });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function getJson(fetchImpl: FetchLike, url: string | URL, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Model list failed (${res.status})`);
  const body = await res.json();
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
