import type { RiskTier } from "./types.js";

export type ShellSegment = {
  raw: string;
  bin: string;
};

/**
 * Split a command on top-level `&&`, `||`, `;`, `|`, and `&` while respecting quotes.
 * Enough to catch `rm -rf` hidden behind `&&` without a full bash grammar.
 */
export function splitShell(command: string): ShellSegment[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "`") {
      current += ch;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      parts.push(current);
      current = "";
      i += 1;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&" || ch === "\n") {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, bin: firstToken(raw) }));
}

export function firstToken(segment: string): string {
  const trimmed = segment.trim().replace(/^\(+/, "");
  const match = /^[^\s]+/.exec(trimmed);
  return (match?.[0] ?? "").replace(/["']/g, "");
}

const DESTRUCTIVE: Array<(seg: ShellSegment) => boolean> = [
  (seg) => seg.bin === "rm" && /\s-[a-zA-Z]*r[a-zA-Z]*f\b|\s-[a-zA-Z]*f[a-zA-Z]*r\b|\s--recursive\b/.test(` ${seg.raw}`),
  (seg) => seg.bin === "git" && /\bpush\b/.test(seg.raw) && /(\s--force\b|\s-f\b)/.test(seg.raw),
  (seg) => seg.bin === "dd",
  (seg) => seg.bin === "chmod" && /\s-R\b|\s--recursive\b/.test(seg.raw),
  (seg) => seg.bin === "mkfs" || seg.bin.startsWith("mkfs."),
  (seg) => /\b(npm|pnpm|yarn|bun)\s+publish\b/.test(seg.raw),
  (seg) => /\|\s*(ba)?sh\b/.test(seg.raw) && /\b(curl|wget)\b/.test(seg.raw),
];

const NETWORK = new Set(["curl", "wget", "nc", "ncat", "ssh", "scp", "sftp", "ftp"]);

export function classifySegment(seg: ShellSegment): RiskTier {
  if (DESTRUCTIVE.some((fn) => fn(seg))) return "destructive";
  if (NETWORK.has(seg.bin)) return "high";
  return "low";
}

export function classifyCommand(command: string): { segments: ShellSegment[]; tier: RiskTier } {
  const segments = splitShell(command);
  let tier: RiskTier = segments.length === 0 ? "low" : "safe";
  for (const seg of segments) {
    const next = classifySegment(seg);
    if (rank(next) > rank(tier)) tier = next;
  }
  if (/\b(curl|wget)\b/.test(command) && /\|\s*(ba)?sh\b/.test(command)) tier = "destructive";
  return { segments, tier };
}

function rank(tier: RiskTier): number {
  if (tier === "safe") return 0;
  if (tier === "low") return 1;
  if (tier === "high") return 2;
  return 3;
}
