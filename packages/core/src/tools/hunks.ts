export type HunkLine = { type: "add" | "del" | "ctx"; text: string };

/** Safety bound per change so a pathological write cannot balloon the transcript or Orbit payloads. */
export const MAX_HUNK_LINES = 4000;
/** Unchanged lines kept around each change, unified-diff style. */
const CONTEXT = 2;
/** Above this many DP cells the LCS falls back to "all removed, all added". */
const LCS_CELL_BUDGET = 4_000_000;
/** Marker line standing in for elided unchanged lines between hunks. */
export const GAP: HunkLine = { type: "ctx", text: "⋯" };

/** Split into lines; an empty string is zero lines and a single trailing newline does not add one. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function countHunks(hunks: HunkLine[]): { plus: number; minus: number } {
  let plus = 0;
  let minus = 0;
  for (const hunk of hunks) {
    if (hunk.type === "add") plus += 1;
    else if (hunk.type === "del") minus += 1;
  }
  return { plus, minus };
}

/** Line diff (LCS) with CONTEXT unchanged lines around each change; distant hunks are separated by GAP. */
export function diffLines(before: string, after: string): HunkLine[] {
  if (before === after) return [];
  const a = splitLines(before);
  const b = splitLines(after);
  const ops = a.length * b.length > LCS_CELL_BUDGET ? naiveOps(a, b) : lcsOps(a, b);
  return withContext(ops).slice(0, MAX_HUNK_LINES);
}

export function hunksFromReplace(oldString: string, newString: string): HunkLine[] {
  return diffLines(oldString, newString);
}

/** A created file is all additions; an overwrite diffs against the previous contents. */
export function hunksFromWrite(contents: string, before?: string): HunkLine[] {
  if (before === undefined) {
    return splitLines(contents)
      .slice(0, MAX_HUNK_LINES)
      .map((text) => ({ type: "add" as const, text }));
  }
  return diffLines(before, contents);
}

export function hunksFromDelete(contents: string): HunkLine[] {
  return splitLines(contents)
    .slice(0, MAX_HUNK_LINES)
    .map((text) => ({ type: "del" as const, text }));
}

function naiveOps(a: string[], b: string[]): HunkLine[] {
  return [
    ...a.map((text) => ({ type: "del" as const, text })),
    ...b.map((text) => ({ type: "add" as const, text })),
  ];
}

function lcsOps(a: string[], b: string[]): HunkLine[] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  // table[i][j] = LCS length of a[i:] and b[j:]
  const table = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const ops: HunkLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "ctx", text: a[i] ?? "" });
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      ops.push({ type: "del", text: a[i] ?? "" });
      i += 1;
    } else {
      ops.push({ type: "add", text: b[j] ?? "" });
      j += 1;
    }
  }
  for (; i < n; i += 1) ops.push({ type: "del", text: a[i] ?? "" });
  for (; j < m; j += 1) ops.push({ type: "add", text: b[j] ?? "" });
  return ops;
}

function withContext(ops: HunkLine[]): HunkLine[] {
  const keep = new Uint8Array(ops.length);
  for (let k = 0; k < ops.length; k += 1) {
    if (ops[k]?.type === "ctx") continue;
    for (let c = Math.max(0, k - CONTEXT); c <= Math.min(ops.length - 1, k + CONTEXT); c += 1) keep[c] = 1;
  }
  const out: HunkLine[] = [];
  let skipping = false;
  for (let k = 0; k < ops.length; k += 1) {
    const op = ops[k];
    if (!op) continue;
    if (keep[k]) {
      if (skipping && out.length) out.push(GAP);
      skipping = false;
      out.push(op);
    } else skipping = true;
  }
  return out;
}
