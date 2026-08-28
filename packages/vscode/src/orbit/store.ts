import { MAX_HUNK_LINES, type HunkLine } from "@laika/core";

export type HeatKind = "idle" | "read" | "add" | "del" | "mix";

export type OrbitFile = {
  path: string;
  plus: number;
  minus: number;
  kind: HeatKind;
  live: boolean;
  badge?: "new" | "gone";
  preview: string[];
  hunks: HunkLine[];
};

export type EditFlags = { created?: boolean; deleted?: boolean; hunks?: HunkLine[] };

export class OrbitStore {
  readonly files = new Map<string, OrbitFile>();
  livePath: string | undefined;
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  snapshot(): { files: OrbitFile[]; livePath?: string } {
    const files = [...this.files.values()];
    if (this.livePath !== undefined) return { files, livePath: this.livePath };
    return { files };
  }

  markRead(path: string) {
    const current = this.files.get(path);
    if (current && current.kind !== "read") return;
    this.files.set(path, {
      path,
      plus: 0,
      minus: 0,
      kind: "read",
      live: false,
      preview: current?.preview ?? [],
      hunks: current?.hunks ?? [],
    });
    this.emit();
  }

  /**
   * Record one mutation. Edits to a file already changed this session accumulate (counts add up,
   * hunks append) so the row shows the file's complete change; a create or delete starts over.
   */
  markEdit(path: string, plus: number, minus: number, preview: string[], flags: EditFlags = {}) {
    const prev = this.files.get(path);
    const gone = Boolean(flags.deleted);
    const base = prev && prev.kind !== "read" && prev.badge !== "gone" && !gone && !flags.created ? prev : undefined;
    const incoming: HunkLine[] = flags.hunks?.length
      ? flags.hunks
      : preview.map((text) => ({ type: gone ? "del" : "add", text }));
    const hunks = (base ? [...base.hunks, ...incoming] : incoming).slice(0, MAX_HUNK_LINES);
    const totalPlus = gone ? 0 : (base?.plus ?? 0) + plus;
    const totalMinus = gone ? Math.max(minus, 1) : (base?.minus ?? 0) + minus;
    const kind: HeatKind = gone || totalMinus > totalPlus ? "del" : totalPlus && totalMinus ? "mix" : "add";
    const row: OrbitFile = {
      path,
      plus: totalPlus,
      minus: totalMinus,
      kind,
      live: true,
      preview: preview.length ? preview.slice(0, 40) : (prev?.preview ?? []),
      hunks,
    };
    if (flags.created || base?.badge === "new") row.badge = "new";
    if (gone) row.badge = "gone";
    this.files.set(path, row);
    this.livePath = path;
    const timer = this.timers.get(path);
    if (timer) clearTimeout(timer);
    this.timers.set(
      path,
      setTimeout(() => {
        const latest = this.files.get(path);
        if (latest) latest.live = false;
        if (this.livePath === path) this.livePath = undefined;
        this.emit();
      }, 1600),
    );
    this.emit();
  }
}
