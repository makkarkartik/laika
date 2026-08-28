export type Bucket = { id: string; label: string; parent: string };

export type BucketMap = {
  of: Map<string, string>;
  order: Bucket[];
};

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function fileKind(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (/\.(test|spec)\.[^.]+$/.test(name)) return "tests";
  if (/(^|\/)(__tests__|tests?)\//.test(path)) return "tests";
  if (/\.(md|mdx|rst)$/.test(name) || /(^|\/)docs\//.test(path)) return "docs";
  const stem = name.replace(/\.[^.]+$/, "");
  if (/^(config|env|settings)$/.test(stem) || /\.config\./.test(name)) return "config";
  if (/^(package|tsconfig|jsconfig|cargo|pyproject|go|makefile|dockerfile|procfile)$/.test(stem)) return "config";
  if (!path.includes("/") && /\.(json|ya?ml|toml|ini|lock)$/.test(name)) return "config";
  return null;
}

function analyzeTree(paths: string[]) {
  const filesAt = new Map<string, string[]>([["", []]]);
  const children = new Map<string, Set<string>>([["", new Set()]]);
  const ensure = (dir: string) => {
    if (!filesAt.has(dir)) filesAt.set(dir, []);
    if (!children.has(dir)) children.set(dir, new Set());
  };
  for (const path of paths) {
    const parts = path.split("/");
    parts.pop();
    let prefix = "";
    for (const part of parts) {
      ensure(prefix);
      children.get(prefix)?.add(part);
      prefix = prefix ? `${prefix}/${part}` : part;
      ensure(prefix);
    }
    ensure(prefix);
    filesAt.get(prefix)?.push(path);
  }
  return { filesAt, children };
}

function describeBucket(id: string): Bucket {
  if (!id.includes("/")) return { id, label: id, parent: "" };
  const i = id.lastIndexOf("/");
  return { id, label: id.slice(i + 1), parent: id.slice(0, i + 1) };
}

/** Same inference as the locked Orbit prototype. */
export function inferBuckets(paths: string[]): BucketMap {
  const { filesAt, children } = analyzeTree(paths);
  const isNamespace = (dir: string) => (filesAt.get(dir) || []).length === 0 && (children.get(dir) || new Set()).size >= 1;
  const thick = new Set<string>();
  for (const [dir, kids] of children) {
    if (!dir || isNamespace(dir)) continue;
    for (const kid of kids) {
      const prefix = `${dir}/${kid}`;
      const n = paths.filter((path) => dirname(path) === prefix).length;
      if (n >= 3) thick.add(prefix);
    }
  }

  const of = new Map<string, string>();
  const first = new Map<string, number>();
  for (const [i, path] of paths.entries()) {
    const kind = fileKind(path);
    let id = kind;
    if (!id) {
      const parts = path.split("/");
      if (parts.length === 1) id = "root";
      else if (isNamespace(parts[0] ?? "")) id = `${parts[0]}/${parts[1]}`;
      else {
        const nested = `${parts[0]}/${parts[1]}`;
        id = thick.has(nested) ? nested : (parts[0] ?? "root");
      }
    }
    of.set(path, id);
    if (!first.has(id)) first.set(id, i);
  }
  const kindRank: Record<string, number> = { tests: 1, config: 2, docs: 3 };
  const order = [...first.keys()]
    .sort((a, b) => {
      const ka = kindRank[a] ?? 0;
      const kb = kindRank[b] ?? 0;
      if (ka !== kb) return ka - kb;
      return (first.get(a) ?? 0) - (first.get(b) ?? 0);
    })
    .map(describeBucket);
  return { of, order };
}
